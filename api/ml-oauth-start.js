export default async function handler(req, res) {
  try {
    const clientId = process.env.ML_CLIENT_ID;
    const redirectUri = process.env.ML_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return res.status(500).json({
        error: true,
        message: "Faltan ML_CLIENT_ID o ML_REDIRECT_URI",
      });
    }

    const state = Math.random().toString(36).slice(2);
    res.setHeader(
      "Set-Cookie",
      `ml_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
    );

    const url =
      "https://auth.mercadolibre.com.ar/authorization" +
      `?response_type=code&client_id=${encodeURIComponent(String(clientId).trim())}` +
      `&redirect_uri=${encodeURIComponent(String(redirectUri).trim())}` +
      `&state=${encodeURIComponent(state)}`;

    // Debug: ver url sin redirigir
    if (String(req.query.debug || "") === "1") {
      return res.status(200).json({ ok: true, redirect_to: url });
    }

    res.statusCode = 302;
    res.setHeader("Location", url);
    res.end();
  } catch (e) {
    return res.status(500).json({ error: true, message: String(e?.message || e) });
  }
}
