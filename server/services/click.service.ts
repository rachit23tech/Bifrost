import { db } from '../db/index.js';
import { wsService } from './websocket.service.js';

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
    // Simulated GeoIP lookup based on IP hash / prefix
    const countries = ['United States', 'Germany', 'India', 'United Kingdom', 'Canada', 'Japan', 'France', 'Brazil'];
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      hash = (hash << 5) - hash + ip.charCodeAt(i);
      hash |= 0;
    }
    return countries[Math.abs(hash) % countries.length];
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
   * Log a click synchronously and update rolling pre-aggregated hourly buckets
   */
  public logClick(data: ClickData) {
    const device = this.parseDevice(data.userAgent);
    const country = this.parseCountry(data.ip);
    const referrer = this.parseReferrer(data.referrer);
    const clickedAt = new Date().toISOString();

    // 1. Synchronous Insert into raw clicks table
    const insertResult = db.prepare(`
      INSERT INTO clicks (link_id, ip_hash, country, device, referrer, clicked_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.linkId, data.ip, country, device, referrer, clickedAt);

    // 2. Pre-Aggregation into rolling hourly buckets
    const now = new Date();
    const hourTimestamp = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}:00:00`;

    // Fetch existing hourly bucket or create empty
    const existingBucket = db.prepare(`
      SELECT * FROM hourly_buckets WHERE link_id = ? AND hour_timestamp = ?
    `).get(data.linkId, hourTimestamp) as any;

    let geoBreakdown: Record<string, number> = {};
    let deviceBreakdown: Record<string, number> = {};
    let referrerBreakdown: Record<string, number> = {};
    let clickCount = 0;

    if (existingBucket) {
      clickCount = existingBucket.click_count;
      geoBreakdown = JSON.parse(existingBucket.geo_breakdown || '{}');
      deviceBreakdown = JSON.parse(existingBucket.device_breakdown || '{}');
      referrerBreakdown = JSON.parse(existingBucket.referrer_breakdown || '{}');
    }

    clickCount += 1;
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
      clickCount,
      JSON.stringify(geoBreakdown),
      JSON.stringify(deviceBreakdown),
      JSON.stringify(referrerBreakdown)
    );

    // Total click count for this link
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM clicks WHERE link_id = ?').get(data.linkId) as { count: number };

    // 3. Dispatch WebSocket Real-time Push
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
        ipHash: data.ip,
        totalClicks: totalRow.count
      }
    });

    const stats = this.getLinkAnalytics(data.linkId);
    wsService.broadcastToLink(data.linkId, {
      type: 'STATS_UPDATE',
      payload: {
        linkId: data.linkId,
        ...stats
      }
    });

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
