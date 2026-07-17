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
// ASCOLTO NOTIFICHE FIREBASE IN BACKGROUND 📬
// ==========================================

// Importa i componenti di Firebase necessari per lo sfondo
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Configurazione con le tue chiavi reali di WhatsFamily
const firebaseConfig = {
    apiKey: "AIzaSyCMBZjMytN2Q9M6P1iT4vMx4q7y_nVgK8w",
    authDomain: "whatsfamily-d8aa6.firebaseapp.com",
    projectId: "whatsfamily-d8aa6",
    storageBucket: "whatsfamily-d8aa6.firebasestorage.app",
    messagingSenderId: "414240543274",
    appId: "1:414240543274:web:c9979a6dd3433af8e9a953"
};

// Inizializza Firebase all'interno dello stesso Service Worker
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Questo intercetta i messaggi quando lo schermo è SPENTO o l'app è CHIUSA
messaging.onBackgroundMessage((payload) => {
    console.log('Notifica ricevuta mentre il telefono era spento:', payload);

    const titoloNotifica = payload.notification ? payload.notification.title : "💬 WhatsFamily 🏡";
    const opzioniNotifica = {
        body: payload.notification ? payload.notification.body : "Nuovo messaggio di famiglia in arrivo!",
        icon: "./icon001.png",
        badge: "./icon001.png",
        tag: "whatsfamily-alert",
        renotify: true,
        requireInteraction: true, // La notifica resta finché non la premi o la scarti
        vibrate: [300, 100, 300]   // Vibrazione dedicata su Android
    };

    return self.registration.showNotification(titoloNotifica, opzioniNotifica);
});
