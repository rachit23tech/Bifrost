import React from 'react';
import { Link, Activity, ShieldAlert, User, LogOut } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, user, onLogout, openAuth, wsConnected }) {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        
        <div className="navbar-brand" onClick={() => setActiveTab('shortener')}>
          <div className="navbar-logo">
            <Link size={24} color="#fff" />
          </div>
          <div>
            <h1 className="navbar-title">BIFROST</h1>
            <span className="navbar-subtitle">Smart Links</span>
          </div>
        </div>

        <nav className="navbar-tabs">
          <button
            className={`nav-tab ${activeTab === 'shortener' ? 'active' : ''}`}
            onClick={() => setActiveTab('shortener')}
          >
            <Link size={16} /> Shortener
          </button>
          
          <button
            className={`nav-tab ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <Activity size={16} /> Analytics
          </button>

          <button
            className={`nav-tab ${activeTab === 'my-links' ? 'active' : ''}`}
            onClick={() => setActiveTab('my-links')}
          >
            <ShieldAlert size={16} /> My Links
          </button>
        </nav>

        <div className="navbar-right">
          <div className="ws-indicator">
            <div className={`ws-dot ${wsConnected ? 'connected' : 'disconnected'}`} />
            <span style={{ color: wsConnected ? '#34d399' : '#f87171', fontWeight: 600 }}>
              {wsConnected ? 'Live' : 'Offline'}
            </span>
          </div>

          {user ? (
            <div className="navbar-user">
              <span className="navbar-email">{user.email}</span>
              <button className="btn-icon" onClick={onLogout} title="Logout">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button className="btn-primary" onClick={openAuth} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
              <User size={16} /> Sign In
            </button>
          )}
        </div>

      </div>
    </header>
  );
}
