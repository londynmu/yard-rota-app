import React from 'react';
import { motion } from 'framer-motion';
import { sizeClass } from '../config/navIcons';

/**
 * Renders a Lucide icon with optional hover scale animation.
 * Use when you want consistent animated nav icons.
 */
export default function NavIcon({ Icon, colorClass, size = 'default', animate = true, className = '', strokeWidth = 1.25 }) {
  const sizeCls = size === 'small' ? 'w-5 h-5 flex-shrink-0' : size === 'large' ? 'w-8 h-8 flex-shrink-0' : sizeClass;
  const combinedClass = [sizeCls, colorClass, className].filter(Boolean).join(' ');

  if (!Icon) return null;

  const iconEl = <Icon className={combinedClass} strokeWidth={strokeWidth} aria-hidden />;

  if (animate) {
    return (
      <motion.span
        className="inline-flex items-center justify-center"
        initial={{ scale: 0.96, opacity: 0.9 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.15, transition: { type: 'spring', stiffness: 400, damping: 20 } }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        {iconEl}
      </motion.span>
    );
  }

  return iconEl;
}
