import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function refreshToken(refreshToken, clientId, clientSecret) {
  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      refresh_token: refreshToken,
    }),
  });
  return response.json();
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    cookies[k.trim()] = v.join('=');
  });
  return cookies;
}

async function fetchItemSku(itemId, token) {
  try {
    const r = await fetch(`https://api.mercadolibre.com/items/${itemId}?access_token=${token}`);
    const data = await r.json();
    if (data.seller_sku) return data.seller_sku;
    const skuAttr = (data.attributes || []).find(a =>
      a.id === 'SELLER_SKU' || a.id === 'SKU' || a.name?.toLowerCase().includes('sku')
    );
    return skuAttr?.value_name || null;
  } catch {
    return null;
  }
}

async function findProductBySku(sku) {
  if (!sku) return null;

  const { data, error } = await supabaseAdmin
    .from('productos')
    .select('id, nombre, costo')
    .eq('sku', String(sku).trim())
    .maybeSingle();

  if (error) return null;
  return data; // {id, nombre, costo}
}
export default async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  let accessToken = cookies.ml_access_token;
  let refresh = cookies.ml_refresh_token;
  const userId = cookies.ml_user_id;

  if (!accessToken) accessToken = req.query.token;
  if (!accessToken && !refresh) {
    return res.status(401).json({ error: true, message: 'No hay token. Autorizá con ML.' });
  }

  const clientId = process.env.ML_CLIENT_ID.trim();
  const clientSecret = process.env.ML_CLIENT_SECRET.trim();
  const cookieOpts = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=15552000';

  async function fetchOrders(token, uid) {
    const url = uid
      ? `https://api.mercadolibre.com/orders/search?seller=${uid}&access_token=${token}&sort=date_desc`
      : `https://api.mercadolibre.com/orders/search?access_token=${token}&sort=date_desc`;
    const r = await fetch(url);
    return { status: r.status, data: await r.json() };
  }

  let { status, data } = await fetchOrders(accessToken, userId);

  if (status === 401 && refresh) {
    const refreshData = await refreshToken(refresh, clientId, clientSecret);
    if (refreshData.access_token) {
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
      return res.status(401).json({ error: true, message: 'Sesión vencida. Volvé a autorizar con ML.' });
    }
  }

  if (status !== 200) {
    return res.status(status).json({ error: true, message: data.message || 'Error de ML' });
  }

  // Enriquecer cada ítem con su SKU
  const orders = data.results || [];
  await Promise.all(
    orders.map(async (order) => {
      await Promise.all(
        (order.order_items || []).map(async (item) => {
          if (item.item?.id) {
            item.item.sku = await fetchItemSku(item.item.id, accessToken);
          }
        })
      );
    })
  );
const doSync = String(req.query.sync || '') === '1';

  if (doSync) {
    const inserts = [];
    const issues = [];

    for (const order of orders) {
      const mlOrderId = String(order.id);
      const fecha = order.date_created || order.date_closed || new Date().toISOString();

      for (const oi of (order.order_items || [])) {
        const itemId = oi?.item?.id ? String(oi.item.id) : null;
        const sellerSku = oi?.item?.sku || null; // lo agregaste vos con fetchItemSku

        if (!itemId || !sellerSku) {
          issues.push({ ml_order_id: mlOrderId, reason: 'MISSING_ITEM_OR_SKU' });
          continue;
        }

        const prod = await findProductBySku(sellerSku);
        if (!prod?.id) {
          issues.push({ ml_order_id: mlOrderId, reason: 'SKU_NOT_FOUND', sellerSku });
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
          producto_nombre: prod.nombre || oi?.item?.title || 'Sin nombre',
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
        return res.status(500).json({ error: true, message: 'Error insertando ventas', details: error.message });
      }
    }

    // Te devuelve issues para que veas SKUs no encontrados
    return res.status(200).json({ ok: true, inserted: inserts.length, issues });
  }
  return res.status(200).json({ orders });
}
