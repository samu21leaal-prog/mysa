function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((c) => {
    const [k, ...v] = c.trim().split("=");
    cookies[k.trim()] = v.join("=");
  });
  return cookies;
}

export default async function handler(req, res) {
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  const redirectUri = process.env.ML_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(500).send("Faltan env vars de ML en Vercel");
  }

  const { code, state } = req.query || {};
  if (!code) return res.status(400).send("Falta code");

  const cookies = parseCookies(req.headers.cookie);
  if (cookies.ml_oauth_state && state && cookies.ml_oauth_state !== state) {
    return res.status(400).send("State inválido");
  }

  const r = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: String(clientId).trim(),
      client_secret: String(clientSecret).trim(),
      code: String(code),
      redirect_uri: String(redirectUri).trim(),
    }),
  });

  const data = await r.json();
  if (!r.ok || !data.access_token) {
    return res.status(500).json({ error: true, message: "No se pudo obtener token", details: data });
  }

  const cookieOpts = "Path=/; HttpOnly; SameSite=Lax; Max-Age=15552000";
  res.setHeader("Set-Cookie", [
    `ml_access_token=${data.access_token}; ${cookieOpts}`,
    `ml_refresh_token=${data.refresh_token || ""}; ${cookieOpts}`,
    `ml_user_id=${data.user_id || ""}; ${cookieOpts}`,
    `ml_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  ]);

  // Volver a tu app
  res.writeHead(302, { Location: "/#ml" });
  res.end();
}