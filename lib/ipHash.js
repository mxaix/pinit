import crypto from 'crypto';

export function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    'unknown'
  );
}

export function hashReporterIp(ip) {
  const salt = process.env.IP_HASH_SALT || 'pinit2024';
  return crypto
    .createHash('sha256')
    .update(String(ip) + salt)
    .digest('hex')
    .slice(0, 32);
}

export function getReporterHash(req) {
  return hashReporterIp(getClientIp(req));
}
