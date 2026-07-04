/*
 * Paste your Firebase project's config here (Project Settings → General →
 * "Your apps" → Web app → SDK setup and configuration → Config).
 * See README.md "Nâng cấp lên Firebase" for step-by-step instructions.
 */
const firebaseConfig = {
  apiKey: "AIzaSyD-R2cQb-EI4I8wy60z1tuShIXny39Rawc",
  authDomain: "pshop-music.firebaseapp.com",
  databaseURL: "https://pshop-music-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pshop-music",
  storageBucket: "pshop-music.firebasestorage.app",
  messagingSenderId: "241363789627",
  appId: "1:241363789627:web:1698a9b6d26c33d94ff91e"
};

if (firebaseConfig.apiKey === "YOUR_API_KEY") {
  console.warn('Chưa cấu hình Firebase — sửa js/firebase-config.js với thông tin project thật của bạn.');
}

firebase.initializeApp(firebaseConfig);
