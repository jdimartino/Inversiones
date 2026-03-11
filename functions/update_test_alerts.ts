import * as admin from "firebase-admin";

if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: "micriptoapp"
    });
}

const db = admin.firestore();

async function updateAlerts() {
    try {
        const docRef = db.collection("config").doc("alerts");
        const doc = await docRef.get();
        const data = doc.data() || {};
        
        const investmentAlerts = data.investmentAlerts || {};
        
        // spts... and xjF... were identified as orphaned. 
        // 6swnUV9ynXBDJCtzK5Sa is a valid ADA investment.
        
        investmentAlerts["6swnUV9ynXBDJCtzK5Sa"] = [
            {
                type: 'pnl',
                targetPercent: -2,
                direction: 'down',
                isPersistent: true
            },
            {
                type: 'price',
                targetValue: 0.27,
                direction: 'down',
                isPersistent: true
            }
        ];
        
        await docRef.update({ investmentAlerts });
        console.log("ADA test alerts configured successfully.");
    } catch (e: any) {
        console.error("Error updating alerts:", e.message);
    }
}

updateAlerts();
