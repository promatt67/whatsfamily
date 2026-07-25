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
  storageBucket: "whatsfamily-d8aa6.firebasestorage.app",
  messagingSenderId: "414240543274",
  appId: "1:414240543274:web:c9979a6dd3433af8e9a953"
});

const db = firebase.firestore();
const messaging = firebase.messaging();

// Cache statici (incrementa il numero di versione ad ogni modifica importante)
const CACHE_NAME = 'whatsfamily-v4.0';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon001.png'
];

// ==========================================
// 2. CICLO DI VITA SERVICE WORKER
// ==========================================

// Installazione Service Worker e Caching (SENZA self.skipWaiting automatico)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        urlsToCache.map(url =>
          cache.add(url).catch(err => {
            console.warn(`[service-worker.js] Impossibile mettere in cache ${url}:`, err);
          })
        )
      );
    })
  );
});

// Attivazione e pulizia vecchie cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      );
    }).then(() => self.clients.claim())
  );
});

// Gestione messaggi inviati da app.js (es. pulsante "Aggiorna 🚀")
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ==========================================
// 3. RECUPERO RISORSE (OFFLINE CACHE)
// ==========================================
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ==========================================
// 4. NOTIFICHE PUSH IN BACKGROUND (SCHERMO SPENTO)
// ==========================================
messaging.onBackgroundMessage((payload) => {
  console.log('[service-worker.js] Notifica ricevuta in background:', payload);

  const data = payload.data || {};
  const chatId = data.chatId;
  const messageId = data.messageId;

  // Se la notifica contiene i dati del messaggio, aggiorniamo il campo 'consegnato' su Firestore
  if (chatId && messageId) {
    db.collection('chats')
      .doc(chatId)
      .collection('messages')
      .doc(messageId)
      .update({ consegnato: true })
      .then(() => {
        console.log(`[service-worker.js] Stato messaggio ${messageId} aggiornato a CONSEGNATO`);
      })
      .catch((error) => {
        console.error('[service-worker.js] Errore aggiornamento consegnato:', error);
      });
  }

  const notificationTitle = payload.notification?.title || data.title || '💬 WhatsFamily 🏡';
  const notificationOptions = {
    body: payload.notification?.body || data.body || 'Hai ricevuto un nuovo messaggio di famiglia',
    icon: './icon001.png',
    badge: './icon001.png',
    tag: chatId || 'whatsfamily-notification',
    renotify: true,
    data: data
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Click sulla notifica a schermo spento / bloccato
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
        return clients.openWindow('./');
      }
    })
  );
});
