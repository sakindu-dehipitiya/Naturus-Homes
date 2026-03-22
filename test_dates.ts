import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const id = 'zyU23G4WvI70uwk4fHWr'; // The Hub Panadura
  const qExternalBookings = query(collection(db, 'external_bookings'), where('listingId', '==', id));
  const externalSnap = await getDocs(qExternalBookings);
  const dates = [];
  externalSnap.forEach(b => {
    const data = b.data();
    if (data.startDate && data.endDate) {
      const start = data.startDate.toDate();
      const end = data.endDate.toDate();
      let current = new Date(start);
      while (current <= end) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
    }
  });

  console.log("Booked dates:");
  dates.filter(d => d.getMonth() === 3 || d.getMonth() === 4).forEach(d => {
    console.log(d.toISOString(), d.toDateString());
  });
  process.exit(0);
}

run();
