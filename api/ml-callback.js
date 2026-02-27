export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}?ml_error=${error}`);
  }
  if (!code) {
    return res.status(400).json({ error: 'No code received' });
  }

  try {
    // 1. Intercambiar code por tokens
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
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

    const data = await tokenRes.json();

    if (data.error) {
      return res.redirect(`${process.env.FRONTEND_URL}?ml_error=${data.error}&detail=${encodeURIComponent(data.message||'')}`);
    }

    // 2. Guardar access_token y refresh_token en Supabase settings (row id=1)
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (SUPABASE_URL && SERVICE_KEY) {
      await fetch(`${SUPABASE_URL}/rest/v1/settings?id=eq.1`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          ml_access_token:  data.access_token,
          ml_refresh_token: data.refresh_token,
        }),
      });
    }

    return res.redirect(`${process.env.FRONTEND_URL}?ml_connected=1`);
  } catch (e) {
    return res.redirect(`${process.env.FRONTEND_URL}?ml_error=server_error&detail=${encodeURIComponent(e.message)}`);
  }
}
