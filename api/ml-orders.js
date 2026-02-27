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

export default async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  let accessToken = cookies.ml_access_token;
  let refresh = cookies.ml_refresh_token;
  const userId = cookies.ml_user_id;

  // Si no hay token en cookies, intentar con query param (compatibilidad)
  if (!accessToken) accessToken = req.query.token;

  if (!accessToken && !refresh) {
    return res.status(401).json({ error: true, message: 'No hay token. Autorizá con ML.' });
  }

  const clientId = process.env.ML_CLIENT_ID.trim();
  const clientSecret = process.env.ML_CLIENT_SECRET.trim();
  const cookieOpts = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=15552000';

  // Función para buscar órdenes
  async function fetchOrders(token, uid) {
    const url = uid
      ? `https://api.mercadolibre.com/orders/search?seller=${uid}&access_token=${token}&sort=date_desc`
      : `https://api.mercadolibre.com/orders/search?access_token=${token}&sort=date_desc`;
    const r = await fetch(url);
    return { status: r.status, data: await r.json() };
  }

  // Primer intento con el token actual
  let { status, data } = await fetchOrders(accessToken, userId);

  // Si expiró (401) y hay refresh token, renovar automáticamente
  if (status === 401 && refresh) {
    const refreshData = await refreshToken(refresh, clientId, clientSecret);

    if (refreshData.access_token) {
      accessToken = refreshData.access_token;
      refresh = refreshData.refresh_token || refresh;

      // Guardar nuevos tokens en cookies
      res.setHeader('Set-Cookie', [
        `ml_access_token=${accessToken}; ${cookieOpts}`,
        `ml_refresh_token=${refresh}; ${cookieOpts}`,
      ]);

      // Reintentar con nuevo token
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

  return res.status(200).json({ orders: data.results || [] });
}
