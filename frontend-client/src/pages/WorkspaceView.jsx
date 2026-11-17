import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';

// Predefined label classes and their associated aesthetic colors
const LABEL_CLASSES = ['Car', 'Pedestrian', 'Cyclist', 'Traffic Sign', 'Building', 'hat', 'default'];

const LABEL_COLORS = {
  'Car': '#f43f5e',         // Rose red
  'Pedestrian': '#10b981',  // Emerald green
  'Cyclist': '#06b6d4',     // Cyan
  'Traffic Sign': '#eab308', // Amber yellow
  'Building': '#a855f7',    // Purple
  'hat': '#f97316',         // Orange for Hard Hat (Baret)
  'default': '#ec4899'      // Pink
};

// URLImage sub-component utilizing useImage hook
const URLImage = ({ src, onImageLoad }) => {
  const [image] = useImage(src);

  useEffect(() => {
    if (image && onImageLoad) {
      onImageLoad(image.width, image.height);
    }
  }, [image, onImageLoad]);

  return <KonvaImage image={image} width={image?.width} height={image?.height} />;
};

export default function WorkspaceView({ currentFile, token, imagesList = [], onSelectFile, onBackToDashboard, onLogout }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [status, setStatus] = useState('Baglanıyor...');
  const [stageSize, setStageSize] = useState({ width: 600, height: 400 });
  const [annotations, setAnnotations] = useState([]);
  const [newAnnotation, setNewAnnotation] = useState([]);
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [lastUsedLabel, setLastUsedLabel] = useState('hard hat');
  const [isSmartLoading, setIsSmartLoading] = useState(false);
  const [confThreshold, setConfThreshold] = useState(0.20);
  const isDrawing = useRef(false);

  // Quick navigation calculations with local state fallback to prevent synchronization loss
  const [localImagesList, setLocalImagesList] = useState(imagesList);

  useEffect(() => {
    if (imagesList && imagesList.length > 0) {
      setLocalImagesList(imagesList);
    } else if (token) {
      fetch('http://localhost:3000/api/images', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setLocalImagesList(data);
        }
      })
      .catch(err => console.error("WorkspaceView: Dynamic local list fetch failed:", err));
    }
  }, [imagesList, token]);

  const currentIndex = localImagesList.findIndex(img => img.filename === currentFile);

  const handleSmartNext = () => {
    setIsSmartLoading(true);

    // Automatically trigger a silent save to cloud to prevent work loss
    const payload = annotations.map(a => ({
      imageId: currentFile,
      label: a.label,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height
    }));

    fetch('http://localhost:3000/api/annotations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
    .then(() => {
      console.log('Automated save completed successfully.');
      return fetch('http://localhost:5001/next');
    })
    .then(res => {
      if (!res.ok) throw new Error('AI Service not running');
      return res.json();
    })
    .then(data => {
      setIsSmartLoading(false);
      if (data && data.filename) {
        if (data.filename === currentFile) {
          // If the AI recommended the same file, check if there are other candidates
          if (data.all_candidates && data.all_candidates.length > 1) {
            const nextCandidate = data.all_candidates.find(c => c.filename !== currentFile);
            if (nextCandidate) {
              onSelectFile(nextCandidate.filename);
              return;
            }
          }
          alert('Mevcut resim şu anda aktif öğrenme için en yüksek belirsizliğe sahip en kritik görsel durumunda! 🎯');
        } else {
          onSelectFile(data.filename);
        }
      } else {
        alert('Yeni bir öneri görseli bulunamadı.');
      }
    })
    .catch((err) => {
      setIsSmartLoading(false);
      console.error('Smart navigation failed:', err);
      alert('Akıllı Öneri getirilemedi. Lütfen Python AI servisinin (Port 5001) açık olduğundan emin olun!');
    });
  };

  // Active WebSocket Connection
  useEffect(() => {
    if (!currentFile) return;

    const ws = new WebSocket(`ws://localhost:8080/stream?file=${currentFile}`);

    ws.onopen = () => {
      setStatus('Bağlanıyor...');
      console.log('WebSocket connection successfully opened for:', currentFile);
    };

    ws.onmessage = (event) => {
      const blob = event.data;
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      setStatus('Görüntü Yüklendi');
    };

    ws.onerror = (error) => {
      console.error('WebSocket Error:', error);
      setStatus('Hata');
    };

    ws.onclose = () => {
      setStatus(prev => {
        if (prev === 'Görüntü Yüklendi') {
          return 'Görüntü Yüklendi';
        }
        return 'Bağlantı Kesildi';
      });
      console.log('WebSocket connection closed.');
    };

    return () => {
      ws.close();
    };
  }, [currentFile]);

  // Load Annotations from Cloud
  useEffect(() => {
    if (!currentFile || !token) return;

    setAnnotations([]);
    setSelectedBoxId(null);

    fetch(`http://localhost:3000/api/annotations?imageID=${currentFile}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => {
        if (!res.ok) return [];
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          // GORM structure contains ID, ImageID, Label, X, Y, Width, Height
          const formatted = data.map(item => ({
            id: item.ID || item.id || Math.random().toString(36).substr(2, 9),
            x: item.x !== undefined ? item.x : item.X,
            y: item.y !== undefined ? item.y : item.Y,
            width: item.width !== undefined ? item.width : item.Width,
            height: item.height !== undefined ? item.height : item.Height,
            label: item.label || item.Label || 'default'
          }));
          setAnnotations(formatted);
        }
      })
      .catch(err => console.error("Error loading annotations:", err));

  }, [currentFile, token]);

  const handleAiAutoLabel = () => {
    if (!currentFile) return;
    setIsAiProcessing(true);

    fetch(`http://localhost:5001/auto-annotate?file=${currentFile}&conf=${confThreshold}`)
      .then(res => {
        if (!res.ok) {
          throw new Error('AI sunucusundan geçersiz yanıt döndü.');
        }
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          if (data.length === 0) {
            alert('YOLOv8 görselde eşleşen herhangi bir nesne tespit edemedi. 🕵️‍♂️');
            return;
          }
          
          const newBoxes = data.map(item => ({
            id: Math.random().toString(36).substr(2, 9),
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            label: item.label || 'default'
          }));

          setAnnotations(newBoxes);
          alert(`YOLOv8 başarıyla ${newBoxes.length} adet nesne tespit etti! 🤖✨`);
        }
      })
      .catch(err => {
        console.error('AI Auto-Label error:', err);
        alert('YOLOv8 oto-etiketleme başarısız oldu. Lütfen Python AI servisinin (Port 5001) açık olduğundan emin olun!');
      })
      .finally(() => {
        setIsAiProcessing(false);
      });
  };

  const handleTrainModel = () => {
    setIsTraining(true);

    fetch('http://localhost:5001/train', {
      method: 'POST'
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.error || 'Eğitim sırasında hata oluştu.');
          });
        }
        return res.json();
      })
      .then(data => {
        alert(data.message || 'Yapay zeka başarıyla yeni verilerle eğitildi! 🔄✨');
      })
      .catch(err => {
        console.error('YOLOv8 Training error:', err);
        alert('Model eğitimi başarısız oldu: ' + err.message);
      })
      .finally(() => {
        setIsTraining(false);
      });
  };

  const handleImageLoad = useCallback((width, height) => {
    setStageSize({ width, height });
  }, []);

  // Mouse Handlers for Canvas Drawing
  const handleMouseDown = (e) => {
    if (!imageUrl) return;
    
    // Check if we are clicking on an existing box to select it instead of drawing
    const clickedOnBox = e.target.attrs.name === 'annotation-rect';
    if (clickedOnBox) {
      const boxId = e.target.attrs.id;
      setSelectedBoxId(boxId);
      return;
    }

    isDrawing.current = true;
    const { x, y } = e.target.getStage().getPointerPosition();
    setNewAnnotation([{ x, y, width: 0, height: 0, label: lastUsedLabel, id: 'temp' }]);
  };

  const handleMouseMove = (e) => {
    const stage = e.target.getStage();
    const { x, y } = stage.getPointerPosition();
    
    // Update live mouse coordinate displays
    setMousePos({ x: Math.round(x), y: Math.round(y) });

    if (!isDrawing.current) return;

    const startRect = newAnnotation[0];
    setNewAnnotation([
      {
        ...startRect,
        width: x - startRect.x,
        height: y - startRect.y
      }
    ]);
  };

  const handleMouseUp = () => {
    isDrawing.current = false;

    if (newAnnotation.length > 0) {
      const rect = newAnnotation[0];
      // Keep only boxes with meaningful size
      if (Math.abs(rect.width) > 5 && Math.abs(rect.height) > 5) {
        const uniqueId = Math.random().toString(36).substr(2, 9);
        const newBox = {
          id: uniqueId,
          x: rect.width < 0 ? rect.x + rect.width : rect.x,
          y: rect.height < 0 ? rect.y + rect.height : rect.y,
          width: Math.abs(rect.width),
          height: Math.abs(rect.height),
          label: lastUsedLabel
        };
        setAnnotations([...annotations, newBox]);
        setSelectedBoxId(uniqueId);
      }
      setNewAnnotation([]);
    }
  };

  // Delete specific annotation
  const handleDeleteAnnotation = (id) => {
    setAnnotations(annotations.filter(a => a.id !== id));
    if (selectedBoxId === id) setSelectedBoxId(null);
  };

  // Update label class
  const handleUpdateLabel = (id, newClass) => {
    setLastUsedLabel(newClass);
    setAnnotations(annotations.map(a => {
      if (a.id === id) {
        return { ...a, label: newClass };
      }
      return a;
    }));
  };

  // Clear all annotations
  const handleClearAll = () => {
    if (window.confirm('Tüm etiketleri temizlemek istediğinize emin misiniz?')) {
      setAnnotations([]);
      setSelectedBoxId(null);
    }
  };

  // Save to Cloud Securely
  const handleSaveToCloud = () => {
    if (!token) {
      alert('Oturum süresi dolmuş. Lütfen tekrar giriş yapın.');
      return;
    }

    const payload = annotations.map(a => ({
      imageId: currentFile,
      label: a.label,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height
    }));

    fetch('http://localhost:3000/api/annotations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
      .then(res => {
        if (res.status === 401) throw new Error('Oturum geçersiz.');
        return res.json();
      })
      .then(() => {
        alert('Etiketler bulut veritabanına başarıyla kaydedildi! 🔒');
      })
      .catch(err => {
        alert('Kaydedilirken hata oluştu: ' + err.message);
      });
  };

  const getStatusBadgeStyle = () => {
    switch (status) {
      case 'Görüntü Yüklendi':
        return { background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: 'var(--accent-success)' };
      case 'Hata':
      case 'Bağlantı Kesildi':
        return { background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--accent-error)' };
      default:
        return { background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.3)', color: 'var(--accent-purple)' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      
      {/* Top Navigation Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 24px',
        background: 'var(--bg-dark-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        height: '64px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onBackToDashboard} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⬅️</span> Panel
          </button>
          <span style={{ color: 'var(--text-muted)' }}>|</span>
          <h2 style={{ fontSize: '14px', fontWeight: '600', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={currentFile}>
            Dosya: <span style={{ color: 'var(--accent-purple)' }}>{currentFile}</span>
          </h2>
        </div>

        {/* Center: Workspace Smart Navigation & Auto-Save */}
        {localImagesList.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', fontFamily: 'monospace' }}>
              Görsel: {currentIndex + 1} / {localImagesList.length}
            </span>

            <button
              onClick={handleSmartNext}
              disabled={isSmartLoading}
              className="btn-primary"
              style={{
                padding: '6px 16px',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-pink) 100%)',
                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.2)',
                border: 'none',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              {isSmartLoading ? (
                <>Öneri Getiriliyor...</>
              ) : (
                <>🤖 Akıllı Öneri Getir</>
              )}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            ...getStatusBadgeStyle(),
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }} className={status === 'Görüntü Yüklendi' ? 'pulse-connected' : ''}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: status === 'Görüntü Yüklendi' ? 'var(--accent-success)' : (status === 'Hata' || status === 'Bağlantı Kesildi') ? 'var(--accent-error)' : 'var(--accent-purple)'
            }}></span>
            {status === 'Görüntü Yüklendi' ? 'Aktif Akış ✅' : `WebSocket: ${status}`}
          </div>
          <button onClick={onLogout} className="btn-danger" style={{ padding: '6px 12px', fontSize: '13px' }}>Çıkış</button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="workspace-container">
        
        {/* Left Toolbar */}
        <div style={{
          background: 'var(--bg-dark-surface)',
          borderRight: '1px solid var(--border-subtle)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '16px' }}>KONTROLLER</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                background: 'rgba(139, 92, 246, 0.08)',
                border: '1px solid var(--accent-purple)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13px',
                color: 'var(--text-primary)',
                fontWeight: '500'
              }}>
                ✏️ Çizim Modu Aktif
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: '1.5', padding: '0 8px' }}>
                Kutu eklemek için resim üzerinde sürükleyip bırakın. Seçmek için kutunun çerçevesine tıklayın.
              </div>

              {/* Confidence Threshold Slider */}
              <div style={{ marginTop: '8px', padding: '0 8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: '600' }}>
                  <span>AI GÜVEN EŞİĞİ</span>
                  <span style={{ color: 'var(--accent-purple)', fontFamily: 'monospace' }}>{Math.round(confThreshold * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.80"
                  step="0.05"
                  value={confThreshold}
                  onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    accentColor: 'var(--accent-purple)',
                    background: 'rgba(255,255,255,0.1)',
                    height: '4px',
                    borderRadius: '2px',
                    outline: 'none',
                    cursor: 'pointer',
                    marginBottom: '8px'
                  }}
                />
              </div>

              <button
                onClick={handleAiAutoLabel}
                disabled={isAiProcessing || isTraining}
                className="btn-primary"
                style={{
                  marginTop: '8px',
                  background: 'linear-gradient(135deg, var(--accent-purple) 0%, #6d28d9 100%)',
                  border: 'none',
                  boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontWeight: '600',
                  padding: '12px',
                  borderRadius: '8px',
                  cursor: (isAiProcessing || isTraining) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                <span>🤖</span> {isAiProcessing ? 'AI Analiz Ediyor...' : 'AI Auto-Label (YOLO)'}
              </button>

              <button
                onClick={handleTrainModel}
                disabled={isTraining || isAiProcessing}
                className="btn-secondary"
                style={{
                  marginTop: '8px',
                  background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                  border: 'none',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontWeight: '600',
                  padding: '12px',
                  borderRadius: '8px',
                  cursor: (isTraining || isAiProcessing) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                  color: '#ffffff'
                }}
              >
                <span>🔄</span> {isTraining ? 'Yapay Zeka Eğitiliyor...' : 'Yapay Zekayı Eğit'}
              </button>
            </div>
          </div>

          <div>
            <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '8px' }}>PİKSEL KOORDİNATLARI</h4>
            <div style={{
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '10px',
              fontSize: '12px',
              fontFamily: 'monospace',
              color: 'var(--text-secondary)'
            }}>
              X: {mousePos.x}px <br />
              Y: {mousePos.y}px
            </div>
          </div>
        </div>

        {/* Center Canvas Area */}
        <div style={{
          background: '#040406',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          padding: '20px',
          position: 'relative'
        }}>
          {isAiProcessing && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(9, 9, 11, 0.85)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
              gap: '16px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: '3px solid rgba(139, 92, 246, 0.2)',
                borderTopColor: 'var(--accent-purple)',
                animation: 'spin 1s linear infinite'
              }}></div>
              <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '15px' }}>
                🤖 YOLOv8 Görseli Analiz Ediyor...
              </span>
            </div>
          )}
          
          {isTraining && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(9, 9, 11, 0.85)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
              gap: '16px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: '3px solid rgba(16, 185, 129, 0.2)',
                borderTopColor: '#10b981',
                animation: 'spin 1s linear infinite'
              }}></div>
              <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '15px', textAlign: 'center', padding: '0 20px', lineHeight: '1.6' }}>
                🔄 Yapay Zeka Yeni Verilerle Eğitiliyor... <br />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '400' }}>
                  Bu işlem birkaç saniye sürecektir. Lütfen pencereyi kapatmayın.
                </span>
              </span>
            </div>
          )}
          {imageUrl ? (
            <div style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.05)', background: '#111' }}>
              <Stage
                width={stageSize.width}
                height={stageSize.height}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                <Layer>
                  {/* Render streamed image */}
                  <URLImage src={imageUrl} onImageLoad={handleImageLoad} />

                  {/* Render completed annotations */}
                  {annotations.map((rect) => {
                    const isSelected = rect.id === selectedBoxId;
                    const color = LABEL_COLORS[rect.label] || '#ec4899';
                    return (
                      <React.Fragment key={rect.id}>
                        <Rect
                          id={rect.id}
                          name="annotation-rect"
                          x={rect.x}
                          y={rect.y}
                          width={rect.width}
                          height={rect.height}
                          stroke={color}
                          strokeWidth={isSelected ? 3 : 2}
                          fill={isSelected ? `${color}15` : 'transparent'}
                          onClick={() => setSelectedBoxId(rect.id)}
                        />
                        <Text
                          x={rect.x}
                          y={rect.y - 15 < 0 ? rect.y + 5 : rect.y - 15}
                          text={rect.label}
                          fontSize={11}
                          fontFamily="sans-serif"
                          fontStyle="bold"
                          fill="#ffffff"
                          align="center"
                          verticalAlign="middle"
                          padding={2}
                          // Give label background
                          listening={false}
                        />
                      </React.Fragment>
                    );
                  })}

                  {/* Render drawing preview */}
                  {newAnnotation.map((rect) => (
                    <Rect
                      key="preview"
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                      stroke="var(--accent-purple)"
                      strokeWidth={2}
                      dash={[4, 4]}
                    />
                  ))}
                </Layer>
              </Stage>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)' }}>
              ⏳ WebSocket üzerinden resim bekleniyor...
            </div>
          )}
        </div>

        {/* Right Labeling Panel */}
        <div style={{
          background: 'var(--bg-dark-surface)',
          borderLeft: '1px solid var(--border-subtle)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden'
        }}>
          
          {/* Main Action buttons */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
            <button onClick={handleSaveToCloud} className="btn-primary" style={{ flex: 1, padding: '10px 16px', fontSize: '13px' }}>
              Buluta Kaydet 🔒
            </button>
            <button onClick={handleClearAll} className="btn-secondary" style={{ padding: '10px', fontSize: '13px' }}>
              🗑️ Temizle
            </button>
          </div>

          <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            ETİKET LİSTESİ ({annotations.length})
          </h3>

          {/* Annotations List */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
            {annotations.length === 0 ? (
              <div style={{
                border: '1px dashed var(--border-subtle)',
                borderRadius: '8px',
                padding: '24px 12px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '13px'
              }}>
                Henüz kutu çizilmedi. Resim üzerine sürükleyerek çizim yapın.
              </div>
            ) : (
              annotations.map((rect) => {
                const isSelected = rect.id === selectedBoxId;
                const activeColor = LABEL_COLORS[rect.label] || '#ec4899';
                
                return (
                  <div key={rect.id} style={{
                    background: isSelected ? 'rgba(255,255,255,0.03)' : 'transparent',
                    border: `1px solid ${isSelected ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                  onClick={() => setSelectedBoxId(rect.id)}
                  >
                    
                    {/* Header: Class Color Indicator & Delete button */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: activeColor
                        }}></span>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                          ID: {rect.id.toString().substr(0, 5)}
                        </span>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteAnnotation(rect.id); }} style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-error)',
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: '4px'
                      }}>
                        🗑️
                      </button>
                    </div>

                    {/* Coordinates preview */}
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      x:{Math.round(rect.x)} y:{Math.round(rect.y)} w:{Math.round(rect.width)} h:{Math.round(rect.height)}
                    </div>

                    {/* Dynamic Label Editor (Hybrid Text Input + Badges) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <input
                        type="text"
                        value={rect.label}
                        onChange={(e) => handleUpdateLabel(rect.id, e.target.value)}
                        placeholder="Etiket ismi girin (Örn: Elma)"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          color: '#fff',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          fontSize: '12px',
                          outline: 'none',
                          transition: 'all 0.2s ease',
                          width: '100%'
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--accent-purple)'}
                        onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                      />
                      
                      {/* Popular Quick Suggestions Badge Bar */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {['Car', 'Pedestrian', 'Cyclist', 'Traffic Sign', 'hard hat'].map((cls) => {
                          const isCurrent = rect.label === cls;
                          return (
                            <button
                              key={cls}
                              onClick={(e) => { e.stopPropagation(); handleUpdateLabel(rect.id, cls); }}
                              style={{
                                background: isCurrent ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                                color: isCurrent ? 'var(--accent-purple)' : 'var(--text-muted)',
                                border: `1px solid ${isCurrent ? 'var(--accent-purple)' : 'rgba(255,255,255,0.05)'}`,
                                borderRadius: '12px',
                                padding: '3px 8px',
                                fontSize: '10px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                fontWeight: '500'
                              }}
                              onMouseEnter={(e) => {
                                if (!isCurrent) e.target.style.background = 'rgba(255,255,255,0.1)';
                              }}
                              onMouseLeave={(e) => {
                                if (!isCurrent) e.target.style.background = 'rgba(255,255,255,0.05)';
                              }}
                            >
                              {cls}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
