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
  const cookies = parseCookies(req.headers.cookie);
  const ok = !!cookies.ml_access_token;
  res.status(200).json({
    ok,
    user_id: cookies.ml_user_id || null,
  });
}