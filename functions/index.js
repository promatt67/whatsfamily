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
    const chatId = event.params.chatId;
    
    // Troviamo l'ID del destinatario confrontando i due UID presenti nell'ID della chat
    const partecipanti = chatId.split("_");
    const idDestinatario = partecipanti.find(uid => uid !== datiMessaggio.senderId);
    
    if (!idDestinatario) return null;

    try {
        // Recuperiamo il documento del destinatario per controllare lo stato e il Token FCM
        const userSnap = await db.collection("users").doc(idDestinatario).get();
        if (!userSnap.exists) return null;
        
        const datiDestinatario = userSnap.data();
        
        // Se il destinatario è già online nella nostra chat, non inviamo la notifica push
        if (datiDestinatario.stato === "🟢 Online" && datiDestinatario.typingTo !== null) {
            console.log("Utente online, notifica push non necessaria.");
            return null;
        }

        const tokenFCM = datiDestinatario.fcmToken;
        if (!tokenFCM) {
            console.log("L'utente non ha un token di notifica registrato.");
            return null;
        }

        // Recuperiamo il nome del mittente per personalizzare la notifica
        const mittenteSnap = await db.collection("users").doc(datiMessaggio.senderId).get();
        const nomeMittente = mittenteSnap.exists ? (mittenteSnap.data().nome || "Qualcuno") : "Un familiare";

        let testoNotifica = datiMessaggio.text || "Ti ha inviato un file";
        if (datiMessaggio.fileType === "image") testoNotifica = "📷 Foto";
        else if (datiMessaggio.fileType === "video") testoNotifica = "🎥 Video";
        else if (datiMessaggio.fileType === "audio") testoNotifica = "🎙️ Vocale";

        // Costruiamo il pacchetto della notifica
        const payload = {
            token: tokenFCM,
            notification: {
                title: `💬 ${nomeMittente}`,
                body: testoNotifica
            },
            android: {
                priority: "high", // Forza la sveglia del telefono anche in standby profondo (Doze Mode)
                notification: {
                    sound: "default",
                    clickAction: "FLUTTER_NOTIFICATION_CLICK", // Standard per far aprire l'app al click
                    icon: "stock_ticker_update"
                }
            },
            webpush: {
                headers: {
                    Urgency: "high"
                },
                notification: {
                    icon: "/icon001.png",
                    badge: "/icon001.png",
                    requireInteraction: true
                }
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
    const groupId = event.params.groupId;

    try {
        // Recuperiamo i dati del gruppo per sapere chi sono i membri
        const gruppoSnap = await db.collection("groups").doc(groupId).get();
        if (!gruppoSnap.exists) return null;
        
        const datiGruppo = gruppoSnap.data();
        const membri = datiGruppo.members || [];

        // Recuperiamo il nome del mittente
        const mittenteSnap = await db.collection("users").doc(datiMessaggio.senderId).get();
        const nomeMittente = mittenteSnap.exists ? (mittenteSnap.data().nome || "Qualcuno") : "Un familiare";

        let testoNotifica = datiMessaggio.text || "Ha inviato un file";
        if (datiMessaggio.fileType === "image") testoNotifica = "📷 Foto";
        else if (datiMessaggio.fileType === "video") testoNotifica = "🎥 Video";
        else if (datiMessaggio.fileType === "audio") testoNotifica = "🎙️ Vocale";

        // Troviamo i token di tutti i membri del gruppo tranne chi ha inviato il messaggio
        const destinatariPromesse = membri
            .filter(uid => uid !== datiMessaggio.senderId)
            .map(uid => db.collection("users").doc(uid).get());

        const utentiSnap = await Promise.all(destinatariPromesse);
        const tokens = [];

        utentiSnap.forEach(uSnap => {
            if (uSnap.exists) {
                const datiU = uSnap.data();
                // Inviamo solo a chi non è attivo in questo momento nella chat
                if (datiU.fcmToken && datiU.stato !== "🟢 Online") {
                    tokens.push(datiU.fcmToken);
                }
            }
        });

        if (tokens.length === 0) {
            console.log("Nessun destinatario offline nel gruppo.");
            return null;
        }

        // Inviamo la notifica a tutti i token in un colpo solo
        const payload = {
            tokens: tokens,
            notification: {
                title: `👥 ${datiGruppo.name} (${nomeMittente})`,
                body: testoNotifica
            },
            android: {
                priority: "high",
                notification: {
                    sound: "default"
                }
            },
            webpush: {
                headers: {
                    Urgency: "high"
                },
                notification: {
                    icon: "/icon001.png",
                    badge: "/icon001.png"
                }
            }
        };

        const response = await messaging.sendEachForMulticast(payload);
        console.log(`${response.successCount} notifiche di gruppo inviate con successo.`);
    } catch (error) {
        console.error("Errore nell'invio della notifica di gruppo:", error);
    }
    return null;
});
