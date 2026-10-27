import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  createPrecheckSignedUrl,
  extractPrecheckStoragePath,
} from '../../utils/precheckImageUrl';

/**
 * Renders a precheck storage image via short-lived signed URL.
 * Bucket is private — never fall back to stored public URLs (they 403).
 */
export default function PrecheckSignedImage({
  url,
  alt = '',
  className = '',
  imgClassName = 'w-full h-full object-cover',
  onClick,
  asLink = false,
}) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setSrc(null);
      setFailed(false);
      return undefined;
    }

    setFailed(false);
    setSrc(null);

    (async () => {
      try {
        const signed = await createPrecheckSignedUrl(supabase, url);
        if (cancelled) return;
        if (signed) {
          setSrc(signed);
          return;
        }
        // Raw non-storage URL (e.g. blob:) — use as-is.
        if (!extractPrecheckStoragePath(url) && (url.startsWith('blob:') || url.startsWith('data:'))) {
          setSrc(url);
          return;
        }
        console.warn('[PrecheckSignedImage] could not sign URL', url);
        setFailed(true);
      } catch (err) {
        if (!cancelled) {
          console.warn('[PrecheckSignedImage] sign failed', err);
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  const handleImgError = async () => {
    if (!url || failed) {
      setFailed(true);
      setSrc(null);
      return;
    }
    try {
      const signed = await createPrecheckSignedUrl(supabase, url);
      if (signed && signed !== src) {
        setSrc(signed);
        return;
      }
    } catch (err) {
      console.warn('[PrecheckSignedImage] resign failed', err);
    }
    setFailed(true);
    setSrc(null);
  };

  if (failed) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-slate-100 text-slate-400 text-xs`}
        role="img"
        aria-label={alt || 'Photo unavailable'}
      >
        Photo unavailable
      </div>
    );
  }

  if (!src) {
    return <div className={className} aria-hidden="true" />;
  }

  const img = (
    <img
      src={src}
      alt={alt}
      className={asLink ? imgClassName : className}
      onClick={onClick}
      onError={handleImgError}
    />
  );

  if (asLink) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={onClick}
      >
        {img}
      </a>
    );
  }

  return img;
}
