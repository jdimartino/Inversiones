const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

async function check() {
    const { data: tickerData } = await axios.get("https://api.mexc.com/api/v3/ticker/price");
    const prices = {};
    for (const item of tickerData) {
        prices[item.symbol] = parseFloat(item.price);
    }
    
    const snap = await db.collection("inversiones").where("coin", "==", "DOGE").get();
    snap.forEach(doc => {
        const inv = doc.data();
        const price = prices["DOGEUSDT"];
        const currentValue = price * inv.quantity;
        const pnl = currentValue - inv.invested;
        const roi = (pnl / inv.invested) * 100;
        console.log(`DOGE ROI con MEXC: ${roi.toFixed(2)}% (Precio: ${price})`);
    });
}
check().catch(console.error);
