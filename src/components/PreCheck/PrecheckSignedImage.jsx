import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { createPrecheckSignedUrl } from '../../utils/precheckImageUrl';

/**
 * Renders a precheck storage image via short-lived signed URL.
 * Falls back to the stored URL if signing fails (e.g. bucket still public).
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

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setSrc(null);
      return undefined;
    }

    (async () => {
      try {
        const signed = await createPrecheckSignedUrl(supabase, url);
        if (!cancelled) setSrc(signed || url);
      } catch {
        if (!cancelled) setSrc(url);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!src) {
    return <div className={className} aria-hidden="true" />;
  }

  const img = (
    <img
      src={src}
      alt={alt}
      className={asLink ? imgClassName : className}
      onClick={onClick}
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
