import { db } from '../db/index.js';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = ALPHABET.length; // 62

export interface ISlugGenerator {
  generateSlug(): string;
}

export function
  isValidCustomSlug(slug: string):
  boolean {
  const slugRegex = /^[a-zA-Z0-9_]*$/;
  return slugRegex.test(slug);
}

export class Base62SlugGenerator implements ISlugGenerator {
  public encode(num: number): string {
    if (num === 0) return ALPHABET[0];
    let result = '';
    let n = num;
    while (n > 0) {
      const remainder = n % BASE;
      result = ALPHABET[remainder] + result;
      n = Math.floor(n / BASE);
    }
    return result;
  }

  public decode(str: string): number {
    let num = 0;
    for (let i = 0; i < str.length; i++) {
      const index = ALPHABET.indexOf(str[i]);
      if (index === -1) throw new Error(`Invalid Base62 character: ${str[i]}`);
      num = num * BASE + index;
    }
    return num;
  }

  public generateSlug(): string {
    const transaction = db.transaction(() => {
      const row = db.prepare('SELECT last_val FROM global_counter WHERE id = 1').get() as { last_val: number };
      const nextVal = row.last_val + 1;
      db.prepare('UPDATE global_counter SET last_val = ? WHERE id = 1').run(nextVal);
      return this.encode(nextVal);
    });

    return transaction();
  }
}

/**
 * Random String Slug Generator with collision retry (alternative strategy)
 */
export class RandomSlugGenerator implements ISlugGenerator {
  private length: number;

  constructor(length = 6) {
    this.length = length;
  }

  public generateSlug(): string {
    let result = '';
    for (let i = 0; i < this.length; i++) {
      const randomIndex = Math.floor(Math.random() * BASE);
      result += ALPHABET[randomIndex];
    }
    return result;
  }
}

// Export default instance using Base62 counter
export const slugService = new Base62SlugGenerator();
