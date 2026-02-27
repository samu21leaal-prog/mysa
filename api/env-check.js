export default function handler(req, res) {
  res.status(200).json({
    has_ML_CLIENT_ID: !!process.env.ML_CLIENT_ID,
    has_ML_CLIENT_SECRET: !!process.env.ML_CLIENT_SECRET,
    has_ML_REDIRECT_URI: !!process.env.ML_REDIRECT_URI,
    vercel_env: process.env.VERCEL_ENV || null,
  });
}
