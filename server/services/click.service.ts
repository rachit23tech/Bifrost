import { db } from '../db/index.js';
import { wsService } from './websocket.service.js';
import geoip from 'geoip-lite';
import { hashIp } from '../utils/ip.js';

// Converts geoip-lite's ISO 3166-1 alpha-2 country codes (e.g. 'IN', 'US') into
// full display names ('India', 'United States') using Node's built-in Intl API -
// no extra dependency or hardcoded country list needed.
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export interface ClickData {
  linkId: number;
  slug: string;
  destinationUrl: string;
  ip: string;
  userAgent: string;
  referrer: string;
}

export class ClickAnalyticsService {
  private parseDevice(ua: string): string {
    const lower = ua.toLowerCase();
    if (lower.includes('mobile') || lower.includes('android') || lower.includes('iphone')) return 'Mobile';
    if (lower.includes('ipad') || lower.includes('tablet')) return 'Tablet';
    if (lower.includes('bot') || lower.includes('crawler')) return 'Bot';
    return 'Desktop';
  }

  private parseCountry(ip: string): string {
    // Real GeoIP lookup via geoip-lite's offline MaxMind GeoLite2-derived
    // database - a local binary lookup (no network call, so it doesn't add
    // latency to the redirect path). Returns null for private/loopback/
    // unresolvable IPs (localhost during dev, LAN ranges, etc.).
    const geo = geoip.lookup(ip);
    if (!geo || !geo.country) return 'Unknown';
    try {
      return regionNames.of(geo.country) || geo.country;
    } catch {
      return geo.country;
    }
  }

  private parseReferrer(ref: string): string {
    if (!ref || ref === 'direct') return 'Direct';
    try {
      const url = new URL(ref);
      return url.hostname.replace('www.', '');
    } catch {
      return ref;
    }
  }

  /**
   * Record a click and update the link's pre-aggregated hourly bucket
   */
  public logClick(data: ClickData) {
    const device = this.parseDevice(data.userAgent);
    const country = this.parseCountry(data.ip);
    const referrer = this.parseReferrer(data.referrer);
    // The raw IP is used for the country lookup above and then discarded.
    // Only its keyed hash is stored or sent to dashboard clients.
    const ipHash = hashIp(data.ip);
    const clickedAt = new Date().toISOString();

    const now = new Date();
    const hourTimestamp = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}:00:00`;

    // The raw click row and its hourly bucket are written in one transaction,
    // so the two can never disagree (and SQLite does one disk sync, not two).
    const insertResult = db.transaction(() => {
      // 1. Raw click row
      const result = db.prepare(`
        INSERT INTO clicks (link_id, ip_hash, country, device, referrer, clicked_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(data.linkId, ipHash, country, device, referrer, clickedAt);

      // 2. Pre-aggregation into the link's bucket for the current hour
      const existingBucket = db.prepare(`
        SELECT * FROM hourly_buckets WHERE link_id = ? AND hour_timestamp = ?
      `).get(data.linkId, hourTimestamp) as any;

      const geoBreakdown: Record<string, number> = JSON.parse(existingBucket?.geo_breakdown || '{}');
      const deviceBreakdown: Record<string, number> = JSON.parse(existingBucket?.device_breakdown || '{}');
      const referrerBreakdown: Record<string, number> = JSON.parse(existingBucket?.referrer_breakdown || '{}');

      geoBreakdown[country] = (geoBreakdown[country] || 0) + 1;
      deviceBreakdown[device] = (deviceBreakdown[device] || 0) + 1;
      referrerBreakdown[referrer] = (referrerBreakdown[referrer] || 0) + 1;

      db.prepare(`
        INSERT INTO hourly_buckets (link_id, hour_timestamp, click_count, geo_breakdown, device_breakdown, referrer_breakdown)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(link_id, hour_timestamp) DO UPDATE SET
          click_count = excluded.click_count,
          geo_breakdown = excluded.geo_breakdown,
          device_breakdown = excluded.device_breakdown,
          referrer_breakdown = excluded.referrer_breakdown
      `).run(
        data.linkId,
        hourTimestamp,
        (existingBucket?.click_count || 0) + 1,
        JSON.stringify(geoBreakdown),
        JSON.stringify(deviceBreakdown),
        JSON.stringify(referrerBreakdown)
      );

      return result;
    })();

    // 3. Live push. Building the stats payload costs several queries, so skip
    // it entirely unless a dashboard is actually subscribed to this link.
    if (wsService.hasSubscribers(data.linkId)) {
      const stats = this.getLinkAnalytics(data.linkId);

      wsService.broadcastToLink(data.linkId, {
        type: 'CLICK_EVENT',
        payload: {
          linkId: data.linkId,
          slug: data.slug,
          destinationUrl: data.destinationUrl,
          clickedAt,
          country,
          device,
          referrer,
          ipHash,
          totalClicks: stats.totalClicks
        }
      });

      wsService.broadcastToLink(data.linkId, {
        type: 'STATS_UPDATE',
        payload: {
          linkId: data.linkId,
          ...stats
        }
      });
    }

    return insertResult;
  }

  /**
   * Fast Analytics Breakdown retrieval using pre-aggregated hourly buckets
   */
  public getLinkAnalytics(linkId: number) {
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM clicks WHERE link_id = ?').get(linkId) as { count: number };
    
    // Fetch last 24 hourly buckets
    const buckets = db.prepare(`
      SELECT * FROM hourly_buckets
      WHERE link_id = ?
      ORDER BY hour_timestamp DESC
      LIMIT 24
    `).all(linkId) as any[];

    let last24hClicks = 0;
    const geoBreakdown: Record<string, number> = {};
    const deviceBreakdown: Record<string, number> = {};
    const referrerBreakdown: Record<string, number> = {};

    for (const bucket of buckets) {
      last24hClicks += bucket.click_count;

      const geo = JSON.parse(bucket.geo_breakdown || '{}');
      for (const [k, v] of Object.entries(geo)) {
        geoBreakdown[k] = (geoBreakdown[k] || 0) + (v as number);
      }

      const dev = JSON.parse(bucket.device_breakdown || '{}');
      for (const [k, v] of Object.entries(dev)) {
        deviceBreakdown[k] = (deviceBreakdown[k] || 0) + (v as number);
      }

      const ref = JSON.parse(bucket.referrer_breakdown || '{}');
      for (const [k, v] of Object.entries(ref)) {
        referrerBreakdown[k] = (referrerBreakdown[k] || 0) + (v as number);
      }
    }

    return {
      totalClicks: totalRow.count,
      last24hClicks,
      hourlyBuckets: buckets.reverse(),
      geoBreakdown,
      deviceBreakdown,
      referrerBreakdown
    };
  }
}

export const clickService = new ClickAnalyticsService();
