// pages/api/ml-orders.js  (CommonJS para evitar crashes por ESM)

const { createClient } = require('@supabase/supabase-js');

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((c) => {
    const [k, ...v] = c.trim().split('=');
    cookies[k.trim()] = v.join('=');
  });
  return cookies;
}

async function refreshToken(refreshTokenValue, clientId, clientSecret) {
  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: String(clientId).trim(),
      client_secret: String(clientSecret).trim(),
      refresh_token: refreshTokenValue,
    }),
  });
  return response.json();
}

async function fetchOrders(token, uid) {
  const url = uid
    ? `https://api.mercadolibre.com/orders/search?seller=${uid}&access_token=${token}&sort=date_desc`
    : `https://api.mercadolibre.com/orders/search?access_token=${token}&sort=date_desc`;

  const r = await fetch(url);
  return { status: r.status, data: await r.json() };
}

async function fetchItemSku(itemId, token) {
  try {
    const r = await fetch(`https://api.mercadolibre.com/items/${itemId}?access_token=${token}`);
    const data = await r.json();

    if (data && data.seller_sku) return data.seller_sku;

    const skuAttr = (data.attributes || []).find(
      (a) => a.id === 'SELLER_SKU' || a.id === 'SKU' || (a.name || '').toLowerCase().includes('sku')
    );
    return (skuAttr && skuAttr.value_name) || null;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  try {
    // ✅ Ping rápido para debug: /api/ml-orders?ping=1
    if (String(req.query.ping || '') === '1') {
      return res.status(200).json({ ok: true, ping: true });
    }

    const cookies = parseCookies(req.headers.cookie);
    let accessToken = cookies.ml_access_token;
    let refresh = cookies.ml_refresh_token;
    const userId = cookies.ml_user_id;

    if (!accessToken) accessToken = req.query.token;

    if (!accessToken && !refresh) {
      return res.status(401).json({ error: true, message: 'No hay token. Autorizá con ML.' });
    }

    const clientIdRaw = process.env.ML_CLIENT_ID;
    const clientSecretRaw = process.env.ML_CLIENT_SECRET;

    if (!clientIdRaw || !clientSecretRaw) {
      return res.status(500).json({
        error: true,
        message: 'Faltan ML_CLIENT_ID o ML_CLIENT_SECRET en Vercel',
      });
    }

    const clientId = String(clientIdRaw).trim();
    const clientSecret = String(clientSecretRaw).trim();

    const doSync = String(req.query.sync || '') === '1';
    const doEnrich = String(req.query.enrich || '') === '1'; // para controlar el costo de llamadas /items

    let supabaseAdmin = null;
    if (doSync) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({
          error: true,
          message: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel',
        });
      }

      supabaseAdmin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }

    const cookieOpts = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=15552000';

    let { status, data } = await fetchOrders(accessToken, userId);

    if (status === 401 && refresh) {
      const refreshData = await refreshToken(refresh, clientId, clientSecret);

      if (refreshData && refreshData.access_token) {
        accessToken = refreshData.access_token;
        refresh = refreshData.refresh_token || refresh;

        res.setHeader('Set-Cookie', [
          `ml_access_token=${accessToken}; ${cookieOpts}`,
          `ml_refresh_token=${refresh}; ${cookieOpts}`,
        ]);

        const retry = await fetchOrders(accessToken, userId);
        status = retry.status;
        data = retry.data;
      } else {
        return res.status(401).json({
          error: true,
          message: 'Sesión vencida. Volvé a autorizar con ML.',
        });
      }
    }

    if (status !== 200) {
      return res.status(status).json({ error: true, message: (data && data.message) || 'Error de ML', details: data });
    }

    const orders = (data && data.results) || [];

    // Enriquecer SKU SOLO si pedís enrich=1 (evita timeouts/crashes por demasiadas llamadas)
    if (doEnrich || doSync) {
      // limitamos cantidad de órdenes para evitar timeout
      const maxOrders = Number(req.query.limit || 20);
      const slice = orders.slice(0, Math.max(1, Math.min(maxOrders, 50)));

      for (const order of slice) {
        for (const item of order.order_items || []) {
          if (item.item && item.item.id) {
            item.item.sku = await fetchItemSku(item.item.id, accessToken);
          }
        }
      }

      // si recortamos, devolvemos slice (el resto no importa para sync)
      if (slice.length !== orders.length) {
        // no hacemos nada, solo usamos slice para sync y para response si querés
      }
    }

    if (!doSync) {
      return res.status(200).json({ orders });
    }

    async function findProductBySku(sku) {
      if (!sku) return null;
      const { data: prod, error } = await supabaseAdmin
        .from('productos')
        .select('id, nombre, costo')
        .eq('sku', String(sku).trim())
        .maybeSingle();
      if (error) return null;
      return prod;
    }

    const inserts = [];
    const issues = [];

    // sync con límite para evitar timeout
    const maxOrders = Number(req.query.limit || 20);
    const ordersToSync = orders.slice(0, Math.max(1, Math.min(maxOrders, 50)));

    for (const order of ordersToSync) {
      const mlOrderId = String(order.id);
      const fecha = order.date_created || order.date_closed || new Date().toISOString();

      for (const oi of order.order_items || []) {
        const itemId = oi && oi.item && oi.item.id ? String(oi.item.id) : null;
        const sellerSku = oi && oi.item ? oi.item.sku : null;

        if (!itemId || !sellerSku) {
          issues.push({ ml_order_id: mlOrderId, reason: 'MISSING_ITEM_OR_SKU', itemId, sellerSku });
          continue;
        }

        const prod = await findProductBySku(sellerSku);
        if (!prod || !prod.id) {
          issues.push({ ml_order_id: mlOrderId, reason: 'SKU_NOT_FOUND', seller_sku: sellerSku });
          continue;
        }

        const cantidad = Number(oi.quantity || 0);
        const precioUnit = Number(oi.unit_price || 0);
        const total = cantidad * precioUnit;

        inserts.push({
          canal: 'mercadolibre',
          ml_order_id: mlOrderId,
          ml_item_id: itemId,
          seller_sku: sellerSku,
          producto_id: prod.id,
          producto_nombre: prod.nombre || (oi.item && oi.item.title) || 'Sin nombre',
          cantidad,
          precio_unitario: precioUnit,
          total,
          fecha,
        });
      }
    }

    if (inserts.length) {
      const { error } = await supabaseAdmin
        .from('ventas')
        .upsert(inserts, { onConflict: 'ml_order_id,ml_item_id' });

      if (error) {
        return res.status(500).json({
          error: true,
          message: 'Error insertando ventas en Supabase',
          details: error.message,
        });
      }
    }

    return res.status(200).json({ ok: true, inserted: inserts.length, issues });
  } catch (e) {
    console.error('ml-orders crash:', e);
    return res.status(500).json({ error: true, message: String((e && e.message) || e) });
  }
};
