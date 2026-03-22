import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cron from 'node-cron';
import nodeIcal from 'node-ical';
import icalGenerator from 'ical-generator';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, Timestamp } from 'firebase/firestore';
import fs from 'fs';
import formData from 'form-data';
import Mailgun from 'mailgun.js';

// Read Firebase config from file
const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig: any = null;
if (fs.existsSync(firebaseConfigPath)) {
  firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));
} else {
  console.warn('firebase-applet-config.json not found. Firebase will not be initialized.');
}

let db: any = null;
if (firebaseConfig) {
  const appFirebase = initializeApp(firebaseConfig);
  db = getFirestore(appFirebase, firebaseConfig.firestoreDatabaseId);
}

// Initialize Mailgun (lazy init to avoid crash if key is missing)
let mailgunClient: any = null;
function getMailgun() {
  if (!mailgunClient && process.env.MAILGUN_API_KEY) {
    const mailgun = new Mailgun(formData);
    mailgunClient = mailgun.client({
      username: 'api',
      key: process.env.MAILGUN_API_KEY,
    });
  }
  return mailgunClient;
}

async function syncICalFeeds() {
  if (!db) return;
  console.log('Starting iCal sync...');
  try {
    const listingsSnap = await getDocs(collection(db, 'listings'));
    for (const listingDoc of listingsSnap.docs) {
      const listing = listingDoc.data();
      const listingId = listingDoc.id;
      const icalUrls = listing.icalUrls || [];

      if (icalUrls.length === 0) continue;

      const externalBookingsRef = collection(db, 'external_bookings');
      
      // Fetch existing external bookings for this listing
      const q = query(externalBookingsRef, where('listingId', '==', listingId));
      const existingSnap = await getDocs(q);
      const existingBookings = new Map();
      existingSnap.forEach(doc => {
        existingBookings.set(doc.data().uid, doc.id);
      });

      const currentUids = new Set();

      for (const url of icalUrls) {
        try {
          const events = await nodeIcal.async.fromURL(url);
          for (const key in events) {
            const event = events[key];
            if (event.type === 'VEVENT') {
              const uid = event.uid;
              currentUids.add(uid);
              
              const startDate = event.start ? Timestamp.fromDate(new Date(event.start)) : null;
              const endDate = event.end ? Timestamp.fromDate(new Date(event.end)) : null;
              
              if (!startDate || !endDate) continue;

              const bookingData = {
                listingId,
                uid,
                summary: event.summary || 'External Booking',
                startDate,
                endDate,
                sourceUrl: url,
                updatedAt: Timestamp.now()
              };

              if (existingBookings.has(uid)) {
                // Update existing
                await updateDoc(doc(db, 'external_bookings', existingBookings.get(uid)), bookingData);
              } else {
                // Add new
                await addDoc(externalBookingsRef, bookingData);
              }
            }
          }
        } catch (err) {
          console.error(`Error fetching iCal from ${url}:`, err);
        }
      }

      // Delete external bookings that no longer exist in the feeds
      for (const [uid, docId] of existingBookings.entries()) {
        if (!currentUids.has(uid)) {
          await deleteDoc(doc(db, 'external_bookings', docId));
        }
      }
    }
    console.log('iCal sync completed.');
  } catch (err) {
    console.error('Error during iCal sync:', err);
  }
}

// Schedule cron job to run every 30 minutes
cron.schedule('*/30 * * * *', () => {
  syncICalFeeds();
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Endpoint to send booking confirmation emails
  app.post('/api/send-email', async (req, res) => {
    try {
      const mg = getMailgun();
      if (!mg) {
        console.warn('MAILGUN_API_KEY is missing. Skipping email sending.');
        return res.status(200).json({ success: true, warning: 'Email skipped (no API key)' });
      }

      const { to, subject, html } = req.body;
      if (!to || !subject || !html) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const domain = process.env.MAILGUN_DOMAIN || 'sandbox-your-domain.mailgun.org';
      const fromEmail = process.env.MAILGUN_FROM_EMAIL || `Excited User <mailgun@${domain}>`;

      // Mailgun expects 'to' to be a comma-separated string or an array
      const toAddresses = Array.isArray(to) ? to : [to];

      const data = await mg.messages.create(domain, {
        from: fromEmail,
        to: toAddresses,
        subject,
        html,
      });
      console.log(data)
      res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(500).json({ error: 'Failed to send email' });
    }
  });

  // Export endpoint for internal bookings
  app.get('/api/:propertyId-calendar.ics', async (req, res) => {
    try {
      const propertyId = req.params.propertyId;
      
      // Verify listing exists
      const qListing = query(collection(db, 'listings'));
      const listingsSnap = await getDocs(qListing);
      let listingExists = false;
      let listingName = 'Property';
      listingsSnap.forEach(doc => {
        if (doc.id === propertyId) {
          listingExists = true;
          listingName = doc.data().title;
        }
      });

      if (!listingExists) {
        return res.status(404).send('Listing not found');
      }
      const cal = icalGenerator.default({ name: `${listingName} Calendar` });

      // Fetch internal bookings
      const qBookings = query(collection(db, 'bookings'), where('listingId', '==', propertyId));
      const bookingsSnap = await getDocs(qBookings);
      
      bookingsSnap.forEach(b => {
        const data = b.data();
        if (data.status === 'confirmed' || data.status === 'pending') {
          const getCorrectDateString = (timestamp: any) => {
            const date = timestamp.toDate();
            let year = date.getUTCFullYear();
            let month = date.getUTCMonth();
            let day = date.getUTCDate();
            
            // If the time is >= 12:00 UTC, the user was likely in a timezone east of UTC
            // and the intended date was the next day in UTC.
            // New bookings are saved at exactly 00:00 UTC, so they won't be affected.
            if (date.getUTCHours() >= 12) {
              day += 1;
            }
            
            const correctedDate = new Date(Date.UTC(year, month, day));
            return correctedDate.toISOString().split('T')[0];
          };

          const startStr = getCorrectDateString(data.startDate);
          const endStr = getCorrectDateString(data.endDate);
          
          // For all-day events, the end date is exclusive in iCal,
          // so we need to add 1 day to the checkout date.
          const endObj = new Date(endStr);
          endObj.setUTCDate(endObj.getUTCDate() + 1);
          const endStrExclusive = endObj.toISOString().split('T')[0];

          cal.createEvent({
            start: startStr,
            end: endStrExclusive,
            allDay: true,
            summary: `Direct Booking: ${data.guestName}`,
            description: `Guests: ${data.numberOfGuests}\nPhone: ${data.phoneNumber}`,
            id: b.id
          });
        }
      });

      res.writeHead(200, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${propertyId}-calendar.ics"`
      });
      res.end(cal.toString());
    } catch (err) {
      console.error('Error generating iCal:', err);
      res.status(500).send('Internal Server Error');
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Run initial sync on startup
    syncICalFeeds();
  });
}

startServer();

export default syncICalFeeds;
