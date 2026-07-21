import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"; 
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, limit, doc, deleteDoc, setDoc, updateDoc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"; 
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

setPersistence(auth, browserLocalPersistence)
    .then(() => console.log("Persistenza Firebase configurata."))
    .catch((err) => console.error("Errore persistenza:", err)); 

if ("Notification" in window) { 
    Notification.requestPermission(); 
} 

// Service Worker e Gestione popup per la versione aggiornata
if ('serviceWorker' in navigator) { 
    window.addEventListener('load', () => { 
        navigator.serviceWorker.register('./service-worker.js') 
        .then(reg => { 
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        const banner = document.getElementById('update-banner');
                        if (banner) banner.style.display = 'flex';
                    }
                });
            });
            reg.update(); 
        }) 
        .catch(err => console.error("Errore Service Worker:", err)); 
    }); 
} 

const reloadBtn = document.getElementById('reload-update-btn');
if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
        window.location.reload(true);
    });
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
    return email.split('@')[0].replace(/[\.\-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); 
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

// SUONO NOTIFICA
function riproduciBipNotifica() { 
    try { 
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)(); 
        const oscillator = audioCtx.createOscillator(); 
        const gainNode = audioCtx.createGain(); 
        oscillator.type = 'sine';  
        oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); 
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime); 
        oscillator.connect(gainNode); 
        gainNode.connect(audioCtx.destination); 
        oscillator.start(); 
        oscillator.stop(audioCtx.currentTime + 0.15); 
    } catch(e) { console.log("Audio non avviabile:", e); } 
} 

async function richiediESalvaTokenNotifiche(userId) { 
    try { 
        if (!("Notification" in window)) return; 
        const permission = await Notification.requestPermission(); 
        if (permission === "granted") { 
            const registration = await navigator.serviceWorker.ready; 
            const messaging = getMessaging(app); 
            const tokenCorrente = await getToken(messaging, { 
                serviceWorkerRegistration: registration, 
                vapidKey: "BHHKBMPf-i-ODMIFw4qYXDHEc0eNyT1GsxDnsjnYUO1z-WR1ffo9W_Eyvt_Id2oi0xwB9W3RdUxKpZcYgVYEx4A"  
            }); 
            if (tokenCorrente) { 
                await updateDoc(doc(db, "users", userId), { fcmToken: tokenCorrente }); 
            } 
        } 
    } catch (err) { console.error("Errore Token Notifiche:", err); } 
} 

async function impostaStatoUtente(stato) { 
    if (!utenteCorrente) return; 
    try { await updateDoc(doc(db, "users", utenteCorrente.uid), { stato: stato }); } catch (e) {} 
} 

async function impostaStatoScrittura(idDestinazione) { 
    if (!utenteCorrente) return; 
    try { await updateDoc(doc(db, "users", utenteCorrente.uid), { typingTo: idDestinazione }); } catch (e) {} 
} 

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

// VERIFICA E CREAZIONE GRUPPO "Sala Riunioni"
async function assicuraSalaRiunioni() {
    try {
        const refGruppo = doc(db, "groups", "sala_riunioni");
        const snap = await getDoc(refGruppo);
        if (!snap.exists()) {
            await setDoc(refGruppo, {
                name: "Sala Riunioni",
                isDefaultGroup: true,
                createdAt: serverTimestamp()
            });
        }
    } catch (e) {
        console.error("Errore creazione Sala Riunioni:", e);
    }
}

// AUTENTICAZIONE E CONTROLLO EMAIL AUTORIZZATA
onAuthStateChanged(auth, async (user) => { 
    if (user) { 
        const emailNormalizzata = user.email.toLowerCase().trim();
        
        // Controllo ferreo: Solo email in elenco
        if (!EMAIL_AUTORIZZATE.includes(emailNormalizzata)) {
            alert("⚠️ La tua email (" + user.email + ") non è tra i componenti autorizzati della famiglia.");
            await signOut(auth);
            return;
        }

        utenteCorrente = user; 
        const nomeDefinito = user.displayName || formattaNomeEmail(user.email); 
        loginScreen.style.display = 'none'; 
        chatScreen.style.display = 'flex'; 

        try { 
            await setDoc(doc(db, "users", user.uid), { 
                uid: user.uid, nome: nomeDefinito, email: user.email, stato: "🟢 Online", typingTo: null 
            }, { merge: true }); 
        } catch(e) {} 

        await assicuraSalaRiunioni();
        richiediESalvaTokenNotifiche(user.uid); 

        onSnapshot(query(collection(db, "users")), (s) => { 
            s.forEach(doc => { 
                const u = doc.data(); 
                dizionarioNomiGlobali[u.uid] = u.nome || formattaNomeEmail(u.email); 
            }); 
        }); 
        caricaContatti(); 
    } else { 
        utenteCorrente = null; 
        chatScreen.style.display = 'none'; 
        loginScreen.style.display = 'flex'; 
        if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; } 
        if (unsubscribeStatoAttivo) { unsubscribeStatoAttivo(); unsubscribeStatoAttivo = null; } 
        Object.keys(ascoltatoriBackground).forEach(k => { if(typeof ascoltatoriBackground[k] === 'function') ascoltatoriBackground[k](); }); 
        ascoltatoriBackground = {}; 
        idChatAttiva = null; 
        clearChatBtn.style.display = 'none'; 
    } 
}); 

messageInput.addEventListener('input', () => { 
    if (!utenteCorrente || !idChatAttiva) return; 
    impostaStatoScrittura(idChatAttiva); 
    clearTimeout(timerScrittura); 
    timerScrittura = setTimeout(() => { impostaStatoScrittura(null); }, 2500); 
}); 

// CARICAMENTO LISTA CHAT
function caricaContatti() { 
    const qUtenti = query(collection(db, "users")); 
    const qGruppi = query(collection(db, "groups")); 
    let utentiSalvati = []; 
    let gruppiSalvati = []; 

    function aggiornaListaLaterale() { 
        contactsList.innerHTML = ''; 

        // 1. SALA RIUNIONI (GRUPPO UNICO FAMIGLIA)
        gruppiSalvati.forEach((gruppo) => { 
            const idChatGruppo = `gruppo_${gruppo.id}`; 
            const voceGruppo = document.createElement('div'); 
            voceGruppo.classList.add('contact-item'); 
            voceGruppo.id = `contatto-${idChatGruppo}`; 
            voceGruppo.style = "padding: 15px; border-bottom: 1px solid var(--border-color); cursor: pointer; display: flex; align-items: center; justify-content: space-between;"; 
            voceGruppo.innerHTML = ` 
                <div style="display: flex; align-items: center; gap: 10px;"> 
                    <div style="width: 40px; height: 40px; background: #8A2BE2; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: white;">🏠</div> 
                    <div> 
                        <div style="font-weight: bold; color: var(--contact-name-color);">${gruppo.name || "Sala Riunioni"}</div> 
                        <div id="anteprima-${idChatGruppo}" style="font-size: 0.8rem; color: var(--text-muted); max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📭 Nessun messaggio</div> 
                    </div> 
                </div> 
                <div id="notifica-${idChatGruppo}" style="display: none; background-color: #8A2BE2; color: white; font-size: 0.75rem; font-weight: bold; min-width: 20px; height: 20px; border-radius: 50%; align-items: center; justify-content: center; padding: 2px;">⚡</div> 
            `; 
            voceGruppo.addEventListener('click', () => { 
                document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active')); 
                voceGruppo.classList.add('active'); 
                idChatAttiva = idChatGruppo; 
                const pallino = document.getElementById(`notifica-${idChatGruppo}`); 
                if (pallino) pallino.style.display = 'none'; 
                apriStanzaChat(gruppo.name || "Sala Riunioni", true, null); 
            }); 
            contactsList.appendChild(voceGruppo); 
            attivaAscoltoBackground(idChatGruppo, true); 
        }); 

        // SEPARATORE CHAT PRIVATE
        if (utentiSalvati.length > 1) { 
            const divisa = document.createElement('div'); 
            divisa.style = "padding: 8px 15px; background: var(--bg-color); font-size: 0.75rem; font-weight: bold; color: var(--text-muted); text-transform: uppercase;"; 
            divisa.innerText = "💬 Chat Private 🔐"; 
            contactsList.appendChild(divisa); 
        } 

        // 2. CONTATTI SINGOLI 1-A-1
        const uidsRendering = new Set(); 
        utentiSalvati.forEach((parente) => { 
            if (parente.uid === utenteCorrente.uid || uidsRendering.has(parente.uid)) return; 
            uidsRendering.add(parente.uid); 
            const ids = [utenteCorrente.uid, parente.uid].sort(); 
            const idChatParente = `${ids[0]}_${ids[1]}`; 

            const voceContatto = document.createElement('div'); 
            voceContatto.classList.add('contact-item'); 
            voceContatto.id = `contatto-${idChatParente}`; 
            voceContatto.style = "padding: 15px; border-bottom: 1px solid var(--border-color); cursor: pointer; display: flex; align-items: center; justify-content: space-between;"; 
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
            attivaAscoltoBackground(idChatParente, false); 
        }); 
    } 

    onSnapshot(qUtenti, (snapshot) => { 
        utentiSalvati = []; const cacheUids = new Set(); 
        snapshot.forEach(doc => { 
            const u = doc.data(); 
            if (!cacheUids.has(u.uid)) { cacheUids.add(u.uid); utentiSalvati.push(u); } 
        }); 
        aggiornaListaLaterale(); 
    }); 
    onSnapshot(qGruppi, (snapshot) => { 
        gruppiSalvati = []; snapshot.forEach(doc => { gruppiSalvati.push({ id: doc.id, ...doc.data() }); }); 
        aggiornaListaLaterale(); 
    }); 
} 

function attivaAscoltoBackground(idChat, isGroup) { 
    if (ascoltatoriBackground[idChat]) return; 
    const percorsoBase = isGroup ? collection(db, "groups", idChat.replace("gruppo_", ""), "messages") : collection(db, "chats", idChat, "messages"); 
    const qNotifiche = query(percorsoBase, orderBy("timestamp", "desc"), limit(1)); 
    let bloccoIniziale = true; 

    ascoltatoriBackground[idChat] = onSnapshot(qNotifiche, (snapMessaggi) => { 
        if (!snapMessaggi.empty) { 
            const ultimoDoc = snapMessaggi.docs[0].data(); 
            const anteprimaTesto = document.getElementById(`anteprima-${idChat}`); 
            const pallinoNotifica = document.getElementById(`notifica-${idChat}`); 
            let testoNotifica = ultimoDoc.text || "Messaggio"; 
            if (ultimoDoc.fileType === 'image') testoNotifica = "📷 Foto"; 
            else if (ultimoDoc.fileType === 'video') testoNotifica = "🎥 Video"; 
            else if (ultimoDoc.fileType === 'audio') testoNotifica = "🎙️ Vocale"; 

            if (anteprimaTesto) anteprimaTesto.innerText = testoNotifica; 

            if (idChatAttiva !== idChat) { 
                if (pallinoNotifica) pallinoNotifica.style.display = 'flex'; 
                if (!bloccoIniziale && document.visibilityState !== 'visible') { 
                    messaggiNonLettiTotali++; 
                    if ('setAppBadge' in navigator) navigator.setAppBadge(messaggiNonLettiTotali).catch(e => console.log(e)); 
                    interfacciaNotificaPush("💬 WhatsFamily 🏡", testoNotifica); 
                } 
            } else { 
                if (pallinoNotifica) pallinoNotifica.style.display = 'none'; 
                if (!bloccoIniziale) riproduciBipNotifica(); 
            } 
        } 
        bloccoIniziale = false; 
    }); 
} 

function interfacciaNotificaPush(titolo, testo) { 
    if ("Notification" in window && Notification.permission === "granted") { 
        navigator.serviceWorker.ready.then(registration => { 
            registration.showNotification(titolo, { 
                body: testo, icon: "./icon001.png", badge: "./icon001.png", 
                vibrate: [200, 100, 200], tag: "whatsfamily-alert", 
                renotify: true, requireInteraction: true 
            }); 
        }); 
    } else { riproduciBipNotifica(); } 
} 

async function aggiungiReazione(msgId, emoji, isGroup) { 
    if (!utenteCorrente || !idChatAttiva) return; 
    const docRef = isGroup ? doc(db, "groups", idChatAttiva.replace("gruppo_", ""), "messages", msgId) : doc(db, "chats", idChatAttiva, "messages", msgId); 
    try { 
        const snap = await getDoc(docRef); 
        if (snap.exists()) { 
            let reazioniAttuali = snap.data().reactions || {}; 
            if (reazioniAttuali[utenteCorrente.uid] === emoji) { delete reazioniAttuali[utenteCorrente.uid]; } 
            else { reazioniAttuali[utenteCorrente.uid] = emoji; } 
            await updateDoc(docRef, { reactions: reazioniAttuali }); 
        } 
    } catch (err) { console.error("Errore reazione:", err); } 
} 

// APERTURA STANZA CHAT
function apriStanzaChat(nomeParente, isGroup = false, idParente = null) { 
    document.body.classList.add('in-chat'); 
    document.getElementById('active-chat-name').innerText = (isGroup ? "🏠 " : "👤 ") + nomeParente; 
    clearChatBtn.style.display = 'flex'; 
    if (unsubscribeStatoAttivo) { unsubscribeStatoAttivo(); unsubscribeStatoAttivo = null; } 

    if (isGroup) { document.getElementById('active-chat-status').innerText = "🏡 Chat Unica di Famiglia"; } 
    else if (idParente) { 
        unsubscribeStatoAttivo = onSnapshot(doc(db, "users", idParente), (docSnap) => { 
            if (docSnap.exists()) { 
                const datiParente = docSnap.data(); 
                if (datiParente.typingTo === idChatAttiva) { 
                    document.getElementById('active-chat-status').innerHTML = "<span style='color: #adff2f; font-weight: bold;'>✍️ Sta scrivendo...</span>"; 
                } else { document.getElementById('active-chat-status').innerText = datiParente.stato || "💤 Offline"; } 
            } 
        }); 
    } 

    messageInput.disabled = false; 
    messageInput.placeholder = "✏️ Scrivi un messaggio..."; 
    if (unsubscribeChat) unsubscribeChat(); 

    const percorsoMessaggi = isGroup ? query(collection(db, "groups", idChatAttiva.replace("gruppo_", ""), "messages"), orderBy("timestamp", "asc")) : query(collection(db, "chats", idChatAttiva, "messages"), orderBy("timestamp", "asc")); 

    unsubscribeChat = onSnapshot(percorsoMessaggi, (snapshot) => { 
        chatContainer.innerHTML = ''; 
        snapshot.forEach((docMsg) => { 
            const dati = docMsg.data(); 
            const msgId = docMsg.id;   
            const mioMessaggio = (dati.senderId === utenteCorrente.uid); 
            const tipoMessaggio = mioMessaggio ? "sent" : "received"; 
                
            if (!mioMessaggio && !isGroup && !dati.letto) { 
                updateDoc(doc(db, "chats", idChatAttiva, "messages", msgId), { letto: true, consegnato: true }).catch(e => console.error(e)); 
            } else if (!mioMessaggio && !isGroup && !dati.consegnato) {
                updateDoc(doc(db, "chats", idChatAttiva, "messages", msgId), { consegnato: true }).catch(e => console.error(e));
            }

            let oraFormattata = dati.timestamp ? dati.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"; 
            let nomeMittente = mioMessaggio ? '😎 Tu' : (dizionarioNomiGlobali[dati.senderId] || nomeParente); 

            const contenitoreMessaggioEsterno = document.createElement('div'); 
            contenitoreMessaggioEsterno.classList.add('message-wrapper', tipoMessaggio); 

            let contenutoMessaggio = ''; 
            if (dati.fileType === 'image') { 
                contenutoMessaggio = `<a href="${dati.fileUrl}" target="_blank"><img src="${dati.fileUrl}" style="max-width: 100%; max-height: 250px; border-radius: 8px; margin-top: 5px; display: block;" alt="Foto"></a>`; 
            } else if (dati.fileType === 'video') { 
                contenutoMessaggio = `<video src="${dati.fileUrl}" controls style="max-width: 100%; max-height: 250px; border-radius: 8px; margin-top: 5px; display: block;"></video>`; 
            } else if (dati.fileType === 'audio') { 
                contenutoMessaggio = `<div class="voice-message-player"><span>🎙️ Vocale</span><audio src="${dati.fileUrl}" controls controlsList="nodownload" style="height: 35px;"></audio></div>`; 
            } else { contenutoMessaggio = `<p style="margin: 0; word-break: break-word;">${dati.text}</p>`; } 

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
                if (dati.letto) { spunteHtml = `<span style="color: #24a0ed; margin-left: 5px; font-weight: bold; font-size: 0.85rem;">✓✓</span>`; } 
                else if (dati.consegnato) { spunteHtml = `<span style="color: var(--text-muted); margin-left: 5px; font-size: 0.85rem;">✓✓</span>`; } 
                else { spunteHtml = `<span style="color: var(--text-muted); margin-left: 5px; font-size: 0.85rem;">✓</span>`; } 
            } 

            contenitoreMessaggioEsterno.innerHTML = ` 
                ${reactionBarHtml} 
                <div class="message ${tipoMessaggio}"> 
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;"> 
                        <span class="sender-name">${nomeMittente}</span> 
                        <button class="delete-btn" title="Elimina messaggio 🗑️">🗑️</button> 
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
                btn.addEventListener('click', (e) => { e.stopPropagation(); aggiungiReazione(msgId, btn.getAttribute('data-emoji'), isGroup); contenitoreMessaggioEsterno.classList.remove('show-reactions'); }); 
            }); 

            // CANCELLAZIONE SINGOLO MESSAGGIO
            contenitoreMessaggioEsterno.querySelectorAll('.delete-btn').forEach(btn => { 
                btn.addEventListener('click', async (e) => { 
                    e.stopPropagation(); 
                    if (confirm("🚨 Vuoi davvero eliminare questo messaggio?")) { 
                        const docRef = isGroup ? doc(db, "groups", idChatAttiva.replace("gruppo_", ""), "messages", msgId) : doc(db, "chats", idChatAttiva, "messages", msgId); 
                        if (dati.fileUrl) { try { await deleteObject(ref(storage, dati.fileUrl)); } catch (err) {} } 
                        await deleteDoc(docRef); 
                    } 
                }); 
            }); 

            chatContainer.appendChild(contenitoreMessaggioEsterno); 
        }); 
        chatContainer.scrollTop = chatContainer.scrollHeight; 
    }); 
} 

// INVIO FILE E MEDIA
async function gestisciCaricamentoFile(file, isCamera = false) {
    if (!file || !utenteCorrente || !idChatAttiva) return; 
    
    uploadLoader.style.display = 'block'; 
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
     
    const percorsoStorage = ref(storage, `chat_files/${idChatAttiva}/${Date.now()}_${file.name}`); 
    const isGroup = idChatAttiva.startsWith("gruppo_");  
    const percorsoInvia = isGroup ? collection(db, "groups", idChatAttiva.replace("gruppo_", ""), "messages") : collection(db, "chats", idChatAttiva, "messages"); 

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
        console.error("Errore caricamento:", err); 
        alert("Ops! Caricamento non riuscito. Riprova.");
    } finally { 
        uploadLoader.style.display = 'none'; 
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
voiceBtn.addEventListener('click', async () => {  
    if (!utenteCorrente || !idChatAttiva) return;  
    
    if (!isRecording) { 
        try { 
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); 
            audioChunks = []; 

            let tipoMimeSupportato = "audio/webm";
            let estensioneFile = "webm";

            if (!MediaRecorder.isTypeSupported("audio/webm")) {
                if (MediaRecorder.isTypeSupported("audio/mp4")) {
                    tipoMimeSupportato = "audio/mp4";
                    estensioneFile = "mp4";
                } else if (MediaRecorder.isTypeSupported("audio/aac")) {
                    tipoMimeSupportato = "audio/aac";
                    estensioneFile = "aac";
                }
            }

            mediaRecorder = new MediaRecorder(stream, { mimeType: tipoMimeSupportato }); 
            
            mediaRecorder.addEventListener("dataavailable", e => audioChunks.push(e.data)); 
            mediaRecorder.addEventListener("stop", async () => { 
                const audioBlob = new Blob(audioChunks, { type: tipoMimeSupportato }); 
                uploadLoader.style.display = 'block'; 
                
                const percorsoStorage = ref(storage, `chat_files/${idChatAttiva}/${Date.now()}_vocale.${estensioneFile}`); 
                const isGroup = idChatAttiva.startsWith("gruppo_"); 
                const percorsoInvia = isGroup ? collection(db, "groups", idChatAttiva.replace("gruppo_", ""), "messages") : collection(db, "chats", idChatAttiva, "messages"); 
                
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
                    console.error("Errore vocale:", err);
                } finally { 
                    uploadLoader.style.display = 'none'; 
                    stream.getTracks().forEach(t => t.stop()); 
                } 
            }); 
            
            mediaRecorder.start(); 
            isRecording = true; 
            voiceBtn.innerText = "⏹️"; 
            voiceBtn.style.backgroundColor = "#ff4d4d"; 
            voiceBtn.style.color = "#ffffff"; 
            recordSeconds = 0; 
            messageInput.placeholder = "🔴 REGISTRAZIONE IN CORSO: 00:00"; 
            messageInput.disabled = true; 
            
            recordTimerInterval = setInterval(() => { 
                recordSeconds++; 
                const m = String(Math.floor(recordSeconds / 60)).padStart(2, '0'); 
                const s = String(recordSeconds % 60).padStart(2, '0'); 
                messageInput.placeholder = `🔴 REGISTRAZIONE IN CORSO: ${m}:${s}`; 
            }, 1000); 
        } catch (err) { 
            alert("Attiva i permessi per il microfono!"); 
        } 
    } else { 
        if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop(); 
        clearInterval(recordTimerInterval); 
        isRecording = false; 
        voiceBtn.innerText = "🎙️"; 
        voiceBtn.style.backgroundColor = "var(--border-color)"; 
        voiceBtn.style.color = "var(--text-color)"; 
        messageInput.placeholder = "✏️ Scrivi un messaggio..."; 
        messageInput.disabled = false; 
    } 
});

// RIPULISCI INTERA CHAT (PULSANTE SCOPA 🧹)
clearChatBtn.addEventListener('click', async () => {  
    if (!utenteCorrente || !idChatAttiva) return;  
    if (confirm("🧹 Vuoi cancellare TUTTI i messaggi di questa chat?")) { 
        const isGroup = idChatAttiva.startsWith("gruppo_"); 
        const percorsoChat = isGroup ? collection(db, "groups", idChatAttiva.replace("gruppo_", ""), "messages") : collection(db, "chats", idChatAttiva, "messages"); 
        try { 
            uploadLoader.style.display = 'block'; 
            const snapshot = await getDocs(percorsoChat); 
            const batchPromesse = snapshot.docs.map(async (docu) => { 
                if (docu.data().fileUrl) { try { await deleteObject(ref(storage, docu.data().fileUrl)); } catch (e) {} } 
                return deleteDoc(doc(percorsoChat, docu.id)); 
            }); 
            await Promise.all(batchPromesse); 
        } catch (err) {} finally { uploadLoader.style.display = 'none'; } 
    } 
}); 

// MENU EMOJI PER IL CAMPO DI TESTO
if (emojiBtn && emojiPickerPanel) {
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const displayAttuale = window.getComputedStyle(emojiPickerPanel).display;
        emojiPickerPanel.style.display = (displayAttuale === 'none') ? 'grid' : 'none';
    });

    emojiPickerPanel.querySelectorAll('span').forEach(emojiSpan => {
        emojiSpan.addEventListener('click', () => {
            messageInput.value += emojiSpan.innerText;
            emojiPickerPanel.style.display = 'none';
            messageInput.focus();
        });
    });

    document.addEventListener('click', (e) => {
        if (!emojiPickerPanel.contains(e.target) && e.target !== emojiBtn) {
            emojiPickerPanel.style.display = 'none';
        }
    });
}

// INVIO MESSAGGIO DI TESTO
inputForm.addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const testo = messageInput.value.trim(); 
    if (!testo || !utenteCorrente || !idChatAttiva) return; 
    const isGroup = idChatAttiva.startsWith("gruppo_"); 
    const percorsoInvia = isGroup ? collection(db, "groups", idChatAttiva.replace("gruppo_", ""), "messages") : collection(db, "chats", idChatAttiva, "messages"); 
    messageInput.value = ''; 
    await impostaStatoScrittura(null); 
    try { await addDoc(percorsoInvia, { text: testo, senderId: utenteCorrente.uid, timestamp: serverTimestamp(), consegnato: false, letto: false }); } catch (err) {} 
}); 

// SUBMIT FORM LOGIN
loginForm.addEventListener('submit', async (e) => {  
    e.preventDefault(); 
    const email = document.getElementById('login-email').value.trim(); 
    const password = document.getElementById('login-password').value; 
    if (!email || !password) return; 
    try { 
        await signInWithEmailAndPassword(auth, email, password); 
        loginForm.reset(); 
    } catch (error) { 
        alert("Errore di accesso! Controlla email e password."); 
    } 
}); 

// LOGOUT
logoutBtn.addEventListener('click', async () => {  
    if (confirm("🚪 Vuoi uscire dalla chat di famiglia?")) { 
        await impostaStatoUtente("💤 Offline"); 
        await impostaStatoScrittura(null); 
        await signOut(auth); 
    } 
}); 

// FRECCIA INDIETRO PER MOBILE
backBtn.addEventListener('click', async () => {  
    document.body.classList.remove('in-chat'); 
    idChatAttiva = null; 
    clearChatBtn.style.display = 'none'; 
    if (unsubscribeStatoAttivo) { unsubscribeStatoAttivo(); unsubscribeStatoAttivo = null; } 
    await impostaStatoScrittura(null); 
});
