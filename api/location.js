export default async function handler(req, res) {
  // Get the real IP from Vercel headers
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
             req.headers['x-real-ip'] || 
             'unknown';

  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`);
    const d = await r.json();
    if (d.country_name && d.country_name !== 'Reserved') {
      return res.status(200).json({
        ip,
        country: d.country_name,
        countryCode: d.country_code || ''
      });
    }
    throw new Error('No country');
  } catch(e) {}

  // Fallback
  try {
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=country,countryCode`);
    const d = await r.json();
    if (d.country) {
      return res.status(200).json({
        ip,
        country: d.country,
        countryCode: d.countryCode || ''
      });
    }
  } catch(e) {}

  return res.status(200).json({ ip, country: 'Unknown', countryCode: '' });
}
