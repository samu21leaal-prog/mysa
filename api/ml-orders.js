// api/ml-orders.js
// Proxy serverless: el frontend llama acá y este llama a ML con el token

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token no provisto. Incluí Authorization: Bearer <access_token>" });
  }

  const accessToken = authHeader.replace("Bearer ", "").trim();
  const { user_id, offset = 0, limit = 50, status } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: "Falta user_id" });
  }

  try {
    // Construir URL de búsqueda de órdenes
    const params = new URLSearchParams({
      seller: user_id,
      offset,
      limit,
      ...(status ? { order_status: status } : {}),
    });

    const mlRes = await fetch(
      `https://api.mercadolibre.com/orders/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await mlRes.json();

    if (!mlRes.ok) {
      return res.status(mlRes.status).json({ error: "Error de ML API", detail: data });
    }

    // Transformar órdenes al formato del ERP
    const orders = (data.results || []).map(order => ({
      ml_order_id: String(order.id),
      date: order.date_created?.split("T")[0] || new Date().toISOString().split("T")[0],
      status: order.status,
      buyer: order.buyer?.nickname || "Comprador ML",
      total: order.total_amount || 0,
      items: (order.order_items || []).map(item => ({
        title: item.item?.title || "Producto",
        quantity: item.quantity,
        unit_price: item.unit_price,
        sku: item.item?.seller_sku || "",
      })),
      shipping_id: order.shipping?.id || null,
      payment_status: order.payments?.[0]?.status || "unknown",
    }));

    return res.status(200).json({
      total: data.paging?.total || 0,
      offset: data.paging?.offset || 0,
      limit: data.paging?.limit || 50,
      orders,
    });

  } catch (err) {
    return res.status(500).json({ error: "Error interno del proxy", detail: err.message });
  }
}
