export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}?ml_error=${error}`);
  }

  if (!code) {
    return res.status(400).json({ error: 'No code received' });
  }

  try {
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.ML_CLIENT_ID.trim(),
        client_secret: process.env.ML_CLIENT_SECRET.trim(),
        code,
        redirect_uri: process.env.ML_REDIRECT_URI.trim(),
      }),
    });

    const data = await response.json();

    if (data.error) {
      return res.redirect(`${process.env.FRONTEND_URL}?ml_error=${data.error}&detail=${data.message}`);
    }

    // Guardar access_token Y refresh_token en cookies seguras (duran 6 meses)
    const cookieOpts = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=15552000';
    res.setHeader('Set-Cookie', [
      `ml_access_token=${data.access_token}; ${cookieOpts}`,
      `ml_refresh_token=${data.refresh_token}; ${cookieOpts}`,
      `ml_user_id=${data.user_id}; Path=/; SameSite=Lax; Max-Age=15552000`,
    ]);

    return res.redirect(`${process.env.FRONTEND_URL}?ml_connected=1`);
  } catch (e) {
    return res.redirect(`${process.env.FRONTEND_URL}?ml_error=server_error`);
  }
}
