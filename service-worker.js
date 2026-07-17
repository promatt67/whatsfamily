const CACHE_NAME = 'whatsfamily-v2'; // Aggiornata versione cache per forzare aggiornamento sui telefoni
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon001.png'
];

// Installa il Service Worker e salva in cache i file principali
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Attiva e pulisci le vecchie cache
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

// Rispondi con i file in cache se offline, altrimenti rete
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});

// Gestione dei click sulle notifiche quando l'app è spenta/in standby
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se l'app è già aperta, la mettiamo in primo piano
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // Altrimenti la riapriamo da zero
      if (self.clients.openWindow) {
        return self.clients.openWindow('./index.html');
      }
    })
  );
});

// ==========================================
// INTEGRATION DI FIREBASE MESSAGING IN BACKGROUND 🔔
// ==========================================
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Configurazione Firebase identica al tuo index.html
const firebaseConfig = {
    apiKey: "AIzaSyCMBZjMytN2Q9M6P1iT4vMx4q7y_nVgK8w",
    authDomain: "whatsfamily-d8aa6.firebaseapp.com",
    projectId: "whatsfamily-d8aa6",
    storageBucket: "whatsfamily-d8aa6.firebasestorage.app",
    messagingSenderId: "414240543274",
    appId: "1:414240543274:web:c9979a6dd3433af8e9a953"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Gestisce la notifica quando l'app è chiusa o in background
messaging.onBackgroundMessage((payload) => {
    console.log('[service-worker.js] Ricevuto messaggio in background: ', payload);

    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: './icon001.png',
        badge: './icon001.png',
        vibrate: [300, 100, 300],
        tag: "whatsfamily-alert",
        renotify: true,
        requireInteraction: true
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
