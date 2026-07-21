const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// 1. NOTIFICHE PER LE CHAT PRIVATE 🔐
exports.inviaNotificaChatPrivata = onDocumentCreated("chats/{chatId}/messages/{messageId}", async (event) => {
    const datiMessaggio = event.data.data();
    if (!datiMessaggio) return null;
    
    const chatId = event.params.chatId;
    const partecipanti = chatId.split("_");
    const idDestinatario = partecipanti.find(uid => uid !== datiMessaggio.senderId);
    
    if (!idDestinatario) return null;

    try {
        const userSnap = await db.collection("users").doc(idDestinatario).get();
        if (!userSnap.exists) {
            console.log(`Documento utente ${idDestinatario} non trovato.`);
            return null;
        }
        
        const datiDestinatario = userSnap.data() || {};
        
        // Verifica se l'utente sta già attivamente guardando la conversazione
        if (datiDestinatario.stato === "🟢 Online" && datiDestinatario.typingTo === datiMessaggio.senderId) {
            console.log("L'utente sta già guardando questa chat. Notifica push saltata.");
            return null;
        }

        const tokenFCM = datiDestinatario.fcmToken;
        if (!tokenFCM) {
            console.log(`L'utente ${idDestinatario} non ha un fcmToken registrato.`);
            return null;
        }

        const mittenteSnap = await db.collection("users").doc(datiMessaggio.senderId).get();
        const nomeMittente = mittenteSnap.exists ? ((mittenteSnap.data() || {}).nome || "Qualcuno") : "Un familiare";

        let testoNotifica = datiMessaggio.text || "Ti ha inviato un file";
        if (datiMessaggio.fileType === "image") testoNotifica = "📷 Foto";
        else if (datiMessaggio.fileType === "video") testoNotifica = "🎥 Video";
        else if (datiMessaggio.fileType === "audio") testoNotifica = "🎙️ Vocale";

        // STRUTTURA AD ALTA VELOCITÀ SENZA DOPPIONI
        const payload = {
            token: tokenFCM,
            data: {
                title: `💬 ${nomeMittente}`,
                body: testoNotifica,
                chatId: chatId
            },
            android: {
                priority: "high"
            },
            webpush: {
                headers: { Urgency: "high" }
            }
        };

        const response = await messaging.send(payload);
        console.log("Notifica privata inviata con successo:", response);
    } catch (error) {
        console.error("Errore nell'invio della notifica privata:", error);
    }
    return null;
});

// 2. NOTIFICHE PER I GRUPPI DI FAMIGLIA 👥
exports.inviaNotificaGruppo = onDocumentCreated("groups/{groupId}/messages/{messageId}", async (event) => {
    const datiMessaggio = event.data.data();
    if (!datiMessaggio) return null;
    
    const groupId = event.params.groupId;

    try {
        const gruppoSnap = await db.collection("groups").doc(groupId).get();
        if (!gruppoSnap.exists) return null;
        
        const datiGruppo = gruppoSnap.data() || {};
        const membri = datiGruppo.members || [];

        const mittenteSnap = await db.collection("users").doc(datiMessaggio.senderId).get();
        const nomeMittente = mittenteSnap.exists ? ((mittenteSnap.data() || {}).nome || "Qualcuno") : "Un familiare";

        let testoNotifica = datiMessaggio.text || "Ha inviato un file";
        if (datiMessaggio.fileType === "image") testoNotifica = "📷 Foto";
        else if (datiMessaggio.fileType === "video") testoNotifica = "🎥 Video";
        else if (datiMessaggio.fileType === "audio") testoNotifica = "🎙️ Vocale";

        const destinatariPromesse = membri
            .filter(uid => uid !== datiMessaggio.senderId)
            .map(uid => db.collection("users").doc(uid).get());

        const utentiSnap = await Promise.all(destinatariPromesse);
        const tokens = [];

        utentiSnap.forEach(uSnap => {
            if (uSnap.exists) {
                const datiU = uSnap.data() || {};
                if (datiU.fcmToken) {
                    tokens.push(datiU.fcmToken);
                }
            }
        });

        if (tokens.length === 0) {
            console.log("Nessun token valido trovato per i membri del gruppo.");
            return null;
        }

        // STRUTTURA AD ALTA VELOCITÀ MULTICAST SENZA DOPPIONI
        const payload = {
            tokens: tokens,
            data: {
                title: `👥 ${datiGruppo.name} (${nomeMittente})`,
                body: testoNotifica,
                groupId: groupId
            },
            android: {
                priority: "high"
            },
            webpush: {
                headers: { Urgency: "high" }
            }
        };

        const response = await messaging.sendEachForMulticast(payload);
        console.log(`${response.successCount} notifiche di gruppo inviate.`);
    } catch (error) {
        console.error("Errore nell'invio della notifica di gruppo:", error);
    }
    return null;
});
