import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  try {
    const listingsSnap = await getDocs(collection(db, 'listings'));
    const listings = [];
    listingsSnap.forEach(doc => {
      listings.push({ id: doc.id, ...doc.data() });
    });

    console.log(`Found ${listings.length} listings.`);

    for (const listing of listings) {
      console.log(`\nListing: ${listing.title} (ID: ${listing.id})`);
      const q = query(collection(db, 'external_bookings'), where('listingId', '==', listing.id));
      const externalSnap = await getDocs(q);
      const externalBookings = [];
      externalSnap.forEach(doc => {
        externalBookings.push({ id: doc.id, ...doc.data() });
      });

      console.log(`Found ${externalBookings.length} external bookings:`);
      externalBookings.forEach(b => {
        console.log(`- Summary: ${b.summary}`);
        console.log(`  Start: ${b.startDate?.toDate()}`);
        console.log(`  End: ${b.endDate?.toDate()}`);
        console.log(`  Source: ${b.sourceUrl}`);
      });
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
