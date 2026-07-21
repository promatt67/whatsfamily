// ==========================================
// IMPORTS (DEVONO ESSERE IN CIMA AL FILE)
// ==========================================
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js'); //
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js'); //

// ==========================================
// CACHE SETTINGS (Aggiornata versione per forzare il refresh)
// ==========================================
const CACHE_NAME = 'whatsfamily-v8.2.1'; 
const ASSETS = [ //
  './', //[cite: 1]
  './index.html', //[cite: 1]
  './manifest.json', //[cite: 1]
  './icon001.png' //[cite: 1]
];

// ==========================================
// INSTALL
// ==========================================
self.addEventListener('install', (e) => { //[cite: 1]
  e.waitUntil( //[cite: 1]
    caches.open(CACHE_NAME) //[cite: 1]
      .then((cache) => cache.addAll(ASSETS)) //[cite: 1]
      .then(() => self.skipWaiting()) //[cite: 1]
  );
});

// ==========================================
// ACTIVATE + CLEAN OLD CACHES
// ==========================================
self.addEventListener('activate', (e) => { //[cite: 1]
  e.waitUntil( //[cite: 1]
    caches.keys().then((keys) => { //[cite: 1]
      return Promise.all( //[cite: 1]
        keys.map((key) => { //[cite: 1]
          if (key !== CACHE_NAME) { //[cite: 1]
            return caches.delete(key); //[cite: 1]
          }
        })
      );
    }).then(() => self.clients.claim()) //[cite: 1]
  );
});

// ==========================================
// FETCH: NETWORK-FIRST CON FALLBACK SU CACHE
// ==========================================
self.addEventListener('fetch', (e) => { //[cite: 1]

  // Evita di intercettare richieste non GET
  if (e.request.method !== 'GET') { //[cite: 1]
    return fetch(e.request); //[cite: 1]
  }

  // Evita ASSOLUTAMENTE di mettere in cache richieste Firebase e Storage
  if (
    e.request.url.includes('firestore.googleapis.com') || //[cite: 1]
    e.request.url.includes('firebaseio.com') || //[cite: 1]
    e.request.url.includes('identitytoolkit') || //[cite: 1]
    e.request.url.includes('firebasestorage.googleapis.com') //[cite: 1]
  ) {
    return fetch(e.request); //[cite: 1]
  }

  // Strategia Network-First: prova prima la rete, così gli aggiornamenti si vedono subito.
  // Se la rete fallisce (es. offline), usa la cache.
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // Se la risposta è valida, aggiorna la cache in background
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Siamo offline! Recupera il file locale dalla cache
        return caches.match(e.request); //[cite: 1]
      })
  );
});

// ==========================================
// NOTIFICATION CLICK HANDLER
// ==========================================
self.addEventListener('notificationclick', (e) => { //[cite: 1]
  e.notification.close(); //[cite: 1]

  e.waitUntil( //[cite: 1]
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }) //[cite: 1]
      .then((clientList) => { //[cite: 1]
        for (const client of clientList) { //[cite: 1]
          if (client.url.includes('index.html') && 'focus' in client) { //[cite: 1]
            return client.focus(); //[cite: 1]
          }
        }
        if (self.clients.openWindow) { //[cite: 1]
          return self.clients.openWindow('./index.html'); //[cite: 1]
        }
      })
  );
});

// ==========================================
// FIREBASE MESSAGING BACKGROUND
// ==========================================
const firebaseConfig = { //[cite: 1]
  apiKey: "AIzaSyCMBZjMytN2Q9M6P1iT4vMx4q7y_nVgK8w", //[cite: 1]
  authDomain: "whatsfamily-d8aa6.firebaseapp.com", //[cite: 1]
  projectId: "whatsfamily-d8aa6", //[cite: 1]
  storageBucket: "whatsfamily-d8aa6.firebasestorage.app", //[cite: 1]
  messagingSenderId: "414240543274", //[cite: 1]
  appId: "1:414240543274:web:c9979a6dd3433af8e9a953" //[cite: 1]
};

firebase.initializeApp(firebaseConfig); //[cite: 1]
const messaging = firebase.messaging(); //[cite: 1]

// ==========================================
// NOTIFICHE BACKGROUND OTTIMIZZATE
// ==========================================
messaging.onBackgroundMessage((payload) => { //[cite: 1]
  console.log('Notifica ricevuta in background:', payload); //[cite: 1]

  // Evita duplicazioni (notifica già gestita dal browser)
  if (payload.notification || payload.fcmOptions) { //[cite: 1]
    return; //[cite: 1]
  }

  // Notifica personalizzata per data-only payload
  if (payload.data) { //[cite: 1]
    const titoloNotifica = payload.data.title || "💬 WhatsFamily 🏡"; //[cite: 1]
    const opzioniNotifica = { //[cite: 1]
      body: payload.data.body || "Nuovo messaggio in arrivo!", //[cite: 1]
      icon: "./icon001.png", //[cite: 1]
      badge: "./icon001.png", //[cite: 1]
      tag: "whatsfamily-alert", //[cite: 1]
      renotify: true, //[cite: 1]
      requireInteraction: true, //[cite: 1]
      vibrate: [300, 100, 300] //[cite: 1]
    };

    return self.registration.showNotification(titoloNotifica, opzioniNotifica); //[cite: 1]
  }
});
