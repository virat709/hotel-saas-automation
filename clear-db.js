require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

let serviceAccountStr = process.env.FIREBASE_ADMIN_CREDENTIALS;
if (!serviceAccountStr) {
  console.error("No FIREBASE_ADMIN_CREDENTIALS found in .env.local");
  process.exit(1);
}

// Fix double-escaped newlines in the private key
serviceAccountStr = serviceAccountStr.replace(/\\\\n/g, '\\n');
const serviceAccount = JSON.parse(serviceAccountStr);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function deleteCollection(collectionPath) {
  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.get();

  if (snapshot.size === 0) {
    console.log(`Collection ${collectionPath} is already empty.`);
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(`Deleted ${snapshot.size} documents from ${collectionPath}.`);
}

async function deleteAuthUsers() {
  let nextPageToken;
  let totalDeleted = 0;
  do {
    const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
    const uids = listUsersResult.users.map((userRecord) => userRecord.uid);
    if (uids.length > 0) {
      await admin.auth().deleteUsers(uids);
      totalDeleted += uids.length;
    }
    nextPageToken = listUsersResult.pageToken;
  } while (nextPageToken);
  if (totalDeleted > 0) {
    console.log(`Deleted ${totalDeleted} users from Firebase Auth.`);
  } else {
    console.log("Firebase Auth is already empty.");
  }
}

async function clearAll() {
  console.log("Erasing database and auth users...");
  await deleteAuthUsers();
  await deleteCollection('users');
  await deleteCollection('hotels');
  await deleteCollection('orders');
  await deleteCollection('ratings');
  console.log("✅ Database and Auth cleared successfully! You can start fresh.");
  process.exit(0);
}

clearAll().catch(console.error);
