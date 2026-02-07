import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { dataUrlToFile } from '../../lib/cameraUtils';

export default function InlineCamera({ onCapture, onClose }) {
  const [error, setError] = useState(null);
  const [opening, setOpening] = useState(true);

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

    const openNativeCamera = async () => {
      if (!Capacitor.isNativePlatform()) {
        setError('Camera is available only on mobile devices.');
        setOpening(false);
        return;
      }

      try {
        const photo = await Camera.getPhoto({
          quality: 85,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Camera,
          saveToGallery: false,
          correctOrientation: true,
        });

        if (cancelled) return;
        const dataUrl = photo?.dataUrl;
        if (!dataUrl) {
          setError('No image returned from the camera.');
          setOpening(false);
          return;
        }

        const file = dataUrlToFile(dataUrl, `photo-${Date.now()}.jpg`);
        if (!file) {
          setError('Failed to process the camera image.');
          setOpening(false);
          return;
        }

        onCapture(file);
        onClose();
      } catch (err) {
        if (cancelled) return;
        const message = String(err?.message || '');
        if (message.toLowerCase().includes('cancel')) {
          onClose();
          return;
        }
        setError('Camera was closed or is not available.');
        setOpening(false);
      }
    };

    openNativeCamera();
    return () => { cancelled = true; };
  }, [onCapture, onClose]);

  return createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      background: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      {error ? (
        <div style={{
          background: 'rgba(127, 29, 29, 0.9)',
          color: '#fff',
          borderRadius: 12,
          padding: 20,
          textAlign: 'center',
          maxWidth: 320,
        }}>
          <p style={{ fontSize: 14, marginBottom: 16 }}>{error}</p>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#fff',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      ) : (
        <div style={{ color: '#fff', fontSize: 14 }}>
          {opening ? 'Opening camera...' : 'Waiting for camera...'}
        </div>
      )}
    </div>,
    document.body
  );
}

InlineCamera.propTypes = {
  onCapture: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
