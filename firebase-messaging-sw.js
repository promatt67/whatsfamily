importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Inserisci qui le credenziali della tua configurazione Firebase
firebase.initializeApp({
  apiKey: "LA_TUA_API_KEY",
  authDomain: "IL_TUO_PROJECT_ID.firebaseapp.com",
  projectId: "IL_TUO_PROJECT_ID",
  storageBucket: "IL_TUO_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "IL_TUO_MESSAGING_SENDER_ID",
  appId: "IL_TUO_APP_ID"
});

const messaging = firebase.messaging();

// Gestione messaggi quando l'app è chiusa o in background su Android
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Notifica in background:', payload);
  
  const notificationTitle = payload.notification?.title || 'WhatsFamily';
  const notificationOptions = {
    body: payload.notification?.body || 'Nuovo messaggio in arrivo!',
    icon: './icon001.png' // Usa la tua icona presente nel repo
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
