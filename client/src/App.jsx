import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import ShortenerForm from './components/ShortenerForm';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import MyLinks from './components/MyLinks';
import AuthModal from './components/AuthModal';

export default function App() {
  const [activeTab, setActiveTab] = useState('shortener');
  const [selectedLinkId, setSelectedLinkId] = useState(null);
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('bifrost_token');
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.user) setUser(data.user);
        })
        .catch(() => {
          localStorage.removeItem('bifrost_token');
        });
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('bifrost_token');
    setUser(null);
  };

  return (
    <div className="app-container">
      
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
        openAuth={() => setAuthOpen(true)}
      />

      <main className="app-main">
        {activeTab === 'shortener' && (
          <ShortenerForm
            onLinkCreated={(link) => setSelectedLinkId(link.id)}
            setActiveTab={setActiveTab}
            setSelectedLinkId={setSelectedLinkId}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsDashboard
            selectedLinkId={selectedLinkId}
            setSelectedLinkId={setSelectedLinkId}
          />
        )}

        {activeTab === 'my-links' && (
          <MyLinks
            setActiveTab={setActiveTab}
            setSelectedLinkId={setSelectedLinkId}
          />
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-inner">
          <div>
            <strong>Bifrost</strong> · Secure URL Shortener
          </div>
          <div>
            Built with Express, React, SQLite & WebSockets
          </div>
        </div>
      </footer>

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthSuccess={(userData) => setUser(userData)}
      />

    </div>
  );
}
