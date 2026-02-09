import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * Gets the active video track from the html5-qrcode scanner instance.
 * Used to control torch/flashlight via MediaStream API.
 */
function getVideoTrack(html5Qr) {
  try {
    // html5-qrcode uses a video element internally — grab its srcObject
    const videoElem = document.querySelector('#qr-reader video');
    if (!videoElem?.srcObject) return null;
    const tracks = videoElem.srcObject.getVideoTracks();
    return tracks.length > 0 ? tracks[0] : null;
  } catch {
    return null;
  }
}

/**
 * QR Code Scanner overlay component.
 * Opens the camera, scans for QR codes, and calls onScan with the decoded text.
 * Includes torch/flashlight toggle. Handles camera permissions, errors, and cleanup.
 */
export default function QRScanner({ onScan, onClose }) {
  const scannerRef = useRef(null);
  const html5QrRef = useRef(null);
  const [error, setError] = useState(null);
  const [isStarting, setIsStarting] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const mountedRef = useRef(true);

  const turnOffTorch = useCallback(async () => {
    try {
      const track = getVideoTrack(html5QrRef.current);
      if (track) {
        await track.applyConstraints({ advanced: [{ torch: false }] });
      }
    } catch {
      // Ignore — torch may not be supported
    }
    setTorchOn(false);
  }, []);

  const stopScanner = useCallback(async () => {
    try {
      // Turn off torch before stopping
      await turnOffTorch();
      if (html5QrRef.current) {
        const state = html5QrRef.current.getState();
        // State 2 = SCANNING
        if (state === 2) {
          await html5QrRef.current.stop();
        }
        html5QrRef.current.clear();
        html5QrRef.current = null;
      }
    } catch (err) {
      console.warn('[QRScanner] Cleanup warning:', err);
    }
  }, [turnOffTorch]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    const startScanner = async () => {
      if (!scannerRef.current || cancelled) return;

      try {
        const scanner = new Html5Qrcode('qr-reader');
        html5QrRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText) => {
            if (!cancelled && mountedRef.current) {
              onScan(decodedText);
            }
          },
          () => {
            // QR code not found in frame — ignore silently
          }
        );

        if (!cancelled && mountedRef.current) {
          setIsStarting(false);

          // Check if torch is supported on this device
          const track = getVideoTrack(scanner);
          if (track) {
            const capabilities = track.getCapabilities?.();
            if (capabilities?.torch) {
              setTorchSupported(true);
            }
          }
        }
      } catch (err) {
        console.error('[QRScanner] Start error:', err);
        if (!cancelled && mountedRef.current) {
          setIsStarting(false);
          if (typeof err === 'string' && err.includes('NotAllowedError')) {
            setError('Camera access denied. Please allow camera permissions and try again.');
          } else if (typeof err === 'string' && err.includes('NotFoundError')) {
            setError('No camera found on this device.');
          } else {
            setError('Could not start camera. Please check permissions and try again.');
          }
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      stopScanner();
    };
  }, [onScan, stopScanner]);

  const handleClose = useCallback(() => {
    stopScanner().then(() => onClose());
  }, [stopScanner, onClose]);

  const toggleTorch = useCallback(async () => {
    try {
      const track = getVideoTrack(html5QrRef.current);
      if (!track) return;
      const newState = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: newState }] });
      setTorchOn(newState);
    } catch (err) {
      console.warn('[QRScanner] Torch toggle error:', err);
    }
  }, [torchOn]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <h2 className="text-white text-sm font-semibold">Scan QR Code</h2>
        <div className="flex items-center gap-1">
          {/* Torch toggle — only shown if device supports it */}
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2 rounded-lg transition-colors ${
                torchOn
                  ? 'bg-amber-500 text-black'
                  : 'text-white hover:bg-white/10'
              }`}
              aria-label={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
            >
              {torchOn ? (
                // Filled bolt icon — torch ON
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z" />
                </svg>
              ) : (
                // Outline bolt icon — torch OFF
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
            </button>
          )}
          {/* Close button */}
          <button
            type="button"
            onClick={handleClose}
            className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close scanner"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scanner area */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        {isStarting && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-white text-sm animate-pulse">Starting camera...</div>
          </div>
        )}

        <div
          id="qr-reader"
          ref={scannerRef}
          className="w-full max-w-sm mx-auto"
        />

        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10 px-6">
            <div className="bg-red-900/90 border border-red-500 rounded-xl p-5 text-center max-w-sm">
              <svg className="w-10 h-10 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-white text-sm mb-4">{error}</p>
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 bg-white text-red-900 font-semibold rounded-lg text-sm hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {!error && (
        <div className="px-4 py-4 bg-black/80 text-center">
          <p className="text-white/70 text-xs">Point your camera at the QR code on the tug</p>
        </div>
      )}
    </div>
  );
}
