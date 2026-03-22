import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { sizeClass } from '../config/navIcons';

/**
 * Renders a Lucide icon with optional hover scale animation (Figma-aligned spring).
 * Use when you want consistent animated nav icons.
 */
export default function NavIcon({
  Icon,
  colorClass,
  size = 'default',
  animate = true,
  className = '',
  strokeWidth = 1.25,
  ariaLabel,
}) {
  const prefersReducedMotion = useReducedMotion();
  const effectiveAnimate = animate && !prefersReducedMotion;

  const sizeCls = size === 'small' ? 'w-5 h-5 flex-shrink-0' : size === 'large' ? 'w-8 h-8 flex-shrink-0' : sizeClass;
  const combinedClass = [sizeCls, colorClass, className].filter(Boolean).join(' ');

  if (!Icon) return null;

  const iconEl = (
    <Icon
      className={combinedClass}
      strokeWidth={strokeWidth}
      aria-hidden={!ariaLabel}
      aria-label={ariaLabel || undefined}
    />
  );

  if (effectiveAnimate) {
    return (
      <motion.span
        className="inline-flex items-center justify-center"
        initial={{ scale: 0.92, opacity: 0.8 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{
          scale: 1.12,
          transition: {
            type: 'spring',
            stiffness: 500,
            damping: 15,
          },
        }}
        whileTap={{
          scale: 0.96,
          transition: {
            type: 'spring',
            stiffness: 600,
            damping: 20,
          },
        }}
        transition={{
          type: 'spring',
          stiffness: 350,
          damping: 25,
        }}
      >
        {iconEl}
      </motion.span>
    );
  }

  return iconEl;
}
