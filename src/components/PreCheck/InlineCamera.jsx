import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { blobToFile, dataUrlToFile } from '../../lib/cameraUtils';

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
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
          saveToGallery: false,
          correctOrientation: true,
          width: 1920,
        });

        if (cancelled) return;
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
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-charcoal/90 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
    >
      {error ? (
        <div className="w-full max-w-sm rounded-xl bg-red-900/90 p-5 text-center text-white">
          <p className="mb-4 text-sm">{error}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-charcoal"
          >
            Close
          </button>
        </div>
      ) : (
        <p className="text-sm text-white">
          {opening ? 'Opening camera…' : 'Waiting for camera…'}
        </p>
      )}
    </div>,
    document.body
  );
}

InlineCamera.propTypes = {
  onCapture: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
