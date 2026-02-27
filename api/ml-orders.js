// api/ml-orders.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Siempre responder JSON, nunca dejar la conexión colgada
  try {
    const accessToken =
      req.query.token ||
      (req.headers.authorization || "").replace("Bearer ", "").trim() ||
      null;

    if (!accessToken) {
      return res.status(400).json({ error: "Missing access token" });
    }

    // Paso 1: verificar token con ML
    let meData;
    try {
      const meRes = await fetch("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const meText = await meRes.text();
      meData = JSON.parse(meText);
    } catch (e) {
      return res.status(500).json({ error: "Error al contactar ML /users/me", detail: e.message });
    }

    if (!meData || meData.error) {
      return res.status(401).json({ error: "Token inválido", detail: meData?.message || "sin detalle" });
    }

    const sellerId = meData.id;
    const offset   = Number(req.query.offset) || 0;
    const limit    = 50;

    // Paso 2: traer órdenes
    let ordersData;
    try {
      const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&sort=date_desc&limit=${limit}&offset=${offset}`;
      const r   = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const txt = await r.text();
      ordersData = JSON.parse(txt);
    } catch (e) {
      return res.status(500).json({ error: "Error al traer órdenes de ML", detail: e.message });
    }

    if (ordersData.error) {
      return res.status(400).json({ error: ordersData.error, detail: ordersData.message });
    }

    return res.status(200).json({
      ok:     true,
      orders: ordersData.results || [],
      total:  ordersData.paging?.total || 0,
      offset,
      limit,
    });

  } catch (e) {
    // Catch-all: nunca dejar respuesta vacía
    return res.status(500).json({ error: "Error interno", detail: e.message, stack: e.stack?.slice(0, 300) });
  }
}
