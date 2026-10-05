import React, { Suspense, useLayoutEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import HomeTabsBar from './HomeTabsBar';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const PreCheckReminder = lazyWithRetry(() => import('../PreCheck/PreCheckReminder'));

/** Mobile Home section: top tabs, time-critical PreCheck alert, then the active tab. */
export default function HomeMobileLayout() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);

  return (
    <>
      <HomeTabsBar />
      <Suspense fallback={null}>
        <PreCheckReminder />
      </Suspense>
      <Outlet />
    </>
  );
}
