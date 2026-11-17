import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import {
  createAssessmentSignedUrl,
  extractAssessmentStoragePath,
} from '../../utils/assessmentImageUrl';

/**
 * Renders an assessment storage image via short-lived signed URL.
 * Bucket is private — never fall back to stored public URLs (they 403).
 */
export default function AssessmentSignedImage({
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
        const signed = await createAssessmentSignedUrl(supabase, url);
        if (cancelled) return;
        if (signed) {
          setSrc(signed);
          return;
        }
        if (!extractAssessmentStoragePath(url) && (url.startsWith('blob:') || url.startsWith('data:'))) {
          setSrc(url);
          return;
        }
        console.warn('[AssessmentSignedImage] could not sign URL', url);
        setFailed(true);
      } catch (err) {
        if (!cancelled) {
          console.warn('[AssessmentSignedImage] sign failed', err);
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
      const signed = await createAssessmentSignedUrl(supabase, url);
      if (signed && signed !== src) {
        setSrc(signed);
        return;
      }
    } catch (err) {
      console.warn('[AssessmentSignedImage] resign failed', err);
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

AssessmentSignedImage.propTypes = {
  url: PropTypes.string,
  alt: PropTypes.string,
  className: PropTypes.string,
  imgClassName: PropTypes.string,
  onClick: PropTypes.func,
  asLink: PropTypes.bool,
};
