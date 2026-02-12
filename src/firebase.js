import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyAIItpT-SoHxB2Y6jhGtUmy2o6s2z_HiAM",
  authDomain: "home-search-hq.firebaseapp.com",
  projectId: "home-search-hq",
  storageBucket: "home-search-hq.firebasestorage.app",
  messagingSenderId: "631504248905",
  appId: "1:631504248905:web:d4fbdc6f73580904445f98"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);

export const extractListingFn = httpsCallable(functions, "extractListing");
export const getCommuteFn = httpsCallable(functions, "getCommute");