import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import fs from 'fs';

const configData = fs.readFileSync('firebase-applet-config.json', 'utf8');
const firebaseConfig = JSON.parse(configData);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

async function run() {
  try {
    await signInAnonymously(auth);
    console.log("Authenticated anonymously");

    const collections = [
      'classic_daily_scores',
      'classic_quickplay_scores',
      'duo_daily_scores',
      'duo_quickplay_scores'
    ];

    const historyCollections = [
      'classic_history',
      'duo_history'
    ];

    const days = 4;
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    const stats = {};

    for (let i = 0; i < days; i++) {
        const startOfDay = new Date(now);
        startOfDay.setDate(now.getDate() - i);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(now);
        endOfDay.setDate(now.getDate() - i);
        endOfDay.setHours(23, 59, 59, 999);

        const dateStr = startOfDay.toISOString().split('T')[0];
        stats[dateStr] = {};

        for (const collName of collections) {
            const q = query(
                collection(db, collName),
                where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
                where('createdAt', '<=', Timestamp.fromDate(endOfDay))
            );
            const snapshot = await getDocs(q);
            const userIds = new Set();
            snapshot.forEach(doc => {
                userIds.add(doc.data().userId);
            });
            stats[dateStr][collName] = {
                totalEntries: snapshot.size,
                uniqueUsers: userIds.size
            };
        }

        for (const collName of historyCollections) {
            const q = query(
                collection(db, collName),
                where('timestamp', '>=', Timestamp.fromDate(startOfDay)),
                where('timestamp', '<=', Timestamp.fromDate(endOfDay))
            );
            const snapshot = await getDocs(q);
            const userIds = new Set();
            snapshot.forEach(doc => {
                userIds.add(doc.data().userId);
            });
            stats[dateStr][collName] = {
                totalEntries: snapshot.size,
                uniqueUsers: userIds.size
            };
        }
    }

    console.log(JSON.stringify(stats, null, 2));
    process.exit(0);
  } catch (e) {
    console.error("Error", e);
    process.exit(1);
  }
}

run();
