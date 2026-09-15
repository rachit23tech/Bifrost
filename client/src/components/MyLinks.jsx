import React, { useState, useEffect } from 'react';
import { Link2, ExternalLink, Trash2, Activity, Copy, Check, Eye } from 'lucide-react';

export default function MyLinks({ setActiveTab, setSelectedLinkId }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inspectingSignals, setInspectingSignals] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('bifrost_token');
      const res = await fetch('/api/links/my-links', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setLinks(data.links || []);
      }
    } catch (err) {
      console.error('Failed to fetch user links:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteLink = async (id) => {
    if (!window.confirm('Delete this short link?')) return;
    try {
      const token = localStorage.getItem('bifrost_token');
      const res = await fetch(`/api/links/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        setLinks(links.filter((l) => l.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const copyUrl = (slug, id) => {
    const full = `${window.location.protocol}//${window.location.host}/${slug}`;
    navigator.clipboard.writeText(full);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const fetchSignals = async (id) => {
    try {
      const res = await fetch(`/api/links/${id}`);
      if (res.ok) {
        const data = await res.json();
        setInspectingSignals(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="links-page">
      <div className="glass-card links-header">
        <div>
          <h2 className="links-title">
            <Link2 color="var(--primary)" size={24} /> My Links
          </h2>
          <p className="links-subtitle">
            Manage your links, view risk scores, and inspect security signals
          </p>
        </div>
        <button className="btn-secondary" onClick={fetchLinks}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="glass-card state-card">Loading...</div>
      ) : links.length === 0 ? (
        <div className="glass-card state-card">
          No links yet. Head to the Shortener tab to create one.
        </div>
      ) : (
        <div className="links-list">
          {links.map((link) => (
            <div key={link.id} className="glass-card link-item">
              <div className="link-item-inner">
                
                <div className="link-info">
                  <div className="link-slug-row">
                    <span className="link-slug">/{link.slug}</span>

                    {link.status === 'active' && <span className="badge-active">Active</span>}
                    {link.status === 'flagged' && <span className="badge-flagged">Flagged</span>}
                    {link.status === 'blocked' && <span className="badge-blocked">Blocked</span>}

                    <span className="link-score">
                      Score: <strong>{link.abuse_score}/100</strong>
                    </span>
                  </div>

                  <div className="link-dest">
                    <a href={link.destination_url} target="_blank" rel="noreferrer">{link.destination_url}</a>
                  </div>
                </div>

                <div className="link-metrics">
                  
                  <div className="click-count">
                    <span className="click-count-value">{link.click_count || 0}</span>
                    <span className="click-count-label">Clicks</span>
                  </div>

                  <button className="btn-icon" onClick={() => copyUrl(link.slug, link.id)}>
                    {copiedId === link.id ? <Check size={16} color="#34d399" /> : <Copy size={16} />}
                  </button>

                  <button className="btn-icon" onClick={() => { setSelectedLinkId(link.id); setActiveTab('analytics'); }} title="Analytics">
                    <Activity size={16} color="var(--primary)" />
                  </button>

                  <button className="btn-icon" onClick={() => fetchSignals(link.id)} title="Inspect signals">
                    <Eye size={16} color="var(--accent-cyan)" />
                  </button>

                  <button className="btn-icon btn-danger" onClick={() => deleteLink(link.id)} title="Delete">
                    <Trash2 size={16} color="#f87171" />
                  </button>

                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {inspectingSignals && (
        <div className="modal-overlay" onClick={() => setInspectingSignals(null)}>
          <div className="glass-card modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title" style={{ marginBottom: '1rem' }}>
              Signals for /{inspectingSignals.link.slug}
            </h3>
            
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Score: <strong style={{ color: '#fbbf24' }}>{inspectingSignals.link.abuse_score}/100</strong> · Status: <strong>{inspectingSignals.link.status}</strong>
            </p>

            {inspectingSignals.signals.length === 0 ? (
              <p style={{ color: '#34d399', fontSize: '0.9rem' }}>No risk signals found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1.5rem' }}>
                {inspectingSignals.signals.map((s, idx) => (
                  <div key={idx} className="modal-signal">
                    <div className="modal-signal-type">{s.signal_type} (+{s.weight})</div>
                    <div className="modal-signal-desc">{s.description}</div>
                  </div>
                ))}
              </div>
            )}

            <button className="btn-primary" onClick={() => setInspectingSignals(null)} style={{ width: '100%', justifyContent: 'center' }}>
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
