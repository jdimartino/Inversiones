const admin = require("firebase-admin");

// Initialize with application default credentials
admin.initializeApp({
  projectId: "micriptoapp"
});

const db = admin.firestore();

async function migrate() {
    console.log("Starting migration...");
    const alertsRef = db.collection("config").doc("alerts");
    const docSnap = await alertsRef.get();
    
    if (!docSnap.exists) {
        console.log("No alerts document found.");
        process.exit(0);
    }
    
    const data = docSnap.data();
    console.log("Current Data:", JSON.stringify(data, null, 2));
    
    const invAlerts = data.investmentAlerts || {};
    const updates = {};
    const invUpdates = {};
    
    // Check if minPNL/maxPNL are nested in investmentAlerts
    if (invAlerts.minPNL !== undefined) {
        updates.minPNL = invAlerts.minPNL;
        invUpdates.minPNL = admin.firestore.FieldValue.delete();
    }
    
    if (invAlerts.maxPNL !== undefined) {
        updates.maxPNL = invAlerts.maxPNL;
        invUpdates.maxPNL = admin.firestore.FieldValue.delete();
    }
    
    if (Object.keys(invUpdates).length > 0) {
        updates.investmentAlerts = invUpdates;
        console.log("Applying updates:", updates);
        await alertsRef.update(updates);
        console.log("Migration successful!");
    } else {
        console.log("No migration needed.");
    }
    process.exit(0);
}

migrate().catch(console.error);
