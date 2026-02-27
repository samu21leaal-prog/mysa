// api/ml-orders.js
// Diseñado para NO hacer timeout: solo trae UNA página de órdenes por llamada.
// El frontend llama repetidamente con ?offset=N hasta agotar todas las órdenes.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const accessToken =
      req.query.token ||
      (req.headers.authorization || "").replace("Bearer ", "").trim() ||
      null;

    if (!accessToken) return res.status(400).json({ error: "Missing access token" });

    // 1. Obtener sellerId
    const meRes = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meData = await meRes.json();
    if (meData.error) return res.status(401).json({ error: "Token inválido", detail: meData.message });

    const sellerId = meData.id;
    const offset   = Number(req.query.offset) || 0;
    const limit    = 50; // máximo permitido por ML

    // 2. Traer UNA página
    const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&sort=date_desc&limit=${limit}&offset=${offset}`;
    const r   = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await r.json();

    if (data.error) return res.status(400).json({ error: data.error, detail: data.message });

    return res.status(200).json({
      ok:      true,
      orders:  data.results || [],
      total:   data.paging?.total || 0,
      offset,
      limit,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
