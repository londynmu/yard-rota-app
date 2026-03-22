import React from 'react';
import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';

/**
 * Modern animated icon component with smooth motion effects
 * Perfect for navigation and interactive UI elements
 */

type IconSize = 'small' | 'default' | 'large';

interface NavIconProps {
  /** Lucide icon component */
  Icon: LucideIcon;
  /** Tailwind color classes for the icon */
  colorClass?: string;
  /** Size preset for the icon */
  size?: IconSize;
  /** Enable hover and entrance animations */
  animate?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Stroke width for the icon */
  strokeWidth?: number;
  /** ARIA label for accessibility */
  ariaLabel?: string;
}

const sizeClasses: Record<IconSize, string> = {
  small: 'w-5 h-5',
  default: 'w-6 h-6',
  large: 'w-8 h-8',
};

export default function NavIcon({
  Icon,
  colorClass = 'text-slate-700',
  size = 'default',
  animate = true,
  className = '',
  strokeWidth = 1.25,
  ariaLabel,
}: NavIconProps) {
  if (!Icon) return null;

  const sizeClass = sizeClasses[size];
  const combinedClass = `${sizeClass} flex-shrink-0 ${colorClass} ${className}`.trim();

  const iconElement = (
    <Icon
      className={combinedClass}
      strokeWidth={strokeWidth}
      aria-hidden={!ariaLabel}
      aria-label={ariaLabel}
    />
  );

  if (!animate) {
    return iconElement;
  }

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
      {iconElement}
    </motion.span>
  );
}
