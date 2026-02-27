// api/ml-orders.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.query.ping === "1") return res.status(200).json({ ok: true });

    const accessToken =
      req.query.token ||
      (req.headers.authorization || "").replace("Bearer ", "").trim() ||
      null;

    if (!accessToken) return res.status(400).json({ error: "Missing ML access token" });

    const soloListar = req.query.list === "1";

    // Obtener sellerId del token
    const meRes = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meData = await meRes.json();
    if (meData.error) return res.status(401).json({ error: "Token inválido o expirado", detail: meData.message });
    const sellerId = meData.id;

    // Traer TODAS las órdenes con paginación completa
    const LIMIT = 50;
    const maxOrders = Number(req.query.max) || 500;
    let offset = 0;
    let allOrders = [];
    let totalDisponible = null;

    while (true) {
      const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&sort=date_desc&limit=${LIMIT}&offset=${offset}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await r.json();
      if (data.error) return res.status(400).json({ error: data.error, detail: data.message });

      const results = data.results || [];
      allOrders = allOrders.concat(results);
      if (totalDisponible === null) totalDisponible = data.paging?.total || results.length;
      if (results.length < LIMIT || allOrders.length >= totalDisponible || allOrders.length >= maxOrders) break;
      offset += LIMIT;
    }

    if (soloListar) return res.status(200).json({ ok: true, orders: allOrders, total: totalDisponible });

    // Importar a Supabase
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: "Missing Supabase env vars" });

    const prodRes = await fetch(`${SUPABASE_URL}/rest/v1/productos?select=id,nombre,sku,costo,stock`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const productos = await prodRes.json();

    const inserts = [];
    const issues = [];
    let duplicados = 0;

    for (const order of allOrders) {
      const existRes = await fetch(
        `${SUPABASE_URL}/rest/v1/ventas?ml_order_id=eq.${order.id}&select=id&limit=1`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      );
      const exist = await existRes.json();
      if (exist && exist.length > 0) { duplicados++; continue; }

      for (const item of order.order_items || []) {
        const itemId = item?.item?.id;
        if (!itemId) continue;

        let sellerSku = item.item?.seller_sku || null;

        if (!sellerSku) {
          try {
            const itemRes = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            const itemData = await itemRes.json();
            sellerSku = itemData.seller_sku ||
              (itemData.attributes || []).find(a => a.id === "SELLER_SKU" || a.id === "SKU")?.value_name ||
              null;
          } catch (_) {}
        }

        const prod = sellerSku
          ? (productos || []).find(p => p.sku && p.sku.trim().toLowerCase() === sellerSku.trim().toLowerCase())
          : null;

        if (sellerSku && !prod) issues.push({ order: order.id, reason: "SKU_NOT_FOUND", sku: sellerSku });

        inserts.push({
          canal: "mercadolibre",
          ml_order_id: String(order.id),
          ml_item_id: String(itemId),
          seller_sku: sellerSku || null,
          producto_id: prod?.id || null,
          producto_nombre: item.item?.title || "ML",
          cantidad: item.quantity || 1,
          precio_unitario: item.unit_price || 0,
          total: (item.quantity || 1) * (item.unit_price || 0),
          costo_envio: Number(order.shipping?.cost || 0),
          comision_ml: Number(order.payments?.[0]?.marketplace_fee || 0),
          costo_producto: prod ? prod.costo * (item.quantity || 1) : 0,
          fecha: order.date_created?.split("T")[0] || new Date().toISOString().split("T")[0],
        });

        if (prod) {
          const nuevoStock = Math.max(0, prod.stock - (item.quantity || 1));
          await fetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${prod.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
            body: JSON.stringify({ stock: nuevoStock }),
          });
          prod.stock = nuevoStock;
        }
      }
    }

    if (inserts.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/ventas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(inserts),
      });
    }

    return res.status(200).json({
      ok: true,
      total_ordenes: allOrders.length,
      inserted: inserts.length,
      duplicados,
      sku_no_encontrado: issues.filter(i => i.reason === "SKU_NOT_FOUND").length,
      issues,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
