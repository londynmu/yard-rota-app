import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { homeTabsConfig } from '../../config/navIcons';
import { useNotifications } from '../../lib/NotificationContext';
import NavIcon from '../NavIcon';
import NotificationBell from '../NotificationBell';
import { HOME_TAB_SEGMENT_CLASS, HOME_TAB_ACTIVE_CLASS, HOME_TAB_INACTIVE_CLASS } from './homeTabStyles';

/** Sticky top bar for the mobile Home section (same shell as My Rota / Stats top bars). */
export default function HomeTabsBar() {
  const location = useLocation();
  const { isAdmin } = useNotifications();

  const tabs = (
    <div className={`grid grid-cols-3 gap-1.5 sm:gap-2 ${isAdmin ? 'min-w-0 flex-1' : ''}`}>
      {homeTabsConfig.map((tab) => {
        const isActive = location.pathname === tab.path;
        return (
          <Link
            key={tab.path}
            to={tab.path}
            aria-current={isActive ? 'page' : undefined}
            className={`${HOME_TAB_SEGMENT_CLASS} ${isActive ? HOME_TAB_ACTIVE_CLASS : HOME_TAB_INACTIVE_CLASS}`}
          >
            <NavIcon
              Icon={tab.Icon}
              colorClass={isActive ? 'text-slate-800' : tab.colorClass}
              size="small"
              animate={true}
            />
            <span className="min-w-0 truncate">{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <nav
      aria-label="Home sections"
      className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/60 pt-safe"
    >
      <div className="w-full px-4 py-3">
        {isAdmin ? (
          <div className="flex items-stretch gap-1.5 sm:gap-2">
            {tabs}
            <NotificationBell variant="segment" />
          </div>
        ) : (
          tabs
        )}
      </div>
    </nav>
  );
}
