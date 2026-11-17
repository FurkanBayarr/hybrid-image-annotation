import React, { useState, useEffect } from 'react';

// Sub-component to fetch and render raw image thumbnails via local WebSocket
function DashboardThumbnail({ filename }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // Connect to local WebSocket Go-Agent to pull binary image content
    const ws = new WebSocket(`ws://localhost:8080/stream?file=${filename}`);
    
    ws.onmessage = (event) => {
      if (active && event.data instanceof Blob) {
        const url = URL.createObjectURL(event.data);
        setSrc(url);
        setLoading(false);
      }
      ws.close();
    };
    
    ws.onerror = () => {
      if (active) setLoading(false);
      ws.close();
    };
    
    return () => {
      active = false;
      ws.close();
    };
  }, [filename]);

  if (loading) {
    return (
      <div style={{
        width: '100%',
        height: '130px',
        background: 'rgba(255, 255, 255, 0.01)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <div style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          border: '2px solid rgba(139, 92, 246, 0.2)',
          borderTopColor: 'var(--accent-purple)',
          animation: 'spin 1s linear infinite'
        }}></div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      height: '130px',
      overflow: 'hidden',
      position: 'relative',
      borderBottom: '1px solid var(--border-subtle)',
      background: '#111'
    }}>
      <img 
        src={src || ''} 
        alt={filename} 
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transition: 'transform 0.5s ease'
        }}
        className="thumbnail-img"
      />
    </div>
  );
}

export default function DashboardView({ username, onLogout, onSelectFile, token, imagesList = [] }) {
  const [aiRecom, setAiRecom] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'completed' | 'missing'
  const [stats, setStats] = useState({
    totalImages: 0,
    activeStream: 'Ready',
    completedAnnotations: 0
  });

  const [annotationStatuses, setAnnotationStatuses] = useState({});

  // Fetch metrics and progress dynamically on load (using single optimized endpoint)
  useEffect(() => {
    if (!token || imagesList.length === 0) return;

    setStats(prev => ({ ...prev, totalImages: imagesList.length }));

    fetch('http://localhost:3000/api/annotated-images', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(annotatedImageIds => {
      const annotatedSet = new Set(annotatedImageIds);
      const statusesMap = {};

      imagesList.forEach(img => {
        statusesMap[img.filename] = annotatedSet.has(img.filename) ? 'Tamamlandı' : 'Eksik';
      });

      setStats(prev => ({ 
        ...prev, 
        completedAnnotations: annotatedImageIds.length 
      }));
      setAnnotationStatuses(statusesMap);
    })
    .catch(err => {
      console.error("DashboardView: Failed to fetch annotated images list", err);
      // Fallback
      const statusesMap = {};
      imagesList.forEach(img => {
        statusesMap[img.filename] = 'Eksik';
      });
      setAnnotationStatuses(statusesMap);
    });
  }, [token, imagesList]);

  const handleGetSmartTask = () => {
    setIsAiLoading(true);
    setAiRecom(null);

    fetch('http://localhost:5001/next')
      .then(res => {
        if (!res.ok) throw new Error('AI Service not running');
        return res.json();
      })
      .then(data => {
        setIsAiLoading(false);
        setAiRecom(data);
      })
      .catch(err => {
        setIsAiLoading(false);
        alert('AI Aktif Öğrenme Servisi çalışmıyor veya port 5001 kapalı! Lütfen Python servisini başlattığınızdan emin olun.');
      });
  };

  // Filter images based on search query and status button group selection
  const filteredImages = imagesList.filter(img => {
    const matchesSearch = img.filename.toLowerCase().includes(searchQuery.toLowerCase());
    const status = annotationStatuses[img.filename] || 'Eksik';
    const matchesFilter = filterStatus === 'all' || 
                          (filterStatus === 'completed' && status === 'Tamamlandı') || 
                          (filterStatus === 'missing' && status === 'Eksik');
    return matchesSearch && matchesFilter;
  });

  // Pagination states and calculations to handle 5000+ files seamlessly without DOM lag
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 24;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus]);

  const totalFiltered = filteredImages.length;
  const totalPages = Math.ceil(totalFiltered / pageSize) || 1;
  const paginatedImages = filteredImages.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="animate-fade-in" style={{
      maxWidth: '1240px',
      margin: '0 auto',
      padding: '40px 24px',
      textAlign: 'left'
    }}>
      
      {/* Dynamic Keyframes injected locally */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .thumbnail-card:hover .thumbnail-img {
          transform: scale(1.08);
        }
        .thumbnail-card {
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s ease, box-shadow 0.3s ease !important;
        }
        .thumbnail-card:hover {
          transform: translateY(-4px) !important;
          border-color: rgba(139, 92, 246, 0.3) !important;
          box-shadow: 0 16px 32px -10px rgba(139, 92, 246, 0.15) !important;
        }
      `}</style>
      
      {/* Header section */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-subtle)',
        paddingBottom: '24px',
        marginBottom: '40px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '26px' }}>👋</span>
            <h1 style={{ fontSize: '30px', fontWeight: '700', letterSpacing: '-0.5px' }}>Hoş Geldiniz, {username}</h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Etiketleme projelerinizi ve aktif öğrenme işlerinizi buradan yönetin.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            color: 'var(--accent-success)',
            fontWeight: '600'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-success)', display: 'inline-block', marginRight: '8px' }}></span>
            Cloud Safe DB
          </div>
          <button onClick={onLogout} className="btn-danger" style={{ padding: '8px 16px', fontSize: '13px' }}>
            Çıkış Yap
          </button>
        </div>
      </div>

      {/* Analytics widgets */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '24px',
        marginBottom: '48px'
      }}>
        <div className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '32px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>📁</div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Toplam Görsel</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: '1.2' }}>{stats.totalImages} adet</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Dataset dizinindeki görüntüler</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '32px', background: 'rgba(139, 92, 246, 0.05)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(139,92,246,0.1)' }}>🎯</div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Kaydedilen Etiketler</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--accent-purple)', lineHeight: '1.2' }}>{stats.completedAnnotations}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Bulutta saklanan kutu sayısı</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '32px', background: 'rgba(16, 185, 129, 0.05)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.1)' }}>⚡</div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>WebSocket Akışı</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--accent-success)', lineHeight: '1.2' }}>{stats.activeStream}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Port 8080 - Go Agent Bağlantısı</div>
          </div>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2.5fr 1fr',
        gap: '40px',
        alignItems: 'start'
      }}>
        
        {/* Dataset list & Filters */}
        <div>
          {/* Filters Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
            gap: '16px',
            flexWrap: 'wrap'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>
              Proje Görselleri <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 'normal' }}>({filteredImages.length} gösteriliyor)</span>
            </h2>
            
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Search Box */}
              <input 
                type="text"
                placeholder="Görsellerde ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field"
                style={{
                  padding: '8px 12px',
                  fontSize: '13px',
                  borderRadius: '8px',
                  width: '200px',
                  height: '34px'
                }}
              />

              {/* Status Filter Buttons */}
              <div style={{
                display: 'flex',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '2px',
                height: '34px',
                alignItems: 'center'
              }}>
                <button 
                  onClick={() => setFilterStatus('all')}
                  style={{
                    background: filterStatus === 'all' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    border: 'none',
                    color: filterStatus === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: '500',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    height: '100%'
                  }}
                >
                  Tümü
                </button>
                <button 
                  onClick={() => setFilterStatus('completed')}
                  style={{
                    background: filterStatus === 'completed' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                    border: 'none',
                    color: filterStatus === 'completed' ? 'var(--accent-success)' : 'var(--text-secondary)',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: '500',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    height: '100%'
                  }}
                >
                  Tamamlananlar
                </button>
                <button 
                  onClick={() => setFilterStatus('missing')}
                  style={{
                    background: filterStatus === 'missing' ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                    border: 'none',
                    color: filterStatus === 'missing' ? 'var(--accent-error)' : 'var(--text-secondary)',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: '500',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    height: '100%'
                  }}
                >
                  Eksikler
                </button>
              </div>
            </div>
          </div>

          {/* Grid of Image Cards */}
          {filteredImages.length === 0 ? (
            <div style={{
              padding: '60px',
              textAlign: 'center',
              border: '2px dashed var(--border-subtle)',
              borderRadius: '16px',
              color: 'var(--text-secondary)'
            }}>
              <span style={{ fontSize: '32px', display: 'block', marginBottom: '12px' }}>🔍</span>
              Kriterlere uygun görsel bulunamadı.
            </div>
          ) : (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', 
              gap: '20px'
            }}>
              {paginatedImages.map((img, i) => {
                const status = annotationStatuses[img.filename] || 'Eksik';
                return (
                  <div 
                    key={i} 
                    className="glass-card thumbnail-card" 
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: '1px solid var(--border-subtle)'
                    }}
                    onClick={() => onSelectFile(img.filename)}
                  >
                    {/* WebSocket Live Thumbnail */}
                    <DashboardThumbnail filename={img.filename} />

                    {/* Metadata Content */}
                    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                          <h3 
                            style={{ 
                              fontSize: '13px', 
                              fontWeight: '600', 
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '100px'
                            }} 
                            title={img.filename}
                          >
                            {img.filename}
                          </h3>
                          
                          {status === 'Tamamlandı' ? (
                            <span style={{
                              background: 'rgba(16, 185, 129, 0.12)',
                              border: '1px solid rgba(16, 185, 129, 0.25)',
                              color: 'var(--accent-success)',
                              fontSize: '9px',
                              padding: '2px 6px',
                              borderRadius: '12px',
                              fontWeight: '600',
                              whiteSpace: 'nowrap'
                            }}>Tamamlandı</span>
                          ) : (
                            <span style={{
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              color: 'var(--accent-error)',
                              fontSize: '9px',
                              padding: '2px 6px',
                              borderRadius: '12px',
                              fontWeight: '600',
                              whiteSpace: 'nowrap'
                            }}>Eksik</span>
                          )}
                        </div>

                        <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '12px', fontFamily: 'monospace' }}>
                          {img.resolution} • {img.size}
                        </p>
                      </div>

                      <button 
                        className="btn-secondary" 
                        style={{ 
                          width: '100%', 
                          padding: '6px 12px', 
                          fontSize: '11px',
                          fontWeight: '600',
                          marginTop: 'auto',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        Çalışma Alanı 🚀
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '16px',
              marginTop: '32px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '12px 24px'
            }}>
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="btn-secondary"
                style={{
                  padding: '8px 16px',
                  fontSize: '12px',
                  opacity: currentPage === 1 ? 0.35 : 1,
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                ◀️ Önceki Sayfa
              </button>
              
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600', fontFamily: 'monospace' }}>
                Sayfa {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="btn-secondary"
                style={{
                  padding: '8px 16px',
                  fontSize: '12px',
                  opacity: currentPage === totalPages ? 0.35 : 1,
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Sonraki Sayfa ▶️
              </button>
            </div>
          )}
        </div>

        {/* AI Recommendation (Active Learning) Panel */}
        <div className="glass-panel" style={{ padding: '24px 20px', position: 'sticky', top: '24px', border: '1px solid rgba(139, 92, 246, 0.15)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🤖 AI Aktif Öğrenme
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.5', marginBottom: '20px' }}>
            Aktif öğrenme motoru, belirsizlik puanı en yüksek olan (etiketlenmesi en kritik) görseli analiz edip size önerir.
          </p>

          {!aiRecom && (
            <button
              onClick={handleGetSmartTask}
              className="btn-primary"
              style={{ width: '100%', padding: '10px 16px', fontSize: '13px' }}
              disabled={isAiLoading}
            >
              {isAiLoading ? 'Öneri Hesaplanıyor...' : 'Akıllı Öneri Getir'}
            </button>
          )}

          {aiRecom && (
            <div className="animate-fade-in" style={{
              background: 'rgba(139, 92, 246, 0.03)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              borderRadius: '12px',
              padding: '16px',
              marginTop: '16px',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', marginBottom: '12px', width: '100%' }}>
                <span style={{ fontSize: '10px', color: 'var(--accent-purple)', fontWeight: 'bold', letterSpacing: '0.5px' }}>ÖNERİLEN GÖRSEL</span>
                <span style={{ fontSize: '11px', background: 'rgba(139, 92, 246, 0.15)', padding: '2px 8px', borderRadius: '10px', color: '#c084fc', fontWeight: '600' }}>
                  Skor: {aiRecom.score}
                </span>
              </div>
              <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={aiRecom.filename}>
                {aiRecom.filename}
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '16px' }}>
                Gerekçe: {aiRecom.reason}
              </p>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => onSelectFile(aiRecom.filename)}
                  className="btn-primary"
                  style={{ flex: 1, padding: '8px 12px', fontSize: '12px' }}
                >
                  Etiketle ⚡
                </button>
                <button
                  onClick={handleGetSmartTask}
                  className="btn-secondary"
                  style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Öneriyi Yenile"
                >
                  🔄
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
