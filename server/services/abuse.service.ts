import { db } from '../db/index.js';
import { AbuseEvaluationResult, LinkStatus, RiskSignalDetail } from '../../shared/types.js';

const DOMAIN_BLOCKLIST = new Set([
  'malware-example.com',
  'phishing-test.org',
  'free-crypto-giveaway.xyz',
  'account-verify-login.net',
  'steal-passwords.ru',
  'claim-airdrop-now.info'
]);

const KNOWN_SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  'goo.gl',
  't.co',
  'is.gd',
  'buff.ly',
  'ow.ly'
]);

export class AbuseDetectionEngine {
  /**
   * Evaluate a URL at creation time against weighted risk rules.
   */
  public evaluateCreation(destinationUrl: string, userId?: number, ip?: string): AbuseEvaluationResult {
    const signals: RiskSignalDetail[] = [];
    let totalScore = 0;

    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(destinationUrl);
    } catch {
      signals.push({
        type: 'invalid_url_structure',
        weight: 90,
        description: 'URL cannot be parsed safely'
      });
      return { score: 90, status: 'blocked', signals };
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // Signal 1: Blocklisted Domain Check (+80)
    if (DOMAIN_BLOCKLIST.has(hostname) || Array.from(DOMAIN_BLOCKLIST).some(b => hostname.endsWith('.' + b))) {
      signals.push({
        type: 'blocklisted_domain',
        weight: 80,
        description: `Destination domain '${hostname}' matches known malware/phishing blocklist`
      });
      totalScore += 80;
    }

    // Signal 2: Shortener Chaining (+40)
    if (KNOWN_SHORTENERS.has(hostname)) {
      signals.push({
        type: 'shortener_chaining',
        weight: 40,
        description: `URL points to another shortener '${hostname}' (Shortener Chaining)`
      });
      totalScore += 40;
    }

    // Signal 3: IP-Literal Hostname (+45)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipRegex.test(hostname)) {
      signals.push({
        type: 'ip_literal_url',
        weight: 45,
        description: `Destination URL uses raw IP address '${hostname}' instead of domain name`
      });
      totalScore += 45;
    }

    // Signal 4: Punycode / Homograph Attack (+35)
    if (hostname.startsWith('xn--')) {
      signals.push({
        type: 'punycode_homograph',
        weight: 35,
        description: 'Domain uses Punycode encoding, potential internationalized homograph trick'
      });
      totalScore += 35;
    }

    // Signal 5: Credential/UserInfo @ trick (+50)
    if (parsedUrl.username || parsedUrl.password || destinationUrl.includes('@')) {
      signals.push({
        type: 'userinfo_obscuration',
        weight: 50,
        description: 'URL contains username/password or @ symbol designed to deceive users'
      });
      totalScore += 50;
    }

    // Signal 6: Suspicious Executable Extension (+40)
    const suspiciousExts = ['.exe', '.scr', '.vbs', '.bat', '.cmd', '.ps1', '.apk', '.dmg', '.sh'];
    if (suspiciousExts.some(ext => parsedUrl!.pathname.toLowerCase().endsWith(ext))) {
      signals.push({
        type: 'executable_file_download',
        weight: 40,
        description: 'Destination URL points directly to an executable file download'
      });
      totalScore += 40;
    }

    // Signal 7: User Link Creation Velocity Check (+35)
    if (userId) {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const recentLinks = db.prepare(`
        SELECT COUNT(*) as count FROM links
        WHERE owner_id = ? AND created_at > ?
      `).get(userId, oneMinuteAgo) as { count: number };

      if (recentLinks.count >= 5) {
        signals.push({
          type: 'high_creation_velocity',
          weight: 35,
          description: `User created ${recentLinks.count} links in the last 60 seconds`
        });
        totalScore += 35;
      }
    }

    // Cap score at 100
    const finalScore = Math.min(100, totalScore);

    // Determine status threshold
    let status: LinkStatus = 'active';
    if (finalScore >= 70) {
      status = 'blocked';
    } else if (finalScore >= 30) {
      status = 'flagged';
    }

    return {
      score: finalScore,
      status,
      signals
    };
  }

  /**
   * Log detected signals into abuse_signals table
   */
  public saveSignals(linkId: number | null, signals: RiskSignalDetail[]) {
    const insertStmt = db.prepare(`
      INSERT INTO abuse_signals (link_id, signal_type, weight, description)
      VALUES (?, ?, ?, ?)
    `);

    for (const signal of signals) {
      insertStmt.run(linkId, signal.type, signal.weight, signal.description);
    }
  }

  /**
   * Click-time Bot & Velocity evaluation
   */
  public evaluateClick(linkId: number, userAgent: string, ip: string): { isBot: boolean; reason?: string } {
    const botKeywords = ['bot', 'crawler', 'spider', 'curl', 'python-requests', 'postman', 'headless', 'wget'];
    const uaLower = userAgent.toLowerCase();

    if (botKeywords.some(kw => uaLower.includes(kw))) {
      return { isBot: true, reason: `User-Agent contains bot indicator '${userAgent}'` };
    }

    // Velocity check: > 30 clicks in 5 seconds from same IP
    const fiveSecAgo = new Date(Date.now() - 5 * 1000).toISOString();
    const countRow = db.prepare(`
      SELECT COUNT(*) as count FROM clicks
      WHERE link_id = ? AND ip_hash = ? AND clicked_at > ?
    `).get(linkId, ip, fiveSecAgo) as { count: number };

    if (countRow.count >= 30) {
      return { isBot: true, reason: `IP click rate spike (${countRow.count} clicks in 5s)` };
    }

    return { isBot: false };
  }
}

export const abuseEngine = new AbuseDetectionEngine();
