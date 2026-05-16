import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, getToken } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

console.log('Firebase Config Loaded:', {
  apiKey: firebaseConfig.apiKey ? 'Present' : 'MISSING',
  projectId: firebaseConfig.projectId,
});

// Avoid crashing during Netlify/Vercel build step if env variables are missing
const app = getApps().length === 0 && firebaseConfig.apiKey
  ? initializeApp(firebaseConfig)
  : getApps().length > 0 ? getApps()[0] : undefined;

export const auth = app ? getAuth(app) : null as any;
export const db = app ? getFirestore(app) : null as any;

// Initialize Firebase Cloud Messaging and get a reference to the service
export const messaging = typeof window !== 'undefined' && app ? getMessaging(app) : null;

export const requestNotificationPermission = async () => {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted' && messaging) {
        console.log('Notification permission granted.');
        // VAPID key is usually required here, but we'll try without it if the user hasn't provided one.
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY;
        const currentToken = await getToken(messaging, vapidKey ? { vapidKey } : undefined);
        if (currentToken) {
          return currentToken;
        } else {
          console.log('No registration token available. Request permission to generate one.');
          return null;
        }
      }
    } catch (err) {
      console.error('An error occurred while retrieving token. ', err);
    }
  }
  return null;
};

export default app;
