// ==========================================
// 1. IMPORTAZIONE SDK FIREBASE MESSAGING (Compat)
// ==========================================
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Inizializzazione Firebase nel Service Worker per Notifiche Background
firebase.initializeApp({
  apiKey: "AIzaSyCMBZjMytN2Q9M6P1iT4vMx4q7y_nVgK8w",
  authDomain: "whatsfamily-d8aa6.firebaseapp.com",
  projectId: "whatsfamily-d8aa6",
  storageBucket: "whatsfamily-d8aa6.firebasestorage.app",
  messagingSenderId: "414240543274",
  appId: "1:414240543274:web:c9979a6dd3433af8e9a953"
});

const messaging = firebase.messaging();

// Gestione messaggi notifiche in Background (App chiusa o ridotta a icona)
messaging.onBackgroundMessage((payload) => {
  console.log('[service-worker.js] Notifica ricevuta in background:', payload);

  const title = payload.notification?.title || "WhatsFamily 🏡";
  const options = {
    body: payload.notification?.body || "Nuovo messaggio ricevuto",
    icon: './icon001.png',
    badge: './icon001.png',
    data: payload.data || {},
    tag: 'whatsfamily-msg',
    renotify: true
  };

  self.registration.showNotification(title, options);
});

// ==========================================
// 2. CACHE SETTINGS & ASSETS (Incluso app.js!)
// ==========================================
const CACHE_NAME = 'whatsfamily-v2.6';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon001.png'
];

// ==========================================
// 3. INSTALL
// ==========================================
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
  );
});

// ==========================================
// 4. ASCOLTA IL COMANDO "SKIP_WAITING"
// ==========================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ==========================================
// 5. ACTIVATE + ELIMINAZIONE VECCHIE CACHE
// ==========================================
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ==========================================
// 6. FETCH: NETWORK-FIRST CON FALLBACK SU CACHE
// ==========================================
self.addEventListener('fetch', (e) => {
  // Ignora le richieste non-GET
  if (e.request.method !== 'GET') {
    return;
  }

  const url = e.request.url;

  // Ignora le chiamate API Firebase/Firestore e schemi non-http(s)
  if (
    !url.startsWith('http') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('firebaseio.com') ||
    url.includes('identitytoolkit') ||
    url.includes('firebasestorage.googleapis.com') ||
    url.includes('fcm.googleapis.com')
  ) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(e.request);
      })
  );
});

// ==========================================
// 7. NOTIFICATION CLICK HANDLER
// ==========================================
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Se c'è già una scheda dell'app aperta, portala in primo piano
        for (const client of clientList) {
          if ('focus' in client) {
            return client.focus();
          }
        }
        // Altrimenti apri una nuova finestra dell'app
        if (self.clients.openWindow) {
          return self.clients.openWindow('./');
        }
      })
  );
});
