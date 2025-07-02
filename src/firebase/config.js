// Firebase Configuration for FlowGenius
const { initializeApp } = require('firebase/app');
const { getAuth } = require('firebase/auth');
const { getFirestore } = require('firebase/firestore');
const { getStorage } = require('firebase/storage');

// Your Firebase config - FlowGenius AI Project
const firebaseConfig = {
  apiKey: "AIzaSyAA691tCsE_IRwICzhhetMJ4wwosRa6Vd4",
  authDomain: "flowgeniusai.firebaseapp.com",
  projectId: "flowgeniusai",
  storageBucket: "flowgeniusai.firebasestorage.app",
  messagingSenderId: "953752879367",
  appId: "1:953752879367:web:aa7fad7cc74444a69105a2",
  measurementId: "G-CD0VTNHEV2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

module.exports = {
  app,
  auth,
  db,
  storage,
  firebaseConfig
}; 