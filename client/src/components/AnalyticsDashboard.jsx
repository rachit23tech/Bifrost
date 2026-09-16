import React, { useState, useEffect, useRef } from 'react';
import { Activity, Globe, Smartphone, MousePointer, RefreshCw, Zap, Play } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function AnalyticsDashboard({ selectedLinkId, setSelectedLinkId }) {
  const [links, setLinks] = useState([]);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [recentClicks, setRecentClicks] = useState([]);
  const [liveStream, setLiveStream] = useState([]);
  const [loading, setLoading] = useState(false);

  const wsRef = useRef(null);

  useEffect(() => {
    fetchMyLinks();
  }, []);

  const fetchMyLinks = async () => {
    try {
      const res = await fetch('/api/links/my-links', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('bifrost_token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setLinks(data.links || []);
        if (data.links.length > 0 && !selectedLinkId) {
          setSelectedLinkId(data.links[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch links:', err);
    }
  };

  useEffect(() => {
    if (!selectedLinkId) return;

    setLoading(true);
    fetch(`/api/analytics/${selectedLinkId}`)
      .then((res) => res.json())
      .then((data) => {
        setAnalyticsData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });

    fetch(`/api/analytics/${selectedLinkId}/recent-clicks`)
      .then((res) => res.json())
      .then((data) => {
        setRecentClicks(data.clicks || []);
      })
      .catch((err) => console.error(err));

  }, [selectedLinkId]);

  useEffect(() => {
    if (!selectedLinkId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'SUBSCRIBE_LINK', linkId: Number(selectedLinkId) }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'CLICK_EVENT') {
          setLiveStream((prev) => [{ ...msg.payload, isNew: true }, ...prev.slice(0, 19)]);
          setAnalyticsData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              analytics: {
                ...prev.analytics,
                totalClicks: msg.payload.totalClicks,
                last24hClicks: prev.analytics.last24hClicks + 1
              }
            };
          });
        } else if (msg.type === 'STATS_UPDATE') {
          setAnalyticsData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              analytics: {
                ...prev.analytics,
                ...msg.payload
              }
            };
          });
        }
      } catch (err) {
        console.error('Error handling WS msg:', err);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [selectedLinkId]);

  const triggerSimulatedClick = async () => {
    if (!analyticsData?.link?.slug) return;
    try {
      await fetch(`/${analyticsData.link.slug}?confirm=true`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' }
      });
    } catch (err) {
      console.error('Simulated click error:', err);
    }
  };

  const hourlyBuckets = analyticsData?.analytics?.hourlyBuckets || [];
  const chartData = {
    labels: hourlyBuckets.length > 0 ? hourlyBuckets.map((b) => b.hour_timestamp.split(' ')[1]?.substring(0, 5) || b.hour_timestamp) : ['Now'],
    datasets: [
      {
        label: 'Clicks',
        data: hourlyBuckets.length > 0 ? hourlyBuckets.map((b) => b.click_count) : [0],
        backgroundColor: 'rgba(61, 118, 144, 0.65)',
        borderColor: '#3d7690',
        borderWidth: 1,
        borderRadius: 6
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#161d29', titleColor: '#e4e7eb', bodyColor: '#8993a1' }
    },
    scales: {
      x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#8993a1' } },
      y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#8993a1' }, beginAtZero: true }
    }
  };

  return (
    <div className="analytics-page">
      
      <div className="panel analytics-header">
        <div>
          <h2 className="analytics-title">
            <Activity color="var(--primary)" size={24} /> Live Analytics
          </h2>
          <p className="analytics-subtitle">
            Click data updates in real-time via WebSocket
          </p>
        </div>

        <div className="analytics-controls">
          {links.length > 0 ? (
            <select
              className="field-input link-selector"
              value={selectedLinkId || ''}
              onChange={(e) => setSelectedLinkId(Number(e.target.value))}
            >
              {links.map((l) => (
                <option key={l.id} value={l.id}>
                  /{l.slug} ({l.destination_url.replace('https://', '').substring(0, 20)}...)
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>No links yet</span>
          )}

          <button className="btn-primary" onClick={triggerSimulatedClick} title="Simulate a click">
            <Play size={16} /> Test Click
          </button>
        </div>
      </div>

      {loading ? (
        <div className="panel state-card">
          Loading analytics...
        </div>
      ) : analyticsData ? (
        <div className="analytics-stack">
          
          <div className="kpi-grid">
            
            <div className="panel kpi-card">
              <span className="kpi-label">Total Clicks</span>
              <div className="kpi-value" style={{ color: '#e4e7eb' }}>
                {analyticsData.analytics.totalClicks}
              </div>
              <span className="kpi-sub-success">
                <Zap size={12} /> All time
              </span>
            </div>

            <div className="panel kpi-card">
              <span className="kpi-label">Last 24 Hours</span>
              <div className="kpi-value" style={{ color: '#4d8fac' }}>
                {analyticsData.analytics.last24hClicks}
              </div>
              <span className="kpi-sub">Rolling window</span>
            </div>

            <div className="panel kpi-card">
              <span className="kpi-label">Risk Score</span>
              <div className="kpi-value" style={{ color: analyticsData.link.abuseScore >= 70 ? '#b1544a' : analyticsData.link.abuseScore >= 30 ? '#b98a3f' : '#4a9d6f' }}>
                {analyticsData.link.abuseScore} <span style={{ fontSize: '1rem', color: 'var(--text-dim)' }}>/ 100</span>
              </div>
              <span className={analyticsData.link.status === 'blocked' ? 'badge-blocked' : analyticsData.link.status === 'flagged' ? 'badge-flagged' : 'badge-active'} style={{ marginTop: '4px' }}>
                {analyticsData.link.status}
              </span>
            </div>

            <div className="panel kpi-card">
              <span className="kpi-label">Short Link</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#5d7a94', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
                /{analyticsData.link.slug}
              </div>
              <span className="kpi-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {analyticsData.link.destinationUrl}
              </span>
            </div>

          </div>

          <div className="chart-feed-grid">
            
            <div className="panel chart-card">
              <h3 className="chart-title">
                <MousePointer size={18} color="var(--primary)" /> Clicks — Last 24 Hours
              </h3>
              <div className="chart-container">
                <Bar data={chartData} options={chartOptions} />
              </div>
            </div>

            <div className="panel live-feed-card">
              <div className="feed-header">
                <h3 className="feed-title">
                  <span className="feed-live-dot" /> Live Feed
                </h3>
                <span className="feed-badge">LIVE</span>
              </div>

              <div className="feed-list">
                {liveStream.length === 0 ? (
                  <div className="feed-empty">
                    Click "Test Click" or visit a link to see live events here.
                  </div>
                ) : (
                  liveStream.map((event, i) => (
                    <div key={i} className="feed-event">
                      <div className="feed-event-top">
                        <span style={{ color: '#4d8fac' }}>{event.country}</span>
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{new Date(event.clickedAt).toLocaleTimeString()}</span>
                      </div>
                      <div className="feed-event-bottom">
                        <span>{event.device}</span>
                        <span>{event.referrer}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          <div className="breakdown-grid">
            
            <div className="panel breakdown-card">
              <h4 className="breakdown-title">
                <Globe size={18} color="var(--accent-cyan)" /> Countries
              </h4>
              {Object.keys(analyticsData.analytics.geoBreakdown).length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No data yet</p>
              ) : (
                <div className="breakdown-list">
                  {Object.entries(analyticsData.analytics.geoBreakdown).map(([country, count]) => (
                    <div key={country} className="breakdown-row">
                      <span>{country}</span>
                      <strong style={{ color: 'var(--accent-cyan)' }}>{count}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel breakdown-card">
              <h4 className="breakdown-title">
                <Smartphone size={18} color="var(--accent-purple)" /> Devices
              </h4>
              {Object.keys(analyticsData.analytics.deviceBreakdown).length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No data yet</p>
              ) : (
                <div className="breakdown-list">
                  {Object.entries(analyticsData.analytics.deviceBreakdown).map(([device, count]) => (
                    <div key={device} className="breakdown-row">
                      <span>{device}</span>
                      <strong style={{ color: 'var(--accent-purple)' }}>{count}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel breakdown-card">
              <h4 className="breakdown-title">
                <MousePointer size={18} color="#4a9d6f" /> Referrers
              </h4>
              {Object.keys(analyticsData.analytics.referrerBreakdown).length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No data yet</p>
              ) : (
                <div className="breakdown-list">
                  {Object.entries(analyticsData.analytics.referrerBreakdown).map(([ref, count]) => (
                    <div key={ref} className="breakdown-row">
                      <span>{ref}</span>
                      <strong style={{ color: '#4a9d6f' }}>{count}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      ) : (
        <div className="panel state-card">
          Select a link above to view analytics.
        </div>
      )}

    </div>
  );
}
