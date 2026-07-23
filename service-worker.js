// ==========================================
// 1. IMPORTAZIONE SDK FIREBASE (Compat)
// ==========================================
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js');

// Inizializzazione Firebase nel Service Worker per Notifiche e Firestore Background
firebase.initializeApp({
  apiKey: "AIzaSyCMBZjMytN2Q9M6P1iT4vMx4q7y_nVgK8w",
  authDomain: "whatsfamily-d8aa6.firebaseapp.com",
  projectId: "whatsfamily-d8aa6",
  storageBucket: "whatsfamily-d8aa6.appspot.com",
  messagingSenderId: "367399335606",
  appId: "1:367399335606:web:658c14d9b4dbcb18ceb52c"
});

const db = firebase.firestore();
const messaging = firebase.messaging();

// Cache statici
const CACHE_NAME = 'whatsfamily-v2.8';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Installazione Service Worker e Caching
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Attivazione e pulizia vecchie cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Gestione Notifiche in Background e aggiornamento Doppia Spunta Grigia (Delivered)
messaging.onBackgroundMessage((payload) => {
  console.log('[service-worker.js] Notifica ricevuta in background:', payload);

  const data = payload.data || {};
  const chatId = data.chatId;
  const messageId = data.messageId;

  // Se la notifica contiene i dati del messaggio, aggiorniamo lo stato a 'delivered' su Firestore
  if (chatId && messageId) {
    db.collection('chats')
      .doc(chatId)
      .collection('messages')
      .doc(messageId)
      .update({ status: 'delivered' })
      .then(() => {
        console.log(`[service-worker.js] Stato messaggio ${messageId} aggiornato a DELIVERED`);
      })
      .catch((error) => {
        console.error('[service-worker.js] Errore aggiornamento stato delivered:', error);
      });
  }

  const notificationTitle = payload.notification?.title || data.title || 'Nuovo Messaggio';
  const notificationOptions = {
    body: payload.notification?.body || data.body || 'Hai ricevuto un messaggio',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: chatId || 'whatsfamily-notification',
    data: data
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Click sulla notifica
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
