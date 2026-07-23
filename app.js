import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"; 
import { 
    getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, 
    limit, doc, deleteDoc, setDoc, updateDoc, getDoc, getDocs, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"; 
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"; 
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js"; 
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js"; 

// 1. LISTA ESCLUSIVA DEGLI EMAIL AUTORIZZATI DELLA FAMIGLIA
const EMAIL_AUTORIZZATE = [
    "pietro.procopio@gmail.com",
    "romina.maschini@gmail.com",
    "procopio.matteo1@gmail.com",
    "nikywizzy@gmail.com",
    "cablaprogect@gmail.com"
];

// ID UNICO E SEPARATO PER LA SALA RIUNIONI
const ID_SALA_RIUNIONI = "chat_sala_riunioni";

const firebaseConfig = { 
    apiKey: "AIzaSyCMBZjMytN2Q9M6P1iT4vMx4q7y_nVgK8w", 
    authDomain: "whatsfamily-d8aa6.firebaseapp.com", 
    projectId: "whatsfamily-d8aa6", 
    storageBucket: "whatsfamily-d8aa6.firebasestorage.app", 
    messagingSenderId: "414240543274", 
    appId: "1:414240543274:web:c9979a6dd3433af8e9a953" 
}; 

const app = initializeApp(firebaseConfig); 
const db = getFirestore(app); 
const auth = getAuth(app); 
const storage = getStorage(app);
const messaging = getMessaging(app);

setPersistence(auth, browserLocalPersistence)
    .then(() => console.log("Persistenza Firebase configurata."))
    .catch((err) => console.error("Errore persistenza:", err)); 

// GESTIONE AGGIORNAMENTO SERVICE WORKER (banner "Nuova versione disponibile")
let nuovoWorkerInAttesa = null;
let ricaricamentoGiaAvviato = false;

function ricaricaUnaVoltaSola() {
    if (ricaricamentoGiaAvviato) return;
    ricaricamentoGiaAvviato = true;
    window.location.reload();
}

function mostraBannerAggiornamento() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.style.display = 'flex';
}

function nascondiBannerAggiornamento() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.style.display = 'none';
}

function gestisciUpdateSW(reg) {
    if (!reg) return;

    if (reg.waiting && navigator.serviceWorker.controller) {
        nuovoWorkerInAttesa = reg.waiting;
        mostraBannerAggiornamento();
    }

    reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                nuovoWorkerInAttesa = newWorker;
                mostraBannerAggiornamento();
            }
        });
    });
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        nascondiBannerAggiornamento();
        ricaricaUnaVoltaSola();
    });
}

// 1. SERVICE WORKER PRINCIPALE (PWA)
if ('serviceWorker' in navigator) { 
    window.addEventListener('load', () => { 
        navigator.serviceWorker.register('./service-worker.js') 
        .then(reg => { 
            gestisciUpdateSW(reg);
            reg.update(); 
        }) 
        .catch(err => console.error("Errore Service Worker PWA:", err)); 
    }); 
} 

const reloadBtn = document.getElementById('reload-update-btn');
if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
        reloadBtn.disabled = true;
        reloadBtn.innerText = '⏳ Aggiornamento...';
        
        nascondiBannerAggiornamento();

        try {
            const reg = await navigator.serviceWorker.getRegistration('./service-worker.js');
            const worker = (reg && reg.waiting) || nuovoWorkerInAttesa;
            
            if (worker) {
                worker.postMessage({ type: 'SKIP_WAITING' });
            } else {
                ricaricaUnaVoltaSola();
            }
        } catch (err) {
            ricaricaUnaVoltaSola();
        }
    });
}

// 2. GESTIONE SERVICE WORKER NOTIFICHE PUSH (FCM)
async function richiediESalvaTokenNotifiche(userId) { 
    try { 
        if (!("Notification" in window) || !('serviceWorker' in navigator)) return; 
        
        const permission = await Notification.requestPermission(); 
        if (permission === "granted") { 
            const fcmRegistration = await navigator.serviceWorker.ready;
            
            const messagingInstance = getMessaging(app); 
            const tokenCorrente = await getToken(messagingInstance, { 
                serviceWorkerRegistration: fcmRegistration, 
                vapidKey: "BHHKBMPf-i-ODMIFw4qYXDHEc0eNyT1GsxDnsjnYUO1z-WR1ffo9W_Eyvt_Id2oi0xwB9W3RdUxKpZcYgVYEx4A"  
            }); 
            
            if (tokenCorrente) { 
                await updateDoc(doc(db, "users", userId), { fcmToken: tokenCorrente }); 
            } 
        } 
    } catch (err) { console.error("Errore Token Notifiche:", err); } 
}

// ELEMENTI DOM
const loginScreen = document.getElementById('login-screen'); 
const chatScreen = document.getElementById('chat-screen'); 
const loginForm = document.getElementById('login-form'); 
const logoutBtn = document.getElementById('logout-btn'); 
const chatContainer = document.getElementById('chat-container'); 
const inputForm = document.getElementById('input-container'); 
const messageInput = document.getElementById('message-input'); 
const backBtn = document.getElementById('back-btn'); 
const contactsList = document.getElementById('contacts-list'); 
const fileInput = document.getElementById('file-input'); 
const cameraInput = document.getElementById('camera-input');
const uploadLoader = document.getElementById('upload-loader'); 
const themeToggleBtn = document.getElementById('theme-toggle'); 
const voiceBtn = document.getElementById('voice-btn'); 
const clearChatBtn = document.getElementById('clear-chat-btn'); 
const emojiBtn = document.getElementById('emoji-btn');
const emojiPickerPanel = document.getElementById('emoji-picker-panel');

let utenteCorrente = null; 
let unsubscribeChat = null; 
let unsubscribeStatoAttivo = null; 
let idChatAttiva = null;  
let ascoltatoriBackground = {}; 
let timerScrittura = null; 
let dizionarioNomiGlobali = {}; 
let messaggiNonLettiTotali = 0; 

let mediaRecorder = null; 
let audioChunks = []; 
let isRecording = false; 
let recordTimerInterval = null; 
let recordSeconds = 0; 

function formattaNomeEmail(email) { 
    if (!email) return "Utente"; 
    const nomeBase = email.split('@')[0].replace(/[\.\-_]/g, ' ');
    return nomeBase
        .split(' ')
        .filter(parola => parola.length > 0)
        .map(parola => parola.charAt(0).toUpperCase() + parola.slice(1).toLowerCase())
        .join(' ');
}

// TOGGLE VISIBILITÀ PASSWORD SCHERMATA LOGIN
const togglePasswordBtn = document.getElementById('toggle-password');
const passwordInput = document.getElementById('login-password');

if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
        const isPassword = passwordInput.getAttribute('type') === 'password';
        passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
        togglePasswordBtn.innerText = isPassword ? '🙈' : '👁️';
    });
}

// TEMA CHIARO / SCURO
const temaSalvato = localStorage.getItem('theme'); 
if (temaSalvato === 'dark' || (!temaSalvato && window.matchMedia('(prefers-color-scheme: dark)').matches)) { 
    document.body.classList.add('dark-mode'); 
    if (themeToggleBtn) themeToggleBtn.innerText = '☀️ Chiaro'; 
} 

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => { 
        document.body.classList.toggle('dark-mode'); 
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light'); 
        themeToggleBtn.innerText = isDark ? '☀️ Chiaro' : '🌙 Scuro'; 
    });
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
        if (e.matches) {
            document.body.classList.add('dark-mode');
            if (themeToggleBtn) themeToggleBtn.innerText = '☀️ Chiaro';
        } else {
            document.body.classList.remove('dark-mode');
            if (themeToggleBtn) themeToggleBtn.innerText = '🌙 Scuro';
        }
    }
});

// SUONO NOTIFICA
async function riproduciBipNotifica() { 
    try { 
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtxClass) return;

        const audioCtx = new AudioCtxClass(); 
        
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        const oscillator = audioCtx.createOscillator(); 
        const gainNode = audioCtx.createGain(); 
        
        oscillator.type = 'sine';  
        oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime); 
        
        oscillator.connect(gainNode); 
        gainNode.connect(audioCtx.destination); 
        
        oscillator.start(); 
        oscillator.stop(audioCtx.currentTime + 0.15); 
    } catch(e) { 
        console.log("Audio non avviabile:", e); 
    } 
} 

async function impostaStatoUtente(stato) { 
    if (!utenteCorrente) return; 
    try { 
        await setDoc(doc(db, "users", utenteCorrente.uid), { 
            stato: stato,
            ultimoAccesso: serverTimestamp()
        }, { merge: true }); 
    } catch (e) {
        console.error("Errore aggiornamento stato utente:", e);
    } 
} 

async function impostaStatoScrittura(idDestinazione) { 
    if (!utenteCorrente) return; 
    try { 
        await setDoc(doc(db, "users", utenteCorrente.uid), { 
            typingTo: idDestinazione 
        }, { merge: true }); 
    } catch (e) {
        console.error("Errore aggiornamento stato scrittura:", e);
    } 
} 

// Gestione Visibilità e Presenza
document.addEventListener('visibilitychange', () => { 
    if (document.visibilityState === 'visible') { 
        impostaStatoUtente("🟢 Online"); 
        if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(e => console.log(e)); 
        messaggiNonLettiTotali = 0; 
    } else { 
        impostaStatoUtente("💤 Offline"); 
        impostaStatoScrittura(null); 
    } 
}); 

window.addEventListener('pagehide', () => {
    if (utenteCorrente) {
        impostaStatoUtente("💤 Offline");
        impostaStatoScrittura(null);
    }
});

// AUTENTICAZIONE E CONTROLLO EMAIL AUTORIZZATA
onAuthStateChanged(auth, async (user) => { 
    if (user) { 
        const emailNormalizzata = user.email.toLowerCase().trim();
        
        if (!EMAIL_AUTORIZZATE.includes(emailNormalizzata)) {
            alert("⚠️ La tua email (" + user.email + ") non è tra i componenti autorizzati della famiglia.");
            await signOut(auth);
            return;
        }

        utenteCorrente = user; 
        const nomeDefinito = user.displayName || formattaNomeEmail(user.email); 
        if (loginScreen) loginScreen.style.display = 'none'; 
        if (chatScreen) chatScreen.style.display = 'flex'; 

        try { 
            await setDoc(doc(db, "users", user.uid), { 
                uid: user.uid, nome: nomeDefinito, email: user.email, stato: "🟢 Online", typingTo: null 
            }, { merge: true }); 
        } catch(e) {} 

        richiediESalvaTokenNotifiche(user.uid); 

        onSnapshot(query(collection(db, "users")), (s) => { 
            s.forEach(docSnap => { 
                const u = docSnap.data(); 
                dizionarioNomiGlobali[u.uid] = u.nome || formattaNomeEmail(u.email); 
            }); 
        }); 
        caricaContatti(); 
    } else { 
        utenteCorrente = null; 
        if (chatScreen) chatScreen.style.display = 'none'; 
        if (loginScreen) loginScreen.style.display = 'flex'; 
        if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; } 
        if (unsubscribeStatoAttivo) { unsubscribeStatoAttivo(); unsubscribeStatoAttivo = null; } 
        Object.keys(ascoltatoriBackground).forEach(k => { if(typeof ascoltatoriBackground[k] === 'function') ascoltatoriBackground[k](); }); 
        ascoltatoriBackground = {}; 
        idChatAttiva = null; 
        if (clearChatBtn) clearChatBtn.style.display = 'none'; 
    } 
}); 

if (messageInput) {
    messageInput.addEventListener('input', () => { 
        if (!utenteCorrente || !idChatAttiva) return; 
        impostaStatoScrittura(idChatAttiva); 
        clearTimeout(timerScrittura); 
        timerScrittura = setTimeout(() => { impostaStatoScrittura(null); }, 2500); 
    }); 
}

// CARICAMENTO LISTA CHAT
function caricaContatti() { 
    const qUtenti = query(collection(db, "users")); 
    let utentiSalvati = []; 

    function aggiornaListaLaterale() { 
        if (!contactsList) return;
        contactsList.innerHTML = ''; 

        // 1. SALA RIUNIONI
        const voceGruppo = document.createElement('div'); 
        voceGruppo.classList.add('contact-item'); 
        voceGruppo.id = `contatto-${ID_SALA_RIUNIONI}`; 
        voceGruppo.style.cssText = "padding: 15px; border-bottom: 1px solid var(--border-color); cursor: pointer; display: flex; align-items: center; justify-content: space-between;"; 
        
        voceGruppo.innerHTML = ` 
            <div style="display: flex; align-items: center; gap: 10px;"> 
                <div style="width: 40px; height: 40px; background: #8A2BE2; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: white;">🏠</div> 
                <div> 
                    <div style="font-weight: bold; color: var(--contact-name-color);">Sala Riunioni</div> 
                    <div id="anteprima-${ID_SALA_RIUNIONI}" style="font-size: 0.8rem; color: var(--text-muted); max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📭 Nessun messaggio</div> 
                </div> 
            </div> 
            <div id="notifica-${ID_SALA_RIUNIONI}" style="display: none; background-color: #8A2BE2; color: white; font-size: 0.75rem; font-weight: bold; min-width: 20px; height: 20px; border-radius: 50%; align-items: center; justify-content: center; padding: 2px;">⚡</div> 
        `; 
        
        voceGruppo.addEventListener('click', () => { 
            document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active')); 
            voceGruppo.classList.add('active'); 
            idChatAttiva = ID_SALA_RIUNIONI; 
            const pallino = document.getElementById(`notifica-${ID_SALA_RIUNIONI}`); 
            if (pallino) pallino.style.display = 'none'; 
            apriStanzaChat("Sala Riunioni", true, null); 
        }); 
        
        contactsList.appendChild(voceGruppo); 
        attivaAscoltoBackground(ID_SALA_RIUNIONI); 

        // SEPARATORE CHAT PRIVATE
        if (utentiSalvati.length > 1) { 
            const divisa = document.createElement('div'); 
            divisa.style.cssText = "padding: 8px 15px; background: var(--bg-color); font-size: 0.75rem; font-weight: bold; color: var(--text-muted); text-transform: uppercase;"; 
            divisa.innerText = "💬 Chat Private 🔐"; 
            contactsList.appendChild(divisa); 
        } 

        // 2. CONTATTI SINGOLI 1-A-1
        const uidsRendering = new Set(); 
        utentiSalvati.forEach((parente) => { 
            if (parente.uid === utenteCorrente?.uid || uidsRendering.has(parente.uid)) return; 
            uidsRendering.add(parente.uid); 
            
            const ids = [utenteCorrente.uid, parente.uid].sort(); 
            const idChatParente = `${ids[0]}_${ids[1]}`; 

            const voceContatto = document.createElement('div'); 
            voceContatto.classList.add('contact-item'); 
            voceContatto.id = `contatto-${idChatParente}`; 
            voceContatto.style.cssText = "padding: 15px; border-bottom: 1px solid var(--border-color); cursor: pointer; display: flex; align-items: center; justify-content: space-between;"; 
            
            const nomeContattoPulito = parente.nome || formattaNomeEmail(parente.email); 
            
            voceContatto.innerHTML = ` 
                <div style="display: flex; align-items: center; gap: 10px;"> 
                    <div style="width: 40px; height: 40px; background: #8A2BE2; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white;">${nomeContattoPulito.charAt(0).toUpperCase()}</div> 
                    <div> 
                        <div style="font-weight: bold; color: var(--contact-name-color);">${nomeContattoPulito}</div> 
                        <div id="anteprima-${idChatParente}" style="font-size: 0.8rem; color: var(--text-muted); max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📭 Nessun messaggio</div> 
                    </div> 
                </div> 
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;"> 
                    <span id="lista-stato-${parente.uid}" style="font-size: 0.75rem; font-weight: bold; color: var(--text-muted);">${parente.stato || "💤 Offline"}</span> 
                    <div id="notifica-${idChatParente}" style="display: none; background-color: #8A2BE2; color: white; font-size: 0.75rem; font-weight: bold; min-width: 20px; height: 20px; border-radius: 50%; align-items: center; justify-content: center; padding: 2px;">⚡</div> 
                </div> 
            `; 
            
            voceContatto.addEventListener('click', () => { 
                document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active')); 
                voceContatto.classList.add('active'); 
                idChatAttiva = idChatParente; 
                const pallino = document.getElementById(`notifica-${idChatParente}`); 
                if (pallino) pallino.style.display = 'none'; 
                apriStanzaChat(nomeContattoPulito, false, parente.uid); 
            }); 
            
            contactsList.appendChild(voceContatto); 
            attivaAscoltoBackground(idChatParente); 
        }); 
    } 

    onSnapshot(qUtenti, (snapshot) => { 
        utentiSalvati = []; 
        const cacheUids = new Set(); 
        snapshot.forEach(docSnap => { 
            const u = docSnap.data(); 
            if (u && u.uid && !cacheUids.has(u.uid)) { 
                cacheUids.add(u.uid); 
                utentiSalvati.push(u); 
            } 
        }); 
        aggiornaListaLaterale(); 
    }, (err) => console.error("Errore snapshot contatti:", err)); 
}

function attivaAscoltoBackground(idChat) { 
    if (ascoltatoriBackground[idChat]) return; 
    
    const percorsoBase = collection(db, "chats", idChat, "messages"); 
    const qNotifiche = query(percorsoBase, orderBy("timestamp", "desc"), limit(1)); 
    let bloccoIniziale = true; 

    ascoltatoriBackground[idChat] = onSnapshot(qNotifiche, (snapMessaggi) => { 
        if (!snapMessaggi.empty) { 
            const docSnap = snapMessaggi.docs[0];
            const ultimoDoc = docSnap.data(); 
            const msgId = docSnap.id;

            if (ultimoDoc.senderId !== utenteCorrente?.uid && !ultimoDoc.consegnato) {
                updateDoc(doc(db, "chats", idChat, "messages", msgId), { consegnato: true }).catch(() => {});
            }

            const anteprimaTesto = document.getElementById(`anteprima-${idChat}`); 
            const pallinoNotifica = document.getElementById(`notifica-${idChat}`); 
            
            let testoNotifica = ultimoDoc.text || "Messaggio"; 
            if (ultimoDoc.fileType === 'image') testoNotifica = "📷 Foto"; 
            else if (ultimoDoc.fileType === 'video') testoNotifica = "🎥 Video"; 
            else if (ultimoDoc.fileType === 'audio') testoNotifica = "🎙️ Vocale"; 

            if (anteprimaTesto) anteprimaTesto.innerText = testoNotifica; 

            if (idChatAttiva !== idChat || document.visibilityState !== 'visible') { 
                if (idChatAttiva !== idChat && pallinoNotifica) pallinoNotifica.style.display = 'flex'; 
                
                if (!bloccoIniziale && ultimoDoc.senderId !== utenteCorrente?.uid) { 
                    messaggiNonLettiTotali++; 
                    if ('setAppBadge' in navigator) {
                        navigator.setAppBadge(messaggiNonLettiTotali).catch(() => {}); 
                    }
                    interfacciaNotificaPush("💬 WhatsFamily 🏡", testoNotifica); 
                } 
            } else { 
                if (pallinoNotifica) pallinoNotifica.style.display = 'none'; 
                if (!bloccoIniziale && ultimoDoc.senderId !== utenteCorrente?.uid) {
                    riproduciBipNotifica(); 
                }
            } 
        } 
        bloccoIniziale = false; 
    }); 
} 

function interfacciaNotificaPush(titolo, testo) { 
    if ("Notification" in window && Notification.permission === "granted") { 
        navigator.serviceWorker.ready.then(registration => { 
            registration.showNotification(titolo, { 
                body: testo, 
                icon: "./icon001.png", 
                badge: "./icon001.png", 
                vibrate: [200, 100, 200], 
                tag: "whatsfamily-alert", 
                renotify: true, 
                requireInteraction: true 
            }); 
        }); 
    } else { 
        riproduciBipNotifica(); 
    } 
} 

async function aggiungiReazione(msgId, emoji) { 
    if (!utenteCorrente || !idChatAttiva) return; 
    const docRef = doc(db, "chats", idChatAttiva, "messages", msgId); 
    try { 
        const snap = await getDoc(docRef); 
        if (snap.exists()) { 
            let reazioniAttuali = snap.data().reactions || {}; 
            if (reazioniAttuali[utenteCorrente.uid] === emoji) { 
                delete reazioniAttuali[utenteCorrente.uid]; 
            } else { 
                reazioniAttuali[utenteCorrente.uid] = emoji; 
            } 
            await updateDoc(docRef, { reactions: reazioniAttuali }); 
        } 
    } catch (err) { 
        console.error("Errore reazione:", err); 
    } 
} 

// APERTURA STANZA CHAT
function apriStanzaChat(nomeParente, isGroup = false, idParente = null) { 
    document.body.classList.add('in-chat'); 
    
    const activeChatName = document.getElementById('active-chat-name');
    if (activeChatName) activeChatName.innerText = (isGroup ? "🏠 " : "👤 ") + nomeParente; 
    
    if (clearChatBtn) clearChatBtn.style.display = 'flex'; 
    if (unsubscribeStatoAttivo) { unsubscribeStatoAttivo(); unsubscribeStatoAttivo = null; } 

    const activeChatStatus = document.getElementById('active-chat-status');
    if (isGroup) { 
        if (activeChatStatus) activeChatStatus.innerText = "🏡 Chat Unica di Famiglia"; 
    } else if (idParente) { 
        unsubscribeStatoAttivo = onSnapshot(doc(db, "users", idParente), (docSnap) => { 
            if (docSnap.exists() && activeChatStatus) { 
                const datiParente = docSnap.data(); 
                if (datiParente.typingTo === idChatAttiva) { 
                    activeChatStatus.innerHTML = "<span style='color: #adff2f; font-weight: bold;'>✍️ Sta scrivendo...</span>"; 
                } else { 
                    activeChatStatus.innerText = datiParente.stato || "💤 Offline"; 
                } 
            } 
        }); 
    } 

    if (messageInput) {
        messageInput.disabled = false; 
        messageInput.placeholder = "✏️ Scrivi un messaggio..."; 
    }
    
    if (unsubscribeChat) unsubscribeChat(); 

    const percorsoMessaggi = query(collection(db, "chats", idChatAttiva, "messages"), orderBy("timestamp", "asc")); 

    unsubscribeChat = onSnapshot(percorsoMessaggi, async (snapshot) => { 
        if (!chatContainer) return;
        chatContainer.innerHTML = ''; 
        
        const batch = writeBatch(db);
        let daAggiornareInBatch = false;

        snapshot.forEach((docMsg) => { 
            const dati = docMsg.data(); 
            const msgId = docMsg.id;    
            const mioMessaggio = (dati.senderId === utenteCorrente.uid); 
            const tipoMessaggio = mioMessaggio ? "sent" : "received"; 
            
            if (!mioMessaggio) {
                const docRef = doc(db, "chats", idChatAttiva, "messages", msgId);
                if (!dati.letto && document.visibilityState === 'visible') {
                    batch.update(docRef, { letto: true, consegnato: true });
                    daAggiornareInBatch = true;
                } else if (!dati.consegnato) {
                    batch.update(docRef, { consegnato: true });
                    daAggiornareInBatch = true;
                }
            }

            let oraFormattata = dati.timestamp ? dati.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"; 
            let nomeMittente = mioMessaggio ? '😎 Tu' : (dizionarioNomiGlobali[dati.senderId] || nomeParente); 

            const contenitoreMessaggioEsterno = document.createElement('div'); 
            contenitoreMessaggioEsterno.classList.add('message-wrapper', tipoMessaggio); 

            let contenutoMessaggio = ''; 
            if (dati.fileType === 'image') { 
                contenutoMessaggio = `<a href="${dati.fileUrl}" target="_blank" rel="noopener"><img src="${dati.fileUrl}" style="max-width: 100%; max-height: 250px; border-radius: 8px; margin-top: 5px; display: block;" alt="Foto"></a>`; 
            } else if (dati.fileType === 'video') { 
                contenutoMessaggio = `<video src="${dati.fileUrl}" controls style="max-width: 100%; max-height: 250px; border-radius: 8px; margin-top: 5px; display: block;"></video>`; 
            } else if (dati.fileType === 'audio') { 
                contenutoMessaggio = `<div class="voice-message-player"><span>🎙️ Vocale</span><audio src="${dati.fileUrl}" controls controlsList="nodownload" style="height: 35px;"></audio></div>`; 
            } else { 
                contenutoMessaggio = `<p style="margin: 0; word-break: break-word;">${dati.text || ''}</p>`; 
            } 

            const emojiScelte = ["👍", "❤️", "😂", "😮", "😢"]; 
            let reactionBarHtml = `<div class="reaction-bar">`; 
            emojiScelte.forEach(emo => { reactionBarHtml += `<span class="reaction-emoji" data-emoji="${emo}">${emo}</span>`; }); 
            reactionBarHtml += `</div>`; 

            let badgeReazioniHtml = `<div class="reactions-container">`; 
            const reazioniSalvate = dati.reactions || {}; 
            const conteggioEmoji = {}; 
            Object.keys(reazioniSalvate).forEach(uid => { const emo = reazioniSalvate[uid]; conteggioEmoji[emo] = (conteggioEmoji[emo] || 0) + 1; }); 
            Object.keys(conteggioEmoji).forEach(emo => { badgeReazioniHtml += `<div class="reaction-badge" data-emoji="${emo}">${emo} <span>${conteggioEmoji[emo]}</span></div>`; }); 
            badgeReazioniHtml += `</div>`; 

            let spunteHtml = ''; 
            if (mioMessaggio && !isGroup) { 
                if (dati.letto) { 
                    spunteHtml = `<span style="color: #24a0ed; margin-left: 5px; font-weight: bold; font-size: 0.85rem;" title="Letto">✓✓</span>`; 
                } else if (dati.consegnato) { 
                    spunteHtml = `<span style="color: var(--text-muted); margin-left: 5px; font-size: 0.85rem;" title="Consegnato">✓✓</span>`; 
                } else { 
                    spunteHtml = `<span style="color: var(--text-muted); margin-left: 5px; font-size: 0.85rem;" title="Inviato">✓</span>`; 
                } 
            } 

            const deleteBtnHtml = mioMessaggio ? `<button class="delete-btn" title="Elimina messaggio 🗑️">🗑️</button>` : '';

            contenitoreMessaggioEsterno.innerHTML = ` 
                ${reactionBarHtml} 
                <div class="message ${tipoMessaggio}"> 
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;"> 
                        <span class="sender-name">${nomeMittente}</span> 
                        ${deleteBtnHtml} 
                    </div> 
                    ${contenutoMessaggio} 
                    <span class="timestamp">🕒 ${oraFormattata} ${spunteHtml}</span> 
                </div> 
                ${badgeReazioniHtml} 
            `; 

            contenitoreMessaggioEsterno.addEventListener('click', (e) => { 
                if (e.target.classList.contains('reaction-emoji') || e.target.classList.contains('delete-btn') || e.target.tagName === 'AUDIO') return; 
                document.querySelectorAll('.message-wrapper').forEach(el => { if (el !== contenitoreMessaggioEsterno) el.classList.remove('show-reactions'); }); 
                contenitoreMessaggioEsterno.classList.toggle('show-reactions'); 
            }); 

            contenitoreMessaggioEsterno.querySelectorAll('.reaction-emoji').forEach(btn => { 
                btn.addEventListener('click', (e) => { 
                    e.stopPropagation(); 
                    aggiungiReazione(msgId, btn.getAttribute('data-emoji')); 
                    contenitoreMessaggioEsterno.classList.remove('show-reactions'); 
                }); 
            }); 

            contenitoreMessaggioEsterno.querySelectorAll('.delete-btn').forEach(btn => { 
                btn.addEventListener('click', async (e) => { 
                    e.stopPropagation(); 
                    if (confirm("🚨 Vuoi davvero eliminare questo messaggio?")) { 
                        const docRef = doc(db, "chats", idChatAttiva, "messages", msgId); 
                        if (dati.fileUrl) { 
                            try { await deleteObject(ref(storage, dati.fileUrl)); } catch (err) { console.error("Errore cancellazione file:", err); } 
                        } 
                        await deleteDoc(docRef); 
                    } 
                }); 
            }); 

            chatContainer.appendChild(contenitoreMessaggioEsterno); 
        }); 

        if (daAggiornareInBatch) {
            batch.commit().catch(e => console.error("Errore commit batch lettura:", e));
        }

        chatContainer.scrollTop = chatContainer.scrollHeight; 
    }); 
}

// INVIO FILE E MEDIA
async function gestisciCaricamentoFile(file, isCamera = false) {
    if (!file || !utenteCorrente || !idChatAttiva) return; 
    
    if (uploadLoader) uploadLoader.style.display = 'block'; 
    const estensione = file.name.split('.').pop().toLowerCase();
    
    const estensioniImmagini = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp'];
    const estensioniVideo = ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp'];
    
    let tipoFile = 'file';
    if (estensioniImmagini.includes(estensione) || (file.type && file.type.startsWith('image/'))) {
        tipoFile = 'image';
    } else if (estensioniVideo.includes(estensione) || (file.type && file.type.startsWith('video/'))) {
        tipoFile = 'video';
    }
    
    let tagTesto = isCamera ? '📷 Foto al volo' : '📎 Allegato';
    if (tipoFile === 'image') tagTesto = isCamera ? '📷 Foto' : '📷 Immagine';
    if (tipoFile === 'video') tagTesto = isCamera ? '🎥 Video' : '🎥 Filmato';
     
    const nomeUnico = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const percorsoStorage = ref(storage, `chat_files/${idChatAttiva}/${nomeUnico}`); 
    const percorsoInvia = collection(db, "chats", idChatAttiva, "messages"); 

    try { 
        const snapshot = await uploadBytes(percorsoStorage, file); 
        const urlScaricabile = await getDownloadURL(snapshot.ref); 
        await addDoc(percorsoInvia, { 
            text: tagTesto, 
            fileUrl: urlScaricabile, 
            fileType: tipoFile, 
            senderId: utenteCorrente.uid, 
            timestamp: serverTimestamp(), 
            consegnato: false, 
            letto: false 
        }); 
    } catch (err) { 
        console.error("Errore caricamento file:", err); 
        alert("Ops! Caricamento non riuscito. Riprova.");
    } finally { 
        if (uploadLoader) uploadLoader.style.display = 'none'; 
        if (fileInput) fileInput.value = ''; 
        if (cameraInput) cameraInput.value = ''; 
    } 
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            gestisciCaricamentoFile(e.target.files[0], false);
        }
    });
}

if (cameraInput) {
    cameraInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            gestisciCaricamentoFile(e.target.files[0], true);
        }
    });
}

// MESSAGGI VOCALI
if (voiceBtn) {
    voiceBtn.addEventListener('click', async () => {  
        if (!utenteCorrente || !idChatAttiva) return;  
        
        if (!isRecording) { 
            try { 
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); 
                audioChunks = []; 

                let tipoMimeSupportato = "";
                let estensioneFile = "m4a";

                if (typeof MediaRecorder.isTypeSupported === 'function') {
                    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
                        tipoMimeSupportato = "audio/webm;codecs=opus";
                        estensioneFile = "webm";
                    } else if (MediaRecorder.isTypeSupported("audio/webm")) {
                        tipoMimeSupportato = "audio/webm";
                        estensioneFile = "webm";
                    } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
                        tipoMimeSupportato = "audio/mp4";
                        estensioneFile = "mp4";
                    } else if (MediaRecorder.isTypeSupported("audio/aac")) {
                        tipoMimeSupportato = "audio/aac";
                        estensioneFile = "aac";
                    }
                }

                const opzioniRecorder = tipoMimeSupportato ? { mimeType: tipoMimeSupportato } : {};
                mediaRecorder = new MediaRecorder(stream, opzioniRecorder); 
                
                mediaRecorder.addEventListener("dataavailable", e => {
                    if (e.data.size > 0) audioChunks.push(e.data);
                }); 

                mediaRecorder.addEventListener("stop", async () => { 
                    const blobOptions = tipoMimeSupportato ? { type: tipoMimeSupportato } : {};
                    const audioBlob = new Blob(audioChunks, blobOptions); 
                    
                    if (uploadLoader) uploadLoader.style.display = 'block'; 
                    
                    const percorsoStorage = ref(storage, `chat_files/${idChatAttiva}/${Date.now()}_vocale.${estensioneFile}`); 
                    const percorsoInvia = collection(db, "chats", idChatAttiva, "messages"); 
                    
                    try { 
                        const snapshot = await uploadBytes(percorsoStorage, audioBlob); 
                        const urlScaricabile = await getDownloadURL(snapshot.ref); 
                        await addDoc(percorsoInvia, { 
                            text: "🎙️ Messaggio Vocale", 
                            fileUrl: urlScaricabile, 
                            fileType: "audio", 
                            senderId: utenteCorrente.uid, 
                            timestamp: serverTimestamp(), 
                            consegnato: false, 
                            letto: false 
                        }); 
                    } catch (err) {
                        console.error("Errore salvataggio vocale:", err);
                        alert("Impossibile inviare il vocale. Riprova.");
                    } finally { 
                        if (uploadLoader) uploadLoader.style.display = 'none'; 
                        stream.getTracks().forEach(t => t.stop()); 
                    } 
                }); 
                
                mediaRecorder.start(); 
                isRecording = true; 
                voiceBtn.innerText = "⏹️"; 
                voiceBtn.style.backgroundColor = "#ff4d4d"; 
                voiceBtn.style.color = "#ffffff"; 
                recordSeconds = 0; 
                
                if (messageInput) {
                    messageInput.placeholder = "🔴 REGISTRAZIONE IN CORSO: 00:00"; 
                    messageInput.disabled = true; 
                }
                
                recordTimerInterval = setInterval(() => { 
                    recordSeconds++; 
                    const m = String(Math.floor(recordSeconds / 60)).padStart(2, '0'); 
                    const s = String(recordSeconds % 60).padStart(2, '0'); 
                    if (messageInput) {
                        messageInput.placeholder = `🔴 REGISTRAZIONE IN CORSO: ${m}:${s}`; 
                    }
                }, 1000); 

            } catch (err) { 
                console.error("Accesso microfono negato o non supportato:", err);
                alert("Per inviare vocali è necessario consentire l'accesso al microfono dalle impostazioni del browser."); 
            } 
        } else { 
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop(); 
            }
            clearInterval(recordTimerInterval); 
            isRecording = false; 
            voiceBtn.innerText = "🎙️"; 
            voiceBtn.style.backgroundColor = "var(--border-color)"; 
            voiceBtn.style.color = "var(--text-color)"; 
            
            if (messageInput) {
                messageInput.placeholder = "✏️ Scrivi un messaggio..."; 
                messageInput.disabled = false; 
            }
        } 
    });
}

// RIPULISCI INTERA CHAT (PULSANTE SCOPA 🧹)
if (clearChatBtn) {
    clearChatBtn.addEventListener('click', async () => {  
        if (!utenteCorrente || !idChatAttiva) return;  
        
        if (confirm("🧹 Vuoi cancellare TUTTI i messaggi di questa chat? L'operazione non è reversibile.")) { 
            const percorsoChat = collection(db, "chats", idChatAttiva, "messages"); 
            try { 
                if (uploadLoader) uploadLoader.style.display = 'block'; 
                const snapshot = await getDocs(percorsoChat); 
                
                if (snapshot.empty) {
                    if (uploadLoader) uploadLoader.style.display = 'none';
                    return;
                }

                let batch = writeBatch(db);
                let operazioneCount = 0;

                for (const docu of snapshot.docs) {
                    const dati = docu.data();
                    if (dati.fileUrl) { 
                        try { 
                            await deleteObject(ref(storage, dati.fileUrl)); 
                        } catch (e) {
                            console.warn("File non trovato o già rimosso dallo storage:", e);
                        } 
                    } 
                    
                    batch.delete(doc(db, "chats", idChatAttiva, "messages", docu.id));
                    operazioneCount++;

                    if (operazioneCount >= 400) {
                        await batch.commit();
                        batch = writeBatch(db);
                        operazioneCount = 0;
                    }
                }

                if (operazioneCount > 0) {
                    await batch.commit();
                }

            } catch (err) { 
                console.error("Errore durante la pulizia della chat:", err);
                alert("Si è verificato un errore durante la cancellazione dei messaggi.");
            } finally { 
                if (uploadLoader) uploadLoader.style.display = 'none'; 
            } 
        } 
    }); 
}

// MENU EMOJI
if (emojiBtn && emojiPickerPanel) {
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const displayAttuale = window.getComputedStyle(emojiPickerPanel).display;
        emojiPickerPanel.style.display = (displayAttuale === 'none') ? 'grid' : 'none';
    });

    emojiPickerPanel.querySelectorAll('span').forEach(emojiSpan => {
        emojiSpan.addEventListener('click', () => {
            if (messageInput) {
                messageInput.value += emojiSpan.innerText;
                messageInput.focus();
            }
            emojiPickerPanel.style.display = 'none';
        });
    });

    document.addEventListener('click', (e) => {
        if (!emojiPickerPanel.contains(e.target) && e.target !== emojiBtn) {
            emojiPickerPanel.style.display = 'none';
        }
    });
}

// INVIO MESSAGGIO DI TESTO
if (inputForm) {
    inputForm.addEventListener('submit', async (e) => { 
        e.preventDefault(); 
        
        if (!messageInput) return;
        const testo = messageInput.value.trim(); 
        
        if (!testo || !utenteCorrente || !idChatAttiva) return; 
        
        const percorsoInvia = collection(db, "chats", idChatAttiva, "messages"); 
        
        messageInput.value = ''; 
        if (emojiPickerPanel) emojiPickerPanel.style.display = 'none';
        
        messageInput.focus(); 

        clearTimeout(timerScrittura);
        impostaStatoScrittura(null).catch(() => {});

        try { 
            await addDoc(percorsoInvia, { 
                text: testo, 
                senderId: utenteCorrente.uid, 
                timestamp: serverTimestamp(), 
                consegnato: false, 
                letto: false 
            }); 
        } catch (err) {
            console.error("Errore invio messaggio:", err);
            messageInput.value = testo;
            alert("Impossibile inviare il messaggio. Verifica la connessione.");
        } 
    }); 
}

// SUBMIT FORM LOGIN
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {  
        e.preventDefault(); 
        const emailEl = document.getElementById('login-email');
        const passwordEl = document.getElementById('login-password');
        
        const email = emailEl ? emailEl.value.trim() : ''; 
        const password = passwordEl ? passwordEl.value : ''; 
        
        if (!email || !password) return; 

        try { 
            await signInWithEmailAndPassword(auth, email, password); 
            loginForm.reset(); 
        } catch (error) { 
            console.error("Errore autenticazione:", error);
            alert("Errore di accesso! Controlla email e password."); 
        } 
    }); 
}

// LOGOUT
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {  
        if (confirm("🚪 Vuoi uscire dalla chat di famiglia?")) { 
            await impostaStatoUtente("💤 Offline"); 
            await impostaStatoScrittura(null); 
            await signOut(auth); 
        } 
    }); 
}

// FRECCIA INDIETRO PER MOBILE
if (backBtn) {
    backBtn.addEventListener('click', async () => {  
        document.body.classList.remove('in-chat'); 
        idChatAttiva = null; 
        if (clearChatBtn) clearChatBtn.style.display = 'none'; 
        if (unsubscribeStatoAttivo) { unsubscribeStatoAttivo(); unsubscribeStatoAttivo = null; } 
        await impostaStatoScrittura(null); 
    });
}
