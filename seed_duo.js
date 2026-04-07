import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import fs from 'fs';

const configData = fs.readFileSync('firebase-applet-config.json', 'utf8');
const firebaseConfig = JSON.parse(configData);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

const prefixes = ["Fas", "ANR", "ANE", "Neo", "Zen", "Sky", "Rex", "Max", "Jon", "Sam", "Pro", "Cyber", "Mega"];
const suffixes = ["", "12", "99", "X", "Pro", "Z", "88", "Bot", "God", "01"];

async function run() {
  try {
    await signInAnonymously(auth);
    console.log("Authenticated anonymously");
    
    const CYCLE_HOURS = 18;
    const EPOCH = new Date('2024-01-01T00:00:00Z').getTime();
    const currentCycle = Math.floor((Date.now() - EPOCH) / (CYCLE_HOURS * 60 * 60 * 1000));

    for (let phase = 0; phase < 2; phase++) {
      const isDaily = phase === 0;
      const collectionName = isDaily ? 'duo_daily_scores' : 'duo_quickplay_scores';
      const mode = isDaily ? 'duo' : 'duo-quickplay';

      for (let i = 0; i < 120; i++) {
          const name = prefixes[Math.floor(Math.random() * prefixes.length)] + 
                       suffixes[Math.floor(Math.random() * suffixes.length)] + 
                       Math.floor(Math.random() * 99);
          const randomScore = Number((50 + Math.random() * 49).toFixed(2));
          await addDoc(collection(db, collectionName), {
            sessionId: `seeded_${i}_${Date.now()}`,
            createdAt: serverTimestamp(),
            period: currentCycle,
            score: randomScore,
            mode: mode,
            deviceType: 'desktop',
            userId: 'seeded_bot_duo',
            userType: 'returning',
            name: name,
            isPosted: true
          });
      }
      console.log(`Added 120 players to ${collectionName}`);
    }
    console.log("Done");
    process.exit(0);
  } catch(e) {
    console.error("Error", e);
    process.exit(1);
  }
}
run();
