import React, { useRef, useState, lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { blobToFile, dataUrlToFile } from '../../lib/cameraUtils';

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

// #region agent log
const _dbg = (loc, msg, data) => fetch('http://127.0.0.1:7242/ingest/3b8e496a-f18c-4030-a7e4-db065781ad49',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:loc,message:msg,data,timestamp:Date.now()})}).catch(()=>{});
// #endregion

export default function ImageUpload({ images, onImagesChange, maxImages = 5 }) {
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [compressing, setCompressing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const isNative = Capacitor.isNativePlatform();
  // #region agent log
  _dbg('ImageUpload.jsx:mount','ImageUpload rendered',{isNative,imagesCount:images.length,maxImages,hypothesisId:'H-D'});
  // #endregion

  const processAndAddFiles = async (files) => {
    // #region agent log
    _dbg('ImageUpload.jsx:processAndAddFiles','ENTRY',{filesLength:files?.length,fileTypes:files?Array.from(files).map(f=>({name:f.name,type:f.type,size:f.size})):null,hypothesisId:'H-B'});
    // #endregion
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
      setCompressing(false);

      const newImages = compressedFiles.map(file => ({
        file,
        preview: URL.createObjectURL(file),
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }));

      // #region agent log
      _dbg('ImageUpload.jsx:processAndAddFiles','calling onImagesChange',{existingCount:images.length,newCount:newImages.length,newIds:newImages.map(i=>i.id),hasPreview:newImages.map(i=>!!i.preview),hypothesisId:'H-D'});
      // #endregion
      onImagesChange([...images, ...newImages]);
    } catch (err) {
      // #region agent log
      _dbg('ImageUpload.jsx:processAndAddFiles','COMPRESSION ERROR',{error:String(err),hypothesisId:'H-C'});
      // #endregion
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
          // #region agent log
          _dbg('ImageUpload.jsx:cameraInput','onChange FIRED',{hasFiles:!!e.target.files,filesCount:e.target.files?.length,hypothesisId:'H-A'});
          // #endregion
          try { sessionStorage.removeItem('camera_intent_active'); } catch { /* */ }
          const files = e.target.files;
          if (files && files.length > 0) {
            processAndAddFiles(files);
          } else {
            // #region agent log
            _dbg('ImageUpload.jsx:cameraInput','onChange NO FILES',{hypothesisId:'H-B'});
            // #endregion
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
            // #region agent log
            _dbg('ImageUpload.jsx:takePhoto','Take Photo clicked',{isNative,hypothesisId:'H-A'});
            // #endregion
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
    </div>
  );
}

ImageUpload.propTypes = {
  images: PropTypes.array.isRequired,
  onImagesChange: PropTypes.func.isRequired,
  maxImages: PropTypes.number,
};
