export type LinkStatus = 'active' | 'flagged' | 'blocked';

export interface User {
  id: number;
  email: string;
  createdAt: string;
}

export interface Link {
  id: number;
  slug: string;
  ownerId: number | null;
  destinationUrl: string;
  status: LinkStatus;
  abuseScore: number;
  createdAt: string;
  expiresAt: string | null;
}

export interface Click {
  id: number;
  linkId: number;
  ipHash: string;
  country: string;
  device: string;
  referrer: string;
  clickedAt: string;
}

export interface AbuseSignal {
  id: number;
  linkId: number | null;
  signalType: string;
  weight: number;
  description: string;
  detectedAt: string;
}

export interface HourlyBucket {
  id: number;
  linkId: number;
  hourTimestamp: string;
  clickCount: number;
  geoBreakdown: Record<string, number>;
  deviceBreakdown: Record<string, number>;
  referrerBreakdown: Record<string, number>;
}

export interface RiskSignalDetail {
  type: string;
  weight: number;
  description: string;
}

export interface AbuseEvaluationResult {
  score: number;
  status: LinkStatus;
  signals: RiskSignalDetail[];
}

export interface WSClickEvent {
  type: 'CLICK_EVENT';
  payload: {
    linkId: number;
    slug: string;
    destinationUrl: string;
    clickedAt: string;
    country: string;
    device: string;
    referrer: string;
    ipHash: string;
    totalClicks: number;
  };
}

export interface WSStatsUpdate {
  type: 'STATS_UPDATE';
  payload: {
    linkId: number;
    totalClicks: number;
    last24hClicks: number;
    geoBreakdown: Record<string, number>;
    deviceBreakdown: Record<string, number>;
    referrerBreakdown: Record<string, number>;
  };
}

export interface CreateLinkDTO {
  destinationUrl: string;
  customSlug: string;
}
export type WSMessage = WSClickEvent | WSStatsUpdate;
