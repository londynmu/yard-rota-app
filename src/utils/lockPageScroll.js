/**
 * Lock background page scroll while a modal is open.
 * Admin rota scrolls inside <main overflow-y-auto>, not only document.body.
 * @returns {() => void} cleanup that restores previous styles
 */
export function lockPageScroll() {
  const targets = new Set([document.documentElement, document.body]);
  document.querySelectorAll('main').forEach((el) => targets.add(el));

  const previous = [...targets].map((el) => ({
    el,
    overflow: el.style.overflow,
    overscrollBehavior: el.style.overscrollBehavior,
  }));

  previous.forEach(({ el }) => {
    el.style.overflow = 'hidden';
    el.style.overscrollBehavior = 'none';
  });

  return () => {
    previous.forEach(({ el, overflow, overscrollBehavior }) => {
      el.style.overflow = overflow;
      el.style.overscrollBehavior = overscrollBehavior;
    });
  };
}
