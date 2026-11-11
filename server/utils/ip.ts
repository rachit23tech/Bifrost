import { createHmac } from 'crypto';
import { IP_HASH_SALT } from '../config.js';

/**
 * One-way keyed hash of a visitor IP.
 *
 * Analytics only needs to tell "same visitor" from "different visitor", so the
 * raw address is never stored. A plain SHA-256 would not be enough: there are
 * only ~4 billion IPv4 addresses, so every hash could be reversed by brute
 * force. Keying the hash with a server-side secret (HMAC) prevents that.
 */
export function hashIp(ip: string): string {
  return createHmac('sha256', IP_HASH_SALT).update(ip).digest('hex').slice(0, 16);
}
