import React, { useState } from 'react';

export default function LoginView({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Lütfen kullanıcı adı ve şifrenizi girin.');
      return;
    }

    setIsLoading(true);
    setError('');

    // Call the login handler passed from App.jsx
    fetch('http://localhost:3000/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
      .then(res => {
        if (!res.ok) throw new Error('Hatalı kullanıcı adı veya şifre');
        return res.json();
      })
      .then(data => {
        setIsLoading(false);
        onLogin(data.token, username);
      })
      .catch(err => {
        setIsLoading(false);
        setError(err.message || 'Sunucu bağlantı hatası.');
      });
  };

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      width: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '24px',
      gap: '48px',
      flexWrap: 'wrap'
    }}>
      
      {/* Branding and Feature List Panel */}
      <div className="animate-fade-in" style={{ flex: '1 1 400px', maxWidth: '500px', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-pink) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '22px',
            boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)'
          }}>
            A
          </div>
          <h1 style={{ 
            fontSize: '38px', 
            fontWeight: '700', 
            letterSpacing: '3px',
            background: 'linear-gradient(to right, #ffffff, #c084fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            AURA
          </h1>
        </div>
        
        <p style={{ color: 'var(--text-secondary)', fontSize: '18px', marginBottom: '32px', lineHeight: '1.6' }}>
          Gelişmiş Aktif Öğrenme (Active Learning) destekli, hibrit görüntü etiketleme ve veri yönetim platformu.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ fontSize: '24px', color: 'var(--accent-purple)' }}>⚡</div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>WebSocket Anlık Veri Akışı</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Go Agent aracılığıyla yüksek hızlı, düşük gecikmeli görüntü akışı.</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ fontSize: '24px', color: 'var(--accent-pink)' }}>🤖</div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>Aktif Öğrenme Algoritmaları</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>AI servisinin belirsizlik skoru önerileriyle en doğru görüntülere öncelik verin.</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ fontSize: '24px', color: 'var(--accent-blue)' }}>🔒</div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>Güvenli Bulut Senkronizasyonu</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>JWT yetkilendirmesiyle SQLite veritabanına güvenle kaydedilen etiketler.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Login Form Panel */}
      <div className="glass-panel animate-fade-delay-1" style={{
        flex: '1 1 360px',
        maxWidth: '420px',
        padding: '40px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        textAlign: 'left'
      }}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>Yönetici Girişi</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '28px' }}>
          Platforma erişmek ve etiketleme yapmak için kimliğinizi doğrulayın.
        </p>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            padding: '12px',
            borderRadius: '8px',
            color: '#f87171',
            fontSize: '14px',
            marginBottom: '20px'
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '500' }}>Kullanıcı Adı</label>
            <input
              type="text"
              className="input-field"
              placeholder="örn: admin"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '500' }}>Şifre</label>
            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={isLoading}
          >
            {isLoading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Varsayılan Giriş Bilgileri: <code style={{ color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>admin / 12345</code>
          </p>
        </div>
      </div>

    </div>
  );
}
