const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

const ID_SALA_RIUNIONI = "chat_sala_riunioni";

// GESTORE UNICO PER NOTIFICHE (PRIVATE E SALA RIUNIONI)
exports.gestisciNotificheChat = onDocumentCreated("chats/{chatId}/messages/{messageId}", async (event) => {
    const datiMessaggio = event.data.data();
    if (!datiMessaggio) return null;

    const chatId = event.params.chatId;
    const senderId = datiMessaggio.senderId;

    try {
        // Recupera nome mittente
        const mittenteSnap = await db.collection("users").doc(senderId).get();
        const nomeMittente = mittenteSnap.exists ? ((mittenteSnap.data() || {}).nome || "Qualcuno") : "Un familiare";

        let testoNotifica = datiMessaggio.text || "Ha inviato un allegato";
        if (datiMessaggio.fileType === "image") testoNotifica = "📷 Foto";
        else if (datiMessaggio.fileType === "video") testoNotifica = "🎥 Video";
        else if (datiMessaggio.fileType === "audio") testoNotifica = "🎙️ Vocale";

        // CASO 1: SALA RIUNIONI
        if (chatId === ID_SALA_RIUNIONI) {
            const utentiSnap = await db.collection("users").get();
            const tokens = [];
            const tokenToUidMap = {}; // Per tracciare quali token appartengono a quali utenti in caso di errori

            utentiSnap.forEach(uDoc => {
                const datiU = uDoc.data() || {};
                
                // Salta se è il mittente o se l'utente è attualmente dentro la Sala Riunioni
                if (uDoc.id !== senderId && datiU.typingTo !== ID_SALA_RIUNIONI) {
                    if (datiU.fcmToken) {
                        tokens.push(datiU.fcmToken);
                        tokenToUidMap[datiU.fcmToken] = uDoc.id;
                    }
                }
            });

            if (tokens.length === 0) return null;

            const payloadGruppo = {
                tokens: tokens,
                notification: {
                    title: `🏠 Sala Riunioni (${nomeMittente})`,
                    body: testoNotifica
                },
                data: {
                    title: `🏠 Sala Riunioni (${nomeMittente})`,
                    body: testoNotifica,
                    chatId: chatId,
                    icon: "./icon001.png"
                },
                android: {
                    priority: "high",
                    notification: { sound: "default", priority: "high", channelId: "default" }
                },
                apns: {
                    payload: { aps: { sound: "default", badge: 1, "content-available": 1 } }
                },
                webpush: {
                    headers: { Urgency: "high" },
                    fcmOptions: {
                        link: "./index.html"
                    }
                }
            };

            const response = await messaging.sendEachForMulticast(payloadGruppo);
            console.log(`✅ Notifiche Sala Riunioni inviate: ${response.successCount} con successo, ${response.failureCount} fallite.`);

            // Pulizia automatica dei token FCM scaduti o non più validi
            if (response.failureCount > 0) {
                const cleanupPromises = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const errorCode = resp.error?.code;
                        if (errorCode === "messaging/invalid-registration-token" || errorCode === "messaging/registration-token-not-registered") {
                            const failedToken = tokens[idx];
                            const failedUid = tokenToUidMap[failedToken];
                            if (failedUid) {
                                console.log(`🗑️ Rimuovo token scaduto per utente: ${failedUid}`);
                                cleanupPromises.push(db.collection("users").doc(failedUid).update({ fcmToken: null }));
                            }
                        }
                    }
                });
                await Promise.all(cleanupPromises);
            }

        } else {
            // CASO 2: CHAT PRIVATA 1-A-1
            const partecipanti = chatId.split("_");
            const idDestinatario = partecipanti.find(uid => uid !== senderId);

            if (!idDestinatario) return null;

            const userSnap = await db.collection("users").doc(idDestinatario).get();
            if (!userSnap.exists) return null;

            const datiDestinatario = userSnap.data() || {};

            // Notifica inviata solo se il destinatario NON ha aperta la chat
            if (datiDestinatario.typingTo === chatId) {
                console.log("L'utente sta già guardando questa specifica chat. Notifica saltata.");
                return null;
            }

            const tokenFCM = datiDestinatario.fcmToken;
            if (!tokenFCM) {
                console.log("Destinatario privo di token FCM.");
                return null;
            }

            const payloadPrivato = {
                token: tokenFCM,
                notification: {
                    title: `💬 ${nomeMittente}`,
                    body: testoNotifica
                },
                data: {
                    title: `💬 ${nomeMittente}`,
                    body: testoNotifica,
                    chatId: chatId,
                    icon: "./icon001.png"
                },
                android: {
                    priority: "high",
                    notification: { sound: "default", priority: "high", channelId: "default" }
                },
                apns: {
                    payload: { aps: { sound: "default", badge: 1, "content-available": 1 } }
                },
                webpush: {
                    headers: { Urgency: "high" },
                    fcmOptions: {
                        link: "./index.html"
                    }
                }
            };

            try {
                await messaging.send(payloadPrivato);
                console.log("✅ Notifica Privata inviata a:", idDestinatario);
            } catch (sendError) {
                if (sendError.code === "messaging/invalid-registration-token" || sendError.code === "messaging/registration-token-not-registered") {
                    console.log(`🗑️ Rimuovo token scaduto per utente: ${idDestinatario}`);
                    await db.collection("users").doc(idDestinatario).update({ fcmToken: null });
                } else {
                    throw sendError;
                }
            }
        }

    } catch (error) {
        console.error("❌ Errore nell'invio della notifica:", error);
    }
    return null;
});
