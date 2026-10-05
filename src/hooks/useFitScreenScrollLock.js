import { useEffect, useState } from 'react';

const LOCK_CLASSES = ['overflow-hidden', 'overscroll-none'];

function canScrollInside(target, root) {
  for (let el = target; el && el !== root && el !== document.body; el = el.parentElement) {
    const style = window.getComputedStyle(el);
    const scrollY = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
    const scrollX = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth;
    if (scrollY || scrollX) return true;
  }
  return false;
}

function contentFitsAboveBottomNav(contentEl) {
  const main = contentEl.closest('main');
  const bottomNavSpace = main ? parseFloat(window.getComputedStyle(main).paddingBottom) || 0 : 0;
  const contentBottom = contentEl.getBoundingClientRect().bottom + window.scrollY;
  return contentBottom + bottomNavSpace <= window.innerHeight + 1;
}

/**
 * Locks page scrolling (including iOS rubber-band drag) while `contentRef` fits on screen above the
 * bottom nav. Scrollable overlays (dialogs, carousels) keep scrolling; if the content stops fitting
 * (e.g. landscape) the lock is released so nothing becomes unreachable.
 */
export function useFitScreenScrollLock(contentRef) {
  const [fits, setFits] = useState(false);

  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return undefined;

    const check = () => setFits(contentFitsAboveBottomNav(contentEl));
    check();

    const observer = new ResizeObserver(check);
    observer.observe(contentEl);
    const main = contentEl.closest('main');
    if (main) observer.observe(main);
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, [contentRef]);

  useEffect(() => {
    if (!fits) return undefined;

    const roots = [document.documentElement, document.body];
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    roots.forEach((el) => el.classList.add(...LOCK_CLASSES));

    const handleTouchMove = (event) => {
      if (event.touches.length > 1) return;
      if (!canScrollInside(event.target, document.documentElement)) event.preventDefault();
    };
    document.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      roots.forEach((el) => el.classList.remove(...LOCK_CLASSES));
    };
  }, [fits]);
}
