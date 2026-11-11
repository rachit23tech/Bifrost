import { randomInt } from 'crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SLUG_LENGTH = 7; // 62^7 is about 3.5 trillion possible slugs

// Paths the app itself serves. A custom slug with one of these names would
// shadow a real route (or be shadowed by it).
const RESERVED_SLUGS = new Set([
  'api', 'ws', 'assets', 'static', 'admin', 'login', 'signup', 'health', 'favicon'
]);

const CUSTOM_SLUG_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;

/**
 * Returns an error message if the custom slug is not allowed, otherwise null.
 */
export function validateCustomSlug(slug: string): string | null {
  if (!CUSTOM_SLUG_PATTERN.test(slug)) {
    return 'Custom slug must be 3-32 characters: letters, numbers, "-" or "_"';
  }
  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    return `Slug '${slug}' is reserved`;
  }
  return null;
}

/**
 * Random slugs from a cryptographically secure source.
 *
 * The earlier version encoded an incrementing counter, which made every link
 * guessable: knowing one slug gave you its neighbours. Random slugs cannot be
 * enumerated. The cost is that two links can draw the same slug, so the caller
 * must handle a uniqueness conflict and retry (see link.routes.ts).
 */
export class RandomSlugGenerator {
  public generateSlug(): string {
    let slug = '';
    for (let i = 0; i < SLUG_LENGTH; i++) {
      slug += ALPHABET[randomInt(ALPHABET.length)];
    }
    return slug;
  }
}

export const slugService = new RandomSlugGenerator();
