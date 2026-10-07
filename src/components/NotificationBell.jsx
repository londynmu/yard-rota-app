import React from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useNotifications } from '../lib/NotificationContext';
import NavIcon from './NavIcon';
import CountBadge from './ui/CountBadge';
import { HOME_TAB_ACTIVE_CLASS, HOME_TAB_INACTIVE_CLASS } from './Home/homeTabStyles';

/**
 * Admin alerts entry point: opens /notifications (pending sign-ups, missing pre-shift checks).
 * `header` = icon button for top headers; `segment` = square that matches the mobile top tab bars.
 */
const NotificationBell = ({ variant = 'header' }) => {
  const { alertCount = 0 } = useNotifications() || {};
  const { pathname } = useLocation();
  const isActive = pathname === '/notifications';

  const className = variant === 'segment'
    ? `relative flex shrink-0 items-center justify-center rounded-xl border px-2.5 transition-all duration-200 sm:px-3 ${isActive ? HOME_TAB_ACTIVE_CLASS : HOME_TAB_INACTIVE_CLASS}`
    : `relative p-2 rounded-xl border transition-all text-charcoal ${
      isActive
        ? 'bg-white/80 border-slate-200/60 shadow-sm'
        : 'border-transparent hover:bg-white/80 hover:border-slate-200/60 hover:shadow-sm'
    }`;

  return (
    <Link
      to="/notifications"
      className={className}
      aria-label={alertCount > 0 ? `Notifications (${alertCount})` : 'Notifications'}
      aria-current={isActive ? 'page' : undefined}
    >
      <NavIcon
        Icon={Bell}
        colorClass={variant === 'segment' && !isActive ? 'text-slate-600' : 'text-slate-800'}
        size={variant === 'segment' ? 'small' : 'default'}
        animate={true}
      />
      <CountBadge count={alertCount} className={variant === 'segment' ? '-top-1.5 -right-1.5' : '-top-0.5 -right-0.5'} />
    </Link>
  );
};

NotificationBell.propTypes = {
  variant: PropTypes.oneOf(['header', 'segment']),
};

export default NotificationBell;
