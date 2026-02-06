import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

export default function InlineCamera({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      trackRef.current = null;
    }
  }, []);

  // Lock body scroll and hide bottom nav
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const bottomNav = document.querySelector('nav.md\\:hidden');
    if (bottomNav) bottomNav.style.display = 'none';
    return () => {
      document.body.style.overflow = '';
      if (bottomNav) bottomNav.style.display = '';
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const startCamera = async () => {
      try {
        // Get the environment (back) camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setReady(true);
          };
        }

        // Check torch support after a short delay (some devices need time)
        setTimeout(() => {
          if (cancelled || !track) return;
          try {
            // Method 1: track.getCapabilities()
            const caps = track.getCapabilities();
            if (caps && caps.torch) {
              setTorchAvailable(true);
              return;
            }
          } catch { /* ignore */ }

          try {
            // Method 2: ImageCapture API (fallback)
            if ('ImageCapture' in window) {
              const imageCapture = new ImageCapture(track);
              imageCapture.getPhotoCapabilities().then(photoCaps => {
                if (cancelled) return;
                const hasTorch = photoCaps.torch || (
                  photoCaps.fillLightMode &&
                  photoCaps.fillLightMode.length > 0 &&
                  photoCaps.fillLightMode.indexOf('none') === -1
                );
                if (hasTorch) setTorchAvailable(true);
              }).catch(() => {});
            }
          } catch { /* ignore */ }
        }, 500);

      } catch (err) {
        if (!cancelled) {
          if (err.name === 'NotAllowedError') {
            setError('Camera access denied. Please allow camera access in your browser settings.');
          } else if (err.name === 'NotFoundError') {
            setError('No camera found on this device.');
          } else {
            setError(`Camera error: ${err.message}`);
          }
        }
      }
    };

    startCamera();
    return () => { cancelled = true; stopCamera(); };
  }, [stopCamera]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch (err) {
      console.warn('[InlineCamera] Torch toggle failed:', err);
    }
  };

  const handleCapture = () => {
    if (!videoRef.current || !ready) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `photo-${Date.now()}.jpg`, {
          type: 'image/jpeg', lastModified: Date.now(),
        });
        const url = URL.createObjectURL(blob);
        if (videoRef.current) videoRef.current.pause();
        // Turn off torch before preview
        if (torchOn && trackRef.current) {
          trackRef.current.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
          setTorchOn(false);
        }
        stopCamera();
        setPreview({ url, file });
      }
    }, 'image/jpeg', 0.85);
  };

  const handleRetake = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setReady(false);
    setTorchOn(false);
    setTorchAvailable(false);

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(stream => {
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setReady(true);
        };
      }
      // Re-check torch
      setTimeout(() => {
        try {
          const caps = track.getCapabilities();
          if (caps && caps.torch) setTorchAvailable(true);
        } catch { /* */ }
      }, 500);
    }).catch(err => setError(`Camera error: ${err.message}`));
  };

  const handleUsePhoto = () => {
    if (preview?.file) onCapture(preview.file);
  };

  const handleClose = () => {
    if (torchOn && trackRef.current) {
      trackRef.current.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
    }
    stopCamera();
    if (preview?.url) URL.revokeObjectURL(preview.url);
    onClose();
  };

  return createPortal(
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 99999, background: '#000', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))',
        background: 'rgba(0,0,0,0.8)', zIndex: 10,
      }}>
        <button type="button" onClick={handleClose}
          style={{ color: '#fff', padding: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>
          {preview ? 'Review Photo' : 'Take Photo'}
        </span>
        <div style={{ width: 40 }} />
      </div>

      {/* Camera / Preview area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {error ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ background: 'rgba(127,29,29,0.8)', color: '#fff', borderRadius: 12, padding: 24, textAlign: 'center', maxWidth: 320 }}>
              <p style={{ fontSize: 14, marginBottom: 16 }}>{error}</p>
              <button type="button" onClick={handleClose}
                style={{ padding: '8px 16px', background: '#fff', color: '#000', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Go Back
              </button>
            </div>
          </div>
        ) : preview ? (
          <img src={preview.url} alt="Captured"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            {!ready && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontSize: 14 }}>Starting camera...</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom controls */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32,
        padding: '20px 24px', paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        background: 'rgba(0,0,0,0.8)',
      }}>
        {preview ? (
          <>
            <button type="button" onClick={handleRetake} style={{
              flex: 1, padding: '14px 0', background: 'transparent', border: '2px solid #fff',
              borderRadius: 12, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}>Retake</button>
            <button type="button" onClick={handleUsePhoto} style={{
              flex: 1, padding: '14px 0', background: '#fff', border: '2px solid #fff',
              borderRadius: 12, color: '#000', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}>Use Photo</button>
          </>
        ) : !error && (
          <>
            {/* Flash toggle (left) */}
            <div style={{ width: 48, display: 'flex', justifyContent: 'center' }}>
              {torchAvailable ? (
                <button type="button" onClick={toggleTorch} style={{
                  width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: torchOn ? '#fbbf24' : 'rgba(255,255,255,0.15)',
                  color: torchOn ? '#000' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}>
                  <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
              ) : null}
            </div>

            {/* Capture button (center) */}
            <button type="button" onClick={handleCapture} disabled={!ready}
              onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.9)'; }}
              onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              style={{
                width: 72, height: 72, borderRadius: '50%', border: '4px solid #fff',
                background: 'transparent', cursor: ready ? 'pointer' : 'default',
                opacity: ready ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, transition: 'transform 0.1s',
              }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fff' }} />
            </button>

            {/* Spacer (right) - for symmetry */}
            <div style={{ width: 48 }} />
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

InlineCamera.propTypes = {
  onCapture: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
