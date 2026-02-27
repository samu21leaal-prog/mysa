// api/ml-orders.js
// Devuelve UNA página (50 órdenes) por llamada.
// El frontend pagina llamando con ?offset=0, ?offset=50, etc.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // Token: desde Supabase (lo lee el frontend y lo pasa) o header
    const token =
      req.query.token ||
      (req.headers.authorization || "").replace("Bearer ", "").trim() ||
      null;

    if (!token) return res.status(400).json({ error: "Falta el access token" });

    const offset = Number(req.query.offset) || 0;
    const limit  = 50;

    // Obtener sellerId
    const meRes  = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meText = await meRes.text();
    if (!meText || meText.trim() === "") {
      return res.status(502).json({ error: "ML no respondió en /users/me" });
    }
    const me = JSON.parse(meText);
    if (me.error) {
      return res.status(401).json({ error: "Token inválido o expirado", detail: me.message });
    }

    // Traer página de órdenes
    const url     = `https://api.mercadolibre.com/orders/search?seller=${me.id}&sort=date_desc&limit=${limit}&offset=${offset}`;
    const ordRes  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const ordText = await ordRes.text();

    if (!ordText || ordText.trim() === "") {
      return res.status(502).json({ error: "ML no respondió en /orders/search", seller_id: me.id, offset });
    }

    const ord = JSON.parse(ordText);
    if (ord.error) {
      return res.status(400).json({ error: ord.error, detail: ord.message, seller_id: me.id });
    }

    return res.status(200).json({
      ok:      true,
      orders:  ord.results  || [],
      total:   ord.paging?.total || 0,
      offset,
      limit,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
