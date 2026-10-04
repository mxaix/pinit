import crypto from 'node:crypto';
import { supabaseRequest } from './supabaseAdmin.js';
import { noStore, sameOrigin } from './security.js';
const TTL = 3600;
function digest(token) {
 const secret=process.env.ADMIN_SESSION_SECRET;
 if (!secret || secret.length<32 || secret===process.env.LIMITER_SECRET) throw new Error('Independent ADMIN_SESSION_SECRET required');
 return crypto.createHmac('sha256',secret).update(token).digest('hex');
}
export async function createSessionToken() {
 const token=crypto.randomBytes(32).toString('hex');
 await supabaseRequest('admin_sessions',{method:'POST',body:JSON.stringify({token_hash:digest(token),expires_at:new Date(Date.now()+TTL*1000).toISOString()})});
 return token;
}
export async function verifySessionToken(token) {
 if (!/^[a-f0-9]{64}$/.test(token || '')) return false;
 try {
  const rows=await supabaseRequest(`admin_sessions?token_hash=eq.${digest(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token_hash&limit=1`);
  return Array.isArray(rows) && rows.length===1;
 } catch { return false; }
}
export function getTokenFromRequest(req) {
 const match=(req.headers.cookie || '').match(/(?:^|;\s*)__Host-pinit_admin_session=([a-f0-9]{64})(?:;|$)/);
 return match ? match[1] : null;
}
export async function revokeSession(req) {
 const token=getTokenFromRequest(req);
 if(token) await supabaseRequest(`admin_sessions?token_hash=eq.${digest(token)}`,{method:'DELETE'});
}
export async function requireAdmin(req,res) {
 noStore(res);
 if(req.method!=='GET' && !sameOrigin(req,res)) return false;
 if(!await verifySessionToken(getTokenFromRequest(req))) { res.status(401).json({error:'Unauthorized'}); return false; }
 return true;
}
export function setSessionCookie(res,token) {
 res.setHeader('Set-Cookie',`__Host-pinit_admin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${TTL}`);
}
export function clearSessionCookie(res) {
 res.setHeader('Set-Cookie','__Host-pinit_admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
}
