import { clearSessionCookie, revokeSession } from '../../lib/adminAuth.js';
import { sameOrigin } from '../../lib/security.js';
export default async function handler(req,res) {
 if(!sameOrigin(req,res)) return;
 if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
 try { await revokeSession(req); } catch { return res.status(503).json({error:'Logout failed; retry'}); }
 clearSessionCookie(res); return res.status(200).json({ok:true});
}
