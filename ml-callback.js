export default async function handler(req, res) {
  const FRONTEND_URL   = process.env.FRONTEND_URL?.trim();
  const CLIENT_ID      = process.env.ML_CLIENT_ID?.trim();
  const CLIENT_SECRET  = process.env.ML_CLIENT_SECRET?.trim();
  const REDIRECT_URI   = process.env.ML_REDIRECT_URI?.trim();
  const SUPABASE_URL   = process.env.SUPABASE_URL?.trim();
  const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY?.trim();

  const { code, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND_URL}?ml_error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return res.redirect(`${FRONTEND_URL}?ml_error=no_code`);
  }

  try {
    // 1. Intercambiar code por tokens
    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "authorization_code",
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri:  REDIRECT_URI,
      }),
    });

    const tokenText = await tokenRes.text();
    let tokenData;
    try { tokenData = JSON.parse(tokenText); }
    catch { return res.redirect(`${FRONTEND_URL}?ml_error=token_parse_error`); }

    if (tokenData.error) {
      return res.redirect(
        `${FRONTEND_URL}?ml_error=${encodeURIComponent(tokenData.error)}&detail=${encodeURIComponent(tokenData.message || "")}`
      );
    }

    // 2. Obtener datos del usuario
    const meRes  = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const meData = await meRes.json();

    // 3. Calcular expiración (ML da expires_in en segundos)
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString();

    // 4. Guardar en Supabase settings (row id=1)
    await fetch(`${SUPABASE_URL}/rest/v1/settings?id=eq.1`, {
      method: "PATCH",
      headers: {
        "Content-Type":  "application/json",
        "apikey":        SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer":        "return=minimal",
      },
      body: JSON.stringify({
        ml_access_token:    tokenData.access_token,
        ml_refresh_token:   tokenData.refresh_token,
        ml_user_id:         String(tokenData.user_id || meData.id || ""),
        ml_nickname:        meData.nickname || "",
        ml_token_expires_at: expiresAt,
      }),
    });

    return res.redirect(`${FRONTEND_URL}?ml_connected=1`);

  } catch (e) {
    return res.redirect(
      `${FRONTEND_URL}?ml_error=server_error&detail=${encodeURIComponent(e.message)}`
    );
  }
}
