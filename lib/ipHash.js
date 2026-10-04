import { privateKey } from './security.js';
export function getReporterHash(req) { return privateKey(req, 'report'); }
