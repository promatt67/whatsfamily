importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Inizializzazione Firebase nel Service Worker
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
  console.log('[firebase-messaging-sw.js] Ricevuta notifica in background:', payload);

  const data = payload.data || {};
  const notificationTitle = data.title || "Nuovo messaggio";
  
  const notificationOptions = {
    body: data.body || "Hai un nuovo messaggio in WhatsFamily",
    icon: data.icon || './icon001.png',
    badge: './icon001.png',
    vibrate: [200, 100, 200], // Vibrazione
    requireInteraction: true,  // Mantiene la notifica visibile finché l'utente non la tocca
    tag: data.chatId || 'whatsfamily-notification', // Raggruppa le notifiche della stessa chat
    data: {
      chatId: data.chatId,
      messageId: data.messageId,
      url: './index.html'
    }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// GESTIONE CLICK SULLA NOTIFICA
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notifica cliccata:', event.notification);

  // Chiude la notifica dalla tendina
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || './index.html', self.location.origin).href;

  // Cerca se l'app è già aperta in una scheda o finestra e la porta in primo piano
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Se l'app era completamente chiusa, la apre in una nuova scheda/finestra PWA
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
