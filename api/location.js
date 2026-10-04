import { country, noStore } from '../lib/security.js';
export default function handler(req, res) {
 noStore(res);
 if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
 const geo = country(req);
 return res.status(200).json({country:geo.country,countryCode:geo.country_code});
}
