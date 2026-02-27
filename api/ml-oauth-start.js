export default async function handler(req, res) {
  const clientId = process.env.ML_CLIENT_ID;
  const redirectUri = process.env.ML_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(500).send("Faltan ML_CLIENT_ID o ML_REDIRECT_URI en Vercel");
  }

  const state = Math.random().toString(36).slice(2);
  res.setHeader("Set-Cookie", `ml_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);

  const url =
    "https://auth.mercadolibre.com.ar/authorization" +
    `?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  res.writeHead(302, { Location: url });
  res.end();
}