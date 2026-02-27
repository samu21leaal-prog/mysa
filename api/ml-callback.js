// api/ml-callback.js
// Vercel Serverless Function
// ML redirige acá con ?code=XXX después de que el usuario autoriza

export default async function handler(req, res) {
  // Permitir CORS para el frontend
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: "Falta el parámetro code" });
  }

  const CLIENT_ID = process.env.ML_CLIENT_ID;
  const CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
  const REDIRECT_URI = process.env.ML_REDIRECT_URI; // ej: https://tu-app.vercel.app/api/ml-callback

  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return res.status(500).json({ error: "Faltan variables de entorno ML_CLIENT_ID, ML_CLIENT_SECRET o ML_REDIRECT_URI" });
  }

  try {
    // Intercambiar code por access_token
    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      return res.status(400).json({ error: "Error al obtener token", detail: tokenData });
    }

    // Redirigir al frontend con el token en la URL (fragment, no queda en logs del server)
    const frontendUrl = process.env.FRONTEND_URL || "/";
    return res.redirect(302,
      `${frontendUrl}#ml_token=${tokenData.access_token}&ml_user_id=${tokenData.user_id}&ml_expires=${tokenData.expires_in}`
    );

  } catch (err) {
    return res.status(500).json({ error: "Error interno", detail: err.message });
  }
}
