import * as admin from "firebase-admin";

if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: "micriptoapp"
    });
}

const db = admin.firestore();

async function checkAlerts() {
    try {
        console.log("Fetching config/alerts...");
        const doc = await db.collection("config").doc("alerts").get();
        if (!doc.exists) {
            console.log("No config/alerts document found.");
            return;
        }
        const data = doc.data();
        if (!data) {
            console.log("No data in doc.");
            return;
        }
        console.log("--- investmentAlerts ---");
        console.log(JSON.stringify(data.investmentAlerts, null, 2));
        console.log("--- globalAlerts ---");
        console.log(JSON.stringify(data.globalAlerts, null, 2));
    } catch (e: any) {
        console.error("Error reading Firestore:", e.message);
    }
}

checkAlerts();
