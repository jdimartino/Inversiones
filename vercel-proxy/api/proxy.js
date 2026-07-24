export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-MBX-APIKEY");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: "Missing url param" });
  }

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("binance.com")) {
      return res.status(403).json({ error: "Only Binance URLs" });
    }

    const headers = {};
    const apiKey = req.headers["x-mbx-apikey"];
    if (apiKey) headers["X-MBX-APIKEY"] = apiKey;

    const response = await fetch(url, { headers });
    const data = await response.text();
    res.setHeader("Content-Type", "application/json");
    return res.status(response.status).send(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
