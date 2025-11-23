import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';

// Generate a session ID that persists for the browser session
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('page_tracking_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('page_tracking_session_id', sessionId);
  }
  return sessionId;
};

// Map routes to readable titles
const getPageTitle = (pathname) => {
  const titleMap = {
    '/': 'Main Page',
    '/calendar': 'Calendar',
    '/my-rota': 'My Rota',
    '/admin': 'Admin Dashboard',
    '/profile': 'Profile',
    '/brakes': 'Breaks',
    '/performance': 'Performance Leaderboard',
    '/admin/approvals': 'User Approvals'
  };
  return titleMap[pathname] || pathname;
};

/**
 * Hook to automatically track page visits
 * Usage: Add usePageTracking() at the top level of your app
 */
export const usePageTracking = () => {
  const location = useLocation();
  const { user } = useAuth();
  const lastTrackedPath = useRef(null);

  useEffect(() => {
    // Only track if user is logged in
    if (!user) return;

    // Don't track the same page twice in a row
    if (lastTrackedPath.current === location.pathname) return;

    const trackPageVisit = async () => {
      try {
        const sessionId = getSessionId();
        const pageTitle = getPageTitle(location.pathname);

        // Insert page visit record
        const { error } = await supabase
          .from('page_visits')
          .insert({
            user_id: user.id,
            page_path: location.pathname,
            page_title: pageTitle,
            session_id: sessionId,
            visited_at: new Date().toISOString()
          });

        if (error) {
          console.warn('Error tracking page visit:', error);
        } else {
          console.log(`Tracked visit to: ${pageTitle} (${location.pathname})`);
          lastTrackedPath.current = location.pathname;
        }
      } catch (err) {
        console.warn('Failed to track page visit:', err);
      }
    };

    // Small delay to avoid tracking too many rapid navigation changes
    const timeoutId = setTimeout(trackPageVisit, 500);

    return () => clearTimeout(timeoutId);
  }, [location.pathname, user]);
};

export default usePageTracking;


