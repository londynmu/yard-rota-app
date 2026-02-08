import React, { useRef, useState, useEffect, lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { blobToFile, dataUrlToFile } from '../../lib/cameraUtils';

// #region agent log helper
const _dbgScroll = (loc, msg, data) => {
  fetch('http://127.0.0.1:7242/ingest/3b8e496a-f18c-4030-a7e4-db065781ad49', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: loc,
      message: msg,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  try {
    const prev = JSON.parse(localStorage.getItem('_dbg_log_scroll') || '[]');
    prev.push(`${new Date().toLocaleTimeString()} [${loc}] ${msg} ${JSON.stringify(data)}`);
    if (prev.length > 30) prev.shift();
    localStorage.setItem('_dbg_log_scroll', JSON.stringify(prev));
  } catch { /* ignore */ }
};
// #endregion

const InlineCamera = lazy(() => import('./InlineCamera'));

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// Compress image using canvas
const compressImage = (file, maxWidth = 1200, quality = 0.7) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name || 'photo.jpg', {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
};

export default function ImageUpload({ images, onImagesChange, maxImages = 5, storageKey = 'pending_photos' }) {
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [compressing, setCompressing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [dbgScrollLogs, setDbgScrollLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('_dbg_log_scroll') || '[]'); } catch { return []; }
  });
  const isNative = Capacitor.isNativePlatform();
  const scrollKey = storageKey ? `${storageKey}_scrollY` : 'pending_photos_scrollY';

  // On mount, recover pending photos (dataUrl) if any (handles reload/unmount during capture)
  useEffect(() => {
    let cancelled = false;
    if (!storageKey) return undefined;
    (async () => {
      let pendingRaw = null;
      let pending;
      try { pendingRaw = sessionStorage.getItem(storageKey); } catch { pendingRaw = null; }
      try { pending = JSON.parse(pendingRaw || '[]'); } catch { pending = []; }
      if (!pending || pending.length === 0) return;
      let savedY = null;
      try { savedY = Number(sessionStorage.getItem(scrollKey)); } catch { savedY = null; }
      _dbgScroll('ImageUpload.jsx', 'mount pending', { count: pending.length, savedY, h: document.documentElement.scrollHeight, vh: window.innerHeight, hypothesisId: 'scroll' });
      const files = pending.map(p => dataUrlToFile(p.dataUrl, p.name || 'photo.jpg')).filter(Boolean);
      if (!cancelled && files.length > 0) {
        await processAndAddFiles(files);
      }
      if (!cancelled) {
        try { sessionStorage.setItem(storageKey, pendingRaw || '[]'); } catch {}
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback restore on mount if scroll saved
  useEffect(() => {
    let savedY = null;
    try { savedY = Number(sessionStorage.getItem(scrollKey)); } catch { savedY = null; }
    if (Number.isFinite(savedY) && savedY > 0) {
      requestAnimationFrame(() => {
        try { window.scrollTo({ top: savedY, behavior: 'auto' }); } catch {}
        _dbgScroll('ImageUpload.jsx', 'mount restore rAF', { y: window.scrollY, target: savedY, h: document.documentElement.scrollHeight, vh: window.innerHeight, hypothesisId: 'scroll' });
      });
      setTimeout(() => {
        try { window.scrollTo({ top: savedY, behavior: 'auto' }); } catch {}
        _dbgScroll('ImageUpload.jsx', 'mount restore timeout', { y: window.scrollY, target: savedY, h: document.documentElement.scrollHeight, vh: window.innerHeight, hypothesisId: 'scroll' });
      }, 60);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processAndAddFiles = async (files) => {
    const preY = (() => { try { const v = Number(sessionStorage.getItem(scrollKey)); return Number.isFinite(v) ? v : window.scrollY; } catch { return window.scrollY; }})();
    const preH = document.documentElement.scrollHeight;
    const metricsStart = { y: window.scrollY, savedY: preY, files: files?.length ?? 0, h: preH, vh: window.innerHeight };
    _dbgScroll('ImageUpload.jsx', 'process start', { ...metricsStart, hypothesisId: 'scroll' });
    if (!files || files.length === 0) return;

    const rejected = { nonImage: 0, tooLarge: 0 };
    const newFiles = Array.from(files).filter(f => {
      if (f.type && !f.type.startsWith('image/')) return false;
      if (f.size > 40 * 1024 * 1024) return false;
      return true;
    });

    if (newFiles.length === 0) {
      Array.from(files).forEach(f => {
        if (f.type && !f.type.startsWith('image/')) rejected.nonImage += 1;
        if (f.size > 40 * 1024 * 1024) rejected.tooLarge += 1;
      });
      if (rejected.tooLarge > 0) {
        alert('Image is too large. Please use a smaller image.');
      } else if (rejected.nonImage > 0) {
        alert('Unsupported file type. Please choose an image.');
      }
      return;
    }

    const remaining = maxImages - images.length;
    if (remaining <= 0) {
      alert(`Maximum ${maxImages} images allowed.`);
      return;
    }

    const filesToAdd = newFiles.slice(0, remaining);

    setCompressing(true);
    try {
      const compressedFiles = await Promise.all(
        filesToAdd.map(file => compressImage(file))
      );
      const dataUrls = await Promise.all(
        compressedFiles.map(file => fileToDataUrl(file).catch(() => null))
      );

      const newImages = compressedFiles.map((file, idx) => ({
        file,
        preview: URL.createObjectURL(file),
        dataUrl: dataUrls[idx] || null,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }));

      // Call parent state update FIRST, then local state update
      onImagesChange(prev => {
        const merged = [...prev, ...newImages];
        if (storageKey) {
          try {
            const payload = merged.map(img => ({
              name: img.file?.name || img.name || 'photo.jpg',
              dataUrl: img.dataUrl || img.preview || img.url,
            }));
            sessionStorage.setItem(storageKey, JSON.stringify(payload));
          } catch {}
        }
        return merged;
      });
      setCompressing(false);
      const metricsEnd = { y: window.scrollY, savedY: preY, added: newImages.length, h: document.documentElement.scrollHeight, vh: window.innerHeight };
      _dbgScroll('ImageUpload.jsx', 'process end', { ...metricsEnd, hypothesisId: 'scroll' });

      const restoreScroll = (attempt = 0) => {
        const curH = document.documentElement.scrollHeight;
        // #region agent log
        try{const prev=JSON.parse(localStorage.getItem('_dbg_log_HA')||'[]');prev.push(`${new Date().toLocaleTimeString()} restoreScroll attempt=${attempt} target=${preY} curY=${window.scrollY} curH=${curH}`);if(prev.length>30)prev.shift();localStorage.setItem('_dbg_log_HA',JSON.stringify(prev));}catch{}
        // #endregion
        _dbgScroll('ImageUpload.jsx', 'restore attempt', { attempt, curH, preH, target: preY, hypothesisId: 'scroll' });
        const near = curH >= preH * 0.9; // allow 10% diff
        if (!near && attempt < 40) {
          setTimeout(() => restoreScroll(attempt + 1), 80);
          return;
        }
        try { window.scrollTo({ top: preY, behavior: 'auto' }); } catch {}
        // #region agent log
        try{const prev=JSON.parse(localStorage.getItem('_dbg_log_HA')||'[]');prev.push(`${new Date().toLocaleTimeString()} restoreScroll DONE y=${window.scrollY} target=${preY} attempt=${attempt}`);if(prev.length>30)prev.shift();localStorage.setItem('_dbg_log_HA',JSON.stringify(prev));}catch{}
        // #endregion
        _dbgScroll('ImageUpload.jsx', 'process restore final', { y: window.scrollY, target: preY, preH, curH, attempt, hypothesisId: 'scroll' });
      };
      setTimeout(() => restoreScroll(0), 0);
    } catch (err) {
      console.error('[ImageUpload] Compression error:', err);
      setCompressing(false);
      _dbgScroll('ImageUpload.jsx', 'process error', { y: window.scrollY, error: String(err), hypothesisId: 'scroll' });
    }
  };

  const handleCameraCapture = async (file) => {
    // #region agent log
    _dbg('ImageUpload.jsx:handleCameraCapture','ENTRY',{hasFile:!!file,fileSize:file?.size,fileType:file?.type,hypothesisId:'H-E'});
    setDbgLogs(JSON.parse(localStorage.getItem('_dbg_log') || '[]'));
    // #endregion
    setShowCamera(false);
    if (file) {
      await processAndAddFiles([file]);
    }
  };

  const handleNativePick = async (source) => {
    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        resultType: CameraResultType.Uri,
        source,
        saveToGallery: false,
        correctOrientation: true,
        width: 1920,
      });
      let file = null;
      const webPath = photo?.webPath || (photo?.path ? Capacitor.convertFileSrc(photo.path) : null);
      if (webPath) {
        const response = await fetch(webPath);
        const blob = await response.blob();
        file = blobToFile(blob, `photo-${Date.now()}.jpg`);
      } else if (photo?.dataUrl) {
        file = dataUrlToFile(photo.dataUrl, `photo-${Date.now()}.jpg`);
      }
      if (!file) {
        alert('Unable to process the selected image.');
        return;
      }
      await processAndAddFiles([file]);
    } catch (err) {
      const message = String(err?.message || '').toLowerCase();
      if (message.includes('cancel')) return;
      if (source === CameraSource.Photos) {
        alert('Unable to open the photo library. Please try again.');
      } else {
        alert('Unable to open the camera. Please try again.');
      }
    }
  };

  const handleRemove = (id) => {
    const updated = images.filter(img => img.id !== id);
    const removed = images.find(img => img.id === id);
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    onImagesChange(updated);
  };

  return (
    <div>
      {/* Native camera modal (Capacitor only) */}
      {showCamera && isNative && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
            <div className="text-white">Opening camera...</div>
          </div>
        }>
          <InlineCamera
            onCapture={handleCameraCapture}
            onClose={() => setShowCamera(false)}
          />
        </Suspense>
      )}

      {/* Camera file input (web) - opens system camera with flash/zoom */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          try { sessionStorage.removeItem('camera_intent_active'); } catch { /* */ }
          try { sessionStorage.setItem(scrollKey, String(window.scrollY)); } catch {}
          _dbgScroll('ImageUpload.jsx', 'input onChange', { y: window.scrollY, files: e.target.files?.length ?? 0, hypothesisId: 'scroll' });
          const files = e.target.files;
          if (files && files.length > 0) {
            // persist dataUrls to survive reload/unmount
            let pending = [];
        if (storageKey) {
          try { pending = JSON.parse(sessionStorage.getItem(storageKey) || '[]'); } catch { pending = []; }
        }
            Promise.all(Array.from(files).map(async f => ({ name: f.name, dataUrl: await fileToDataUrl(f) })))
          .then(arr => {
            if (storageKey) {
              try { sessionStorage.setItem(storageKey, JSON.stringify([...pending, ...arr])); } catch {}
            }
          })
              .catch(() => {});
            processAndAddFiles(files);
          } else {
          }
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Gallery file input (web) */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            let pending = [];
        if (storageKey) {
          try { pending = JSON.parse(sessionStorage.getItem(storageKey) || '[]'); } catch { pending = []; }
        }
            Promise.all(Array.from(files).map(async f => ({ name: f.name, dataUrl: await fileToDataUrl(f) })))
          .then(arr => {
            if (storageKey) {
              try { sessionStorage.setItem(storageKey, JSON.stringify([...pending, ...arr])); } catch {}
            }
          })
              .catch(() => {});
            processAndAddFiles(files);
          }
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Two buttons: Camera + Gallery */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            try { sessionStorage.setItem(scrollKey, String(window.scrollY)); } catch {}
            _dbgScroll('ImageUpload.jsx', 'take photo click', { y: window.scrollY, hypothesisId: 'scroll' });
            if (isNative) {
              setShowCamera(true);
            } else {
              // Set flag so app knows we're returning from system camera
              try { sessionStorage.setItem('camera_intent_active', 'true'); } catch { /* */ }
              cameraInputRef.current?.click();
            }
          }}
          disabled={compressing}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 text-charcoal font-medium text-sm rounded-lg hover:bg-slate-200 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Take Photo
        </button>
        <button
          type="button"
          onClick={() => {
            if (isNative) {
              handleNativePick(CameraSource.Photos);
            } else {
              galleryInputRef.current?.click();
            }
          }}
          disabled={compressing}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 text-charcoal font-medium text-sm rounded-lg hover:bg-slate-200 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Gallery
        </button>
      </div>

      {/* Compression indicator */}
      {compressing && (
        <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Compressing...
        </div>
      )}

      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {images.map((img) => (
            <div key={img.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
              <img
                src={img.preview || img.url}
                alt="Damage"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleRemove(img.id); }}
                className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white rounded-bl-lg flex items-center justify-center"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Debug scroll panel (temporary) */}
      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-[10px] font-mono text-yellow-800 max-h-32 overflow-y-auto">
        <div className="flex justify-between items-center mb-1">
          <span className="font-bold">DEBUG SCROLL</span>
          <button
            type="button"
            className="text-red-500 text-[9px]"
            onClick={() => { localStorage.removeItem('_dbg_log_scroll'); setDbgScrollLogs([]); }}
          >
            clear
          </button>
          <button
            type="button"
            className="text-blue-500 text-[9px]"
            onClick={() => { try { setDbgScrollLogs(JSON.parse(localStorage.getItem('_dbg_log_scroll') || '[]')); } catch { setDbgScrollLogs([]); } }}
          >
            refresh
          </button>
        </div>
        {dbgScrollLogs.slice(-8).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}

ImageUpload.propTypes = {
  images: PropTypes.array.isRequired,
  onImagesChange: PropTypes.func.isRequired,
  maxImages: PropTypes.number,
  storageKey: PropTypes.string,
};
