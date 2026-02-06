import React, { useRef, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';

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

export default function ImageUpload({ images, onImagesChange, maxImages = 5 }) {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [compressing, setCompressing] = useState(false);
  // Track if we're waiting for a file (user clicked the button)
  const waitingForFileRef = useRef(false);
  const processedFilesRef = useRef(new Set());

  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3b8e496a-f18c-4030-a7e4-db065781ad49',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageUpload.jsx:handleFiles',message:'handleFiles called',data:{filesLength:files.length,source:waitingForFileRef.current?'button':'visibility'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'fix-v2'})}).catch(()=>{});
    // #endregion

    const newFiles = Array.from(files).filter(f => {
      // Skip already processed files
      const fileKey = `${f.name}-${f.size}-${f.lastModified}`;
      if (processedFilesRef.current.has(fileKey)) return false;
      processedFilesRef.current.add(fileKey);

      if (!f.type && !f.name) return false;
      // Accept files even without MIME type (some cameras don't set it)
      if (f.type && !f.type.startsWith('image/')) return false;
      if (f.size > 20 * 1024 * 1024) return false;
      return true;
    });

    if (newFiles.length === 0) return;

    const remaining = maxImages - images.length;
    if (remaining <= 0) return;

    const filesToAdd = newFiles.slice(0, remaining);

    setCompressing(true);
    try {
      const compressedFiles = await Promise.all(
        filesToAdd.map(file => compressImage(file))
      );
      setCompressing(false);

      const newImages = compressedFiles.map(file => ({
        file,
        preview: URL.createObjectURL(file),
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }));

      onImagesChange([...images, ...newImages]);
    } catch (err) {
      console.error('[ImageUpload] Compression error:', err);
      setCompressing(false);
    }
  }, [maxImages, images, onImagesChange]);

  // Workaround for mobile browsers that destroy the page when camera opens.
  // When the user returns from the camera, visibilitychange fires.
  // We check if the file input has files that weren't processed yet.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && waitingForFileRef.current) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/3b8e496a-f18c-4030-a7e4-db065781ad49',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageUpload.jsx:visibility',message:'Page became visible',data:{hasFiles:fileInputRef.current?.files?.length>0,waiting:waitingForFileRef.current},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'fix-v2'})}).catch(()=>{});
        // #endregion

        // Small delay to let the browser restore the file input state
        setTimeout(() => {
          const input = fileInputRef.current;
          if (input && input.files && input.files.length > 0) {
            handleFiles(input.files);
            // Clear input after processing
            setTimeout(() => { if (input) input.value = ''; }, 500);
          }
          waitingForFileRef.current = false;
        }, 300);
      }
    };

    // Also handle focus event as fallback (some browsers fire focus but not visibilitychange)
    const handleFocus = () => {
      if (waitingForFileRef.current) {
        setTimeout(() => {
          const input = fileInputRef.current;
          if (input && input.files && input.files.length > 0) {
            handleFiles(input.files);
            setTimeout(() => { if (input) input.value = ''; }, 500);
          }
          waitingForFileRef.current = false;
        }, 500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [handleFiles]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = (id) => {
    const updated = images.filter(img => img.id !== id);
    const removed = images.find(img => img.id === id);
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    onImagesChange(updated);
  };

  const openFilePicker = () => {
    waitingForFileRef.current = true;
    processedFilesRef.current.clear();
    fileInputRef.current?.click();
  };

  return (
    <div>
      {/* File input - on mobile OS shows Camera + Gallery chooser */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/3b8e496a-f18c-4030-a7e4-db065781ad49',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageUpload.jsx:onChange',message:'onChange fired',data:{filesCount:e.target.files?.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'fix-v2'})}).catch(()=>{});
          // #endregion
          const files = e.target.files;
          if (files && files.length > 0) {
            waitingForFileRef.current = false;
            handleFiles(files).then(() => {
              if (fileInputRef.current) fileInputRef.current.value = '';
            });
          }
        }}
        className="hidden"
      />

      {/* Add photo button */}
      <button
        type="button"
        onClick={openFilePicker}
        disabled={compressing}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 text-gray-600 font-medium text-sm rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Add Photo
      </button>

      {/* Drop zone (desktop only) */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`hidden sm:block border-2 border-dashed rounded-xl p-4 text-center transition-all mt-2 ${
          dragActive
            ? 'border-charcoal bg-gray-50'
            : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <p className="text-xs text-gray-400">or drag & drop images here</p>
      </div>

      {/* Compression indicator */}
      {compressing && (
        <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Compressing image...
        </div>
      )}

      {/* Status */}
      <p className="text-xs text-gray-400 mt-2 text-center">
        {images.length}/{maxImages} images (auto-compressed)
      </p>

      {/* Image previews */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-3">
          {images.map((img) => (
            <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
              <img
                src={img.preview || img.url}
                alt="Damage"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleRemove(img.id); }}
                className="absolute top-1 right-1 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

ImageUpload.propTypes = {
  images: PropTypes.array.isRequired,
  onImagesChange: PropTypes.func.isRequired,
  maxImages: PropTypes.number,
};
