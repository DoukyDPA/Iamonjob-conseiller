// 1. On importe les fonctions nécessaires depuis le SDK Firebase
import { initializeApp } from "firebase/app";

// Ajoutez ces imports si vous utilisez l'Authentification ou la Base de données (Firestore)
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// AJOUTEZ CETTE LIGNE ICI :
console.log("Mon API Key est :", import.meta.env.VITE_API_KEY);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  // ...
};

// 2. Configuration utilisant les variables d'environnement (Vite/Vercel)
// Cela remplace votre ancien "__firebase_config" qui ne marchait pas
const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID
};

// 3. Initialisation de l'application
const app = initializeApp(firebaseConfig);

// 4. Initialisation des services (Auth et Firestore)
// Cela permet de les importer facilement dans vos autres fichiers (ex: import { auth } from './firebase')
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
