import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Reads a secret from the environment. In production a missing secret is a
 * startup error: a server signing tokens with a default that is published in
 * the repository would accept forged tokens from anyone who read the source.
 */
function secret(name: string, devDefault: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    throw new Error(`${name} must be set when NODE_ENV=production`);
  }
  return devDefault;
}

export const JWT_SECRET = secret('JWT_SECRET', 'bifrost_dev_secret_key');

// Key for hashing visitor IPs. Falls back to the JWT secret so an existing
// deployment keeps working without a new environment variable.
export const IP_HASH_SALT = process.env.IP_HASH_SALT || JWT_SECRET;

export const MAX_URL_LENGTH = 2048;
