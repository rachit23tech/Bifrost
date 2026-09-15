import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Zap, Copy, ExternalLink, AlertTriangle, ArrowRight } from 'lucide-react';

export default function ShortenerForm({ onLinkCreated, setActiveTab, setSelectedLinkId }) {
  const [destinationUrl, setDestinationUrl] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdResult, setCreatedResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleShorten = async (e) => {
    e?.preventDefault();
    if (!destinationUrl) return;

    setLoading(true);
    setError('');
    setCreatedResult(null);

    try {
      const token = localStorage.getItem('bifrost_token');
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ destinationUrl, customSlug })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to shorten URL');
      }

      setCreatedResult(data);
      if (onLinkCreated) onLinkCreated(data.link);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const testPreset = (url) => {
    setDestinationUrl(url);
    setCreatedResult(null);
    setError('');
  };

  return (
    <div className="shortener-page">
      
      <div className="shortener-hero">
        <h2>
          Shorten any URL with <span className="gradient-text">built-in security</span>
        </h2>
        <p>
          Every link is automatically scanned against threat signals before activation. Track clicks in real-time from your dashboard.
        </p>
      </div>

      <div className="glass-card form-card">
        <form onSubmit={handleShorten}>
          <div className="form-stack">
            
            <div>
              <label className="form-label">Destination URL</label>
              <input
                type="url"
                className="glass-input form-input-lg"
                placeholder="https://example.com/your-long-url"
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="form-label">Custom slug (optional)</label>
              <div className="slug-input-group">
                <span className="slug-prefix">bifrost/</span>
                <input
                  type="text"
                  className="glass-input"
                  placeholder="my-custom-slug"
                  value={customSlug}
                  onChange={(e) => setCustomSlug(e.target.value)}
                />
              </div>
            </div>

            <div>
              <span className="preset-label">Quick test:</span>
              <div className="test-presets">
                <button type="button" className="btn-secondary preset-btn" onClick={() => testPreset('https://github.com/facebook/react')}>
                  Safe URL
                </button>
                <button type="button" className="btn-secondary preset-btn" onClick={() => testPreset('http://192.168.1.50/admin')}>
                  IP Literal
                </button>
                <button type="button" className="btn-secondary preset-btn" onClick={() => testPreset('https://bit.ly/test-link')}>
                  Shortener Chain
                </button>
                <button type="button" className="btn-secondary preset-btn" onClick={() => testPreset('http://malware-example.com/payload.exe')}>
                  Blocked Domain
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary submit-btn" disabled={loading}>
              {loading ? (
                <>Checking...</>
              ) : (
                <>
                  <Zap size={18} /> Shorten URL
                </>
              )}
            </button>

          </div>
        </form>

        {error && (
          <div className="error-banner">{error}</div>
        )}
      </div>

      {createdResult && (
        <div
          className="glass-card result-card"
          style={{
            borderColor: createdResult.link.status === 'blocked' ? '#ef4444'
              : createdResult.link.status === 'flagged' ? '#f59e0b'
              : '#10b981'
          }}
        >
          
          <div className="result-header">
            <div>
              <span className="result-label">Your short link</span>
              <h3 className="result-url">{createdResult.link.shortUrl}</h3>
            </div>

            <div>
              {createdResult.link.status === 'active' && (
                <span className="badge-active"><ShieldCheck size={16} /> Safe · {createdResult.link.abuseScore}/100</span>
              )}
              {createdResult.link.status === 'flagged' && (
                <span className="badge-flagged"><AlertTriangle size={16} /> Flagged · {createdResult.link.abuseScore}/100</span>
              )}
              {createdResult.link.status === 'blocked' && (
                <span className="badge-blocked"><ShieldAlert size={16} /> Blocked · {createdResult.link.abuseScore}/100</span>
              )}
            </div>
          </div>

          {createdResult.link.status !== 'blocked' ? (
            <div className="result-actions">
              <button className="btn-primary" onClick={() => copyToClipboard(createdResult.link.shortUrl)}>
                <Copy size={16} /> {copied ? 'Copied!' : 'Copy'}
              </button>
              <a href={createdResult.link.shortUrl} target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none' }}>
                <ExternalLink size={16} /> Open
              </a>
              <button className="btn-secondary" onClick={() => { setSelectedLinkId(createdResult.link.id); setActiveTab('analytics'); }}>
                <Zap size={16} /> View Analytics
              </button>
            </div>
          ) : (
            <div className="blocked-notice">
              This link was blocked due to high-risk security signals. Visitors will see a 403 page.
            </div>
          )}

          <div className="signals-panel">
            <div className="signals-header">
              <span className="signals-title">
                <ShieldAlert size={16} color="var(--primary)" /> Security Analysis
              </span>
            </div>

            {createdResult.evaluation.signals.length === 0 ? (
              <p className="signal-clean">
                No risk signals detected. Link is ready to use.
              </p>
            ) : (
              <div className="signal-list">
                {createdResult.evaluation.signals.map((sig, idx) => (
                  <div key={idx} className="signal-row">
                    <div>
                      <span className="signal-type">{sig.type}</span>
                      <span className="signal-desc">{sig.description}</span>
                    </div>
                    <span className="signal-weight">+{sig.weight}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
