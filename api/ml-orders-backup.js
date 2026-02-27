// api/ml-orders.js
export default async function handler(req, res) {
  try {
    if (req.query.ping === "1") {
      return res.status(200).json({ ok: true });
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ error: "Missing Supabase env vars" });
    }

    const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
    const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET;

    if (!ML_CLIENT_ID || !ML_CLIENT_SECRET) {
      return res.status(500).json({ error: "Missing ML env vars" });
    }

    const accessToken = req.query.token;
    if (!accessToken) {
      return res.status(400).json({ error: "Missing ML access token" });
    }

    const r = await fetch(
      `https://api.mercadolibre.com/orders/search?access_token=${accessToken}&sort=date_desc`
    );
    const data = await r.json();

    const orders = data.results || [];
    const inserts = [];
    const issues = [];

    for (const order of orders.slice(0, 20)) {
      for (const item of order.order_items || []) {
        const itemId = item?.item?.id;
        if (!itemId) continue;

        const itemRes = await fetch(
          `https://api.mercadolibre.com/items/${itemId}?access_token=${accessToken}`
        );
        const itemData = await itemRes.json();

        const sellerSku =
          itemData.seller_sku ||
          (itemData.attributes || []).find(a =>
            a.id === "SELLER_SKU" || a.id === "SKU"
          )?.value_name;

        if (!sellerSku) {
          issues.push({ order: order.id, reason: "NO_SKU" });
          continue;
        }

        // buscar producto por SKU
        const prodRes = await fetch(
          `${SUPABASE_URL}/rest/v1/productos?sku=eq.${sellerSku}&select=id,nombre`,
          {
            headers: {
              apikey: SERVICE_KEY,
              Authorization: `Bearer ${SERVICE_KEY}`,
            },
          }
        );
        const prodData = await prodRes.json();

        if (!prodData.length) {
          issues.push({ order: order.id, reason: "SKU_NOT_FOUND", sku: sellerSku });
          continue;
        }

        const producto = prodData[0];

        inserts.push({
          canal: "mercadolibre",
          ml_order_id: String(order.id),
          ml_item_id: String(itemId),
          seller_sku: sellerSku,
          producto_id: producto.id,
          producto_nombre: producto.nombre,
          cantidad: item.quantity,
          precio_unitario: item.unit_price,
          total: item.quantity * item.unit_price,
          fecha: order.date_created,
        });
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
      inserted: inserts.length,
      issues,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
