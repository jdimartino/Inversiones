import { initializeApp } from "firebase/app";
import {
    getFirestore,
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    setDoc,
    getDoc,
    onSnapshot,
    query,
    Firestore,
    DocumentData,
} from "firebase/firestore";

const firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: "micriptoapp.firebaseapp.com",
    projectId: "micriptoapp",
    storageBucket: "micriptoapp.firebasestorage.app",
    messagingSenderId: "1094343839118",
    appId: "1:1094343839118:web:4cf161de183507889ba8df",
    measurementId: "G-CWEKWBNZLG",
};

const app = initializeApp(firebaseConfig);
const db: Firestore = getFirestore(app);

/** Base URL for Firebase Cloud Functions — derived from projectId. */
export const FIREBASE_FUNCTIONS_URL = `https://europe-west1-${firebaseConfig.projectId}.cloudfunctions.net`;

export { db, collection, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, onSnapshot, query };
export type { DocumentData };
