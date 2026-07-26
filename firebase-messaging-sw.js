importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Inserisci qui le credenziali della tua configurazione Firebase
firebase.initializeApp({
  apiKey: "AIzaSyCMBZjMytN2Q9M6P1iT4vMx4q7y_nVgK8w", 
    authDomain: "whatsfamily-d8aa6.firebaseapp.com", 
    projectId: "whatsfamily-d8aa6", 
    storageBucket: "whatsfamily-d8aa6.firebasestorage.app", 
    messagingSenderId: "414240543274", 
    appId: "1:414240543274:web:c9979a6dd3433af8e9a953"
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
