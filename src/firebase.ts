import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCyyG8ELDWDzWfyxhZBggRoIQ4taDIO-nk",
  authDomain: "danielo-s-project-524d0.firebaseapp.com",
  projectId: "danielo-s-project-524d0",
  storageBucket: "danielo-s-project-524d0.firebasestorage.app",
  messagingSenderId: "728041872480",
  appId: "1:728041872480:web:49fbba681bb32aa22eb705",
  measurementId: "G-FF4GP5L2Z0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
