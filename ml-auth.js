export default function handler(req, res) {
  const CLIENT_ID    = process.env.ML_CLIENT_ID?.trim();
  const REDIRECT_URI = process.env.ML_REDIRECT_URI?.trim();

  if (!CLIENT_ID || !REDIRECT_URI) {
    return res.status(500).json({
      error: "Faltan variables ML_CLIENT_ID o ML_REDIRECT_URI en Vercel"
    });
  }

  const url =
    `https://auth.mercadolibre.com.ar/authorization` +
    `?response_type=code` +
    `&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  return res.redirect(url);
}
