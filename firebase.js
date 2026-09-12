import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCwfaMnEhtTGQbdLq8PUN65o_-B5RhZ_1c',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'roomexpenses2.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'roomexpenses2',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'roomexpenses2.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '63951491516',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:63951491516:web:e3beaf2b65248484c79bb9',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
let auth;
try { auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) }); } catch { auth = getAuth(app); }

export { auth };
export const db = getFirestore(app);