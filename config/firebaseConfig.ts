import { getApps, initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database"; 

const firebaseConfig = {
  apiKey: "AIzaSyCgXZegFdu02rhzI90DD1a1by0CidEaG5g",
  authDomain: "dong-ho-dien-tu-daktdt.firebaseapp.com",
  databaseURL: "https://dong-ho-dien-tu-daktdt-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dong-ho-dien-tu-daktdt",
  storageBucket: "dong-ho-dien-tu-daktdt.firebasestorage.app",
  messagingSenderId: "819461553003",
  appId: "1:819461553003:web:05309c5551300131e6aa2e",
  measurementId: "G-XY5WS9JDDH"
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);