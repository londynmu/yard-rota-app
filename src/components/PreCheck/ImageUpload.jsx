import React, { useRef, useState, lazy, Suspense } from 'react';
import PropTypes from 'prop-types';

const InlineCamera = lazy(() => import('./InlineCamera'));

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
  const [showCamera, setShowCamera] = useState(false);

  const processAndAddFiles = async (files) => {
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files).filter(f => {
      if (f.type && !f.type.startsWith('image/')) return false;
      if (f.size > 20 * 1024 * 1024) return false;
      return true;
    });

    if (newFiles.length === 0) return;

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
  };

  const handleCameraCapture = async (file) => {
    setShowCamera(false);
    if (file) {
      await processAndAddFiles([file]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files) {
      processAndAddFiles(e.dataTransfer.files);
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
      {/* Inline camera modal */}
      {showCamera && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
            <div className="text-white">Loading camera...</div>
          </div>
        }>
          <InlineCamera
            onCapture={handleCameraCapture}
            onClose={() => setShowCamera(false)}
          />
        </Suspense>
      )}

      {/* Gallery file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            processAndAddFiles(files);
          }
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Two buttons: Camera + Gallery */}
      <div className="flex gap-3 mb-2">
        <button
          type="button"
          onClick={() => setShowCamera(true)}
          disabled={compressing}
          className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-red-300 text-red-600 font-medium text-sm rounded-xl hover:bg-red-50 hover:border-red-400 transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Take Photo
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={compressing}
          className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 text-gray-600 font-medium text-sm rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Gallery
        </button>
      </div>

      {/* Drop zone (desktop only) */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`hidden sm:block border-2 border-dashed rounded-xl p-4 text-center transition-all ${
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
