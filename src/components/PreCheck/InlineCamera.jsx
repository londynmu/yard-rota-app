import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

export default function InlineCamera({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState(null); // { url, file } when photo taken

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Lock body scroll and hide bottom nav when camera is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    // Hide mobile bottom nav
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setReady(true);
          };
        }
      } catch (err) {
        console.error('[InlineCamera] Error:', err);
        if (!cancelled) {
          if (err.name === 'NotAllowedError') {
            setError('Camera access denied. Please allow camera access in your browser settings and reload.');
          } else if (err.name === 'NotFoundError') {
            setError('No camera found on this device.');
          } else {
            setError(`Camera error: ${err.message}`);
          }
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [stopCamera]);

  const handleCapture = () => {
    if (!videoRef.current || !ready) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `photo-${Date.now()}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          const url = URL.createObjectURL(blob);
          // Pause video, show preview
          if (videoRef.current) videoRef.current.pause();
          stopCamera();
          setPreview({ url, file });
        }
      },
      'image/jpeg',
      0.85
    );
  };

  const handleRetake = () => {
    // Clear preview and restart camera
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setReady(false);

    // Restart camera
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(stream => {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setReady(true);
        };
      }
    }).catch(err => {
      setError(`Camera error: ${err.message}`);
    });
  };

  const handleUsePhoto = () => {
    if (preview?.file) {
      onCapture(preview.file);
    }
    // Don't revoke URL yet - it will be used as preview in the form
  };

  const handleClose = () => {
    stopCamera();
    if (preview?.url) URL.revokeObjectURL(preview.url);
    onClose();
  };

  // Render as portal to document.body so it's truly above everything
  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        background: 'rgba(0,0,0,0.8)',
        zIndex: 10,
      }}>
        <button
          type="button"
          onClick={handleClose}
          style={{ color: '#fff', padding: 8, background: 'none', border: 'none', cursor: 'pointer' }}
        >
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
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
            <div style={{
              background: 'rgba(127,29,29,0.8)', color: '#fff', borderRadius: 12, padding: 24, textAlign: 'center', maxWidth: 320,
            }}>
              <p style={{ fontSize: 14, marginBottom: 16 }}>{error}</p>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  padding: '8px 16px', background: '#fff', color: '#000', border: 'none',
                  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Go Back
              </button>
            </div>
          </div>
        ) : preview ? (
          // Photo preview
          <img
            src={preview.url}
            alt="Captured"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {!ready && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: '#fff', fontSize: 14 }}>Starting camera...</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: '20px 16px',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        background: 'rgba(0,0,0,0.8)',
      }}>
        {preview ? (
          // Review buttons: Retake / Use Photo
          <>
            <button
              type="button"
              onClick={handleRetake}
              style={{
                flex: 1,
                padding: '14px 0',
                background: 'transparent',
                border: '2px solid #fff',
                borderRadius: 12,
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retake
            </button>
            <button
              type="button"
              onClick={handleUsePhoto}
              style={{
                flex: 1,
                padding: '14px 0',
                background: '#fff',
                border: '2px solid #fff',
                borderRadius: 12,
                color: '#000',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Use Photo
            </button>
          </>
        ) : !error && (
          // Capture button
          <button
            type="button"
            onClick={handleCapture}
            disabled={!ready}
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              border: '4px solid #fff',
              background: 'transparent',
              cursor: ready ? 'pointer' : 'default',
              opacity: ready ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              transition: 'transform 0.1s',
            }}
            onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.9)'; }}
            onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#fff',
            }} />
          </button>
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
