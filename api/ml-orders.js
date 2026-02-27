// api/ml-orders.js
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

    if (!accessToken) {
      return res.status(400).json({ error: "Missing access token" });
    }

    // Paso 1: obtener sellerId
    let meData;
    try {
      const meRes = await fetch("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const meText = await meRes.text();
      meData = JSON.parse(meText);
    } catch (e) {
      return res.status(500).json({ error: "Error en /users/me", detail: e.message });
    }

    if (!meData || meData.error) {
      return res.status(401).json({ error: "Token inválido", detail: meData?.message });
    }

    const sellerId = meData.id;
    const offset   = Number(req.query.offset) || 0;
    const limit    = 50;

    // Paso 2: traer órdenes — probamos ambos endpoints de ML
    // ML a veces requiere /orders/search?seller=ID y a veces /orders/search?access_token=...
    let ordersData;
    let lastError = "";

    // Intento A: endpoint con seller ID en query (recomendado)
    try {
      const urlA = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&sort=date_desc&limit=${limit}&offset=${offset}`;
      const rA = await fetch(urlA, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const txtA = await rA.text();
      if (txtA && txtA.trim().length > 0) {
        const parsed = JSON.parse(txtA);
        if (!parsed.error && parsed.results !== undefined) {
          ordersData = parsed;
        } else {
          lastError = `endpoint A: ${parsed.error} — ${parsed.message}`;
        }
      } else {
        lastError = "endpoint A: respuesta vacía";
      }
    } catch (e) {
      lastError = "endpoint A: " + e.message;
    }

    // Intento B: si A falló, probar con /orders/search sin seller explícito
    if (!ordersData) {
      try {
        const urlB = `https://api.mercadolibre.com/orders/search?sort=date_desc&limit=${limit}&offset=${offset}`;
        const rB = await fetch(urlB, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const txtB = await rB.text();
        if (txtB && txtB.trim().length > 0) {
          const parsed = JSON.parse(txtB);
          if (!parsed.error && parsed.results !== undefined) {
            ordersData = parsed;
          } else {
            lastError += ` | endpoint B: ${parsed.error} — ${parsed.message}`;
          }
        } else {
          lastError += " | endpoint B: respuesta vacía";
        }
      } catch (e) {
        lastError += " | endpoint B: " + e.message;
      }
    }

    if (!ordersData) {
      return res.status(500).json({
        error: "No se pudieron obtener órdenes",
        detail: lastError,
        seller_id: sellerId,
      });
    }

    return res.status(200).json({
      ok:        true,
      orders:    ordersData.results || [],
      total:     ordersData.paging?.total || 0,
      offset,
      limit,
      seller_id: sellerId,
    });

  } catch (e) {
    return res.status(500).json({ error: "Error interno", detail: e.message });
  }
}
