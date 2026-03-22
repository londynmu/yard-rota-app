import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useLocation, Routes, Route, Link, Navigate } from 'react-router-dom';
import { mainNavConfig } from '../config/navIcons';
import NavIcon from './NavIcon';
import CalendarPage from '../pages/CalendarPage';
import ProfilePage from '../pages/ProfilePage';
import NotificationBell from './NotificationBell';
import { useNotifications } from '../lib/NotificationContext';
import { supabase } from '../lib/supabaseClient';
import ShunterOfTheMonthCard from './User/ShunterOfTheMonthCard';
import ProtectedAdminRoute from './Auth/ProtectedAdminRoute';
import ProtectedRoute from './Auth/ProtectedRoute';
import ProtectedVmuRoute from './Auth/ProtectedVmuRoute';
import ProtectedTransportManagerRoute from './Auth/ProtectedTransportManagerRoute';
import PreCheckReminder from './PreCheck/PreCheckReminder';

/**
 * Wrapper for React.lazy that adds retry logic for failed chunk loads
 * This helps handle the case where users have stale JS after a deployment
 * @param {Function} componentImport - The dynamic import function
 * @param {number} retries - Number of retry attempts (default: 2)
 * @param {number} delay - Delay between retries in ms (default: 1000)
 */
const lazyWithRetry = (componentImport, retries = 2, delay = 1000) => {
  return lazy(() => {
    const retryImport = (attemptsLeft) => {
      return componentImport().catch((error) => {
        // Check if this is a chunk loading error
        const errorString = error.toString().toLowerCase();
        const isChunkError = 
          errorString.includes('loading chunk') ||
          errorString.includes('dynamically imported module') ||
          errorString.includes('failed to fetch');
        
        if (attemptsLeft > 0 && isChunkError) {
          console.log(`[lazyWithRetry] Chunk load failed, retrying... (${attemptsLeft} attempts left)`);
          return new Promise((resolve) => {
            setTimeout(() => {
              // Add cache-busting query param to force fresh fetch
              resolve(retryImport(attemptsLeft - 1));
            }, delay);
          });
        }
        
        // If no retries left or not a chunk error, throw
        throw error;
      });
    };
    
    return retryImport(retries);
  });
};

// Lazy load admin and non-essential pages for better initial load performance
// Using lazyWithRetry to handle chunk loading failures after deployments
const AdminPage = lazyWithRetry(() => import('../pages/AdminPage'));
const WeeklyRotaPage = lazyWithRetry(() => import('../pages/WeeklyRotaPage'));
const UserApprovalPage = lazyWithRetry(() => import('../pages/UserApprovalPage'));
const BrakesPage = lazyWithRetry(() => import('../pages/BrakesPage'));
const PerformanceLeaderboard = lazyWithRetry(() => import('../pages/PerformanceLeaderboard'));
const PreCheckPage = lazyWithRetry(() => import('../pages/PreCheckPage'));
const VmuPage = lazyWithRetry(() => import('../pages/VmuPage'));
const TugManager = lazyWithRetry(() => import('../components/Admin/PreCheck/TugManager'));
const PreCheckList = lazyWithRetry(() => import('../components/Admin/PreCheck/PreCheckList'));
const CheckItemManager = lazyWithRetry(() => import('../components/Admin/PreCheck/CheckItemManager'));
const TransportManagerDashboard = lazyWithRetry(() => import('../pages/TransportManagerDashboard'));

/** Desktop top nav links — glass / Figma-aligned */
function topNavLinkClassName(isActive) {
  return [
    'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all border',
    isActive
      ? 'bg-white/90 text-slate-800 border-slate-200/60 shadow-sm'
      : 'text-slate-600 border-transparent hover:bg-white/70 hover:border-slate-200/60 hover:shadow-sm hover:text-slate-800',
  ].join(' ');
}

export default function HomePage() {
  const { user, signOut } = useAuth();
  const { isAdmin, isVmu, isTransportManager } = useNotifications();
  const location = useLocation();
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileName, setProfileName] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const dropdownRef = useRef(null);
  const avatarButtonRef = useRef(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const [currentAdminSectionLabel, setCurrentAdminSectionLabel] = useState('');

  // Listen for admin section title (mobile header)
  useEffect(() => {
    const handle = (e) => setCurrentAdminSectionLabel(e.detail?.label ?? '');
    window.addEventListener('adminSectionChange', handle);
    return () => window.removeEventListener('adminSectionChange', handle);
  }, []);
  useEffect(() => {
    if (location.pathname !== '/admin') setCurrentAdminSectionLabel('');
  }, [location.pathname]);

  // Fetch profile data when user changes
  useEffect(() => {
    if (!user) {
      setProfileLoading(false);
      setAvatarUrl('');
      setProfileName('');
      return;
    }
    
    let cancelled = false;
    setProfileLoading(true);
    
    supabase
      .from('profiles')
      .select('first_name, last_name, avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        
        if (error && error.code !== 'PGRST116') {
          console.error('[HomePage] Error fetching profile:', error);
          setProfileLoading(false);
          return;
        }
        
        if (data) {
          // Reset avatar loaded state for new image
          setAvatarLoaded(false);
          setAvatarUrl(data.avatar_url || '');
          
          if (data.first_name || data.last_name) {
            setProfileName(`${data.first_name || ''} ${data.last_name || ''}`);
          }
        } else {
          setProfileName('');
          setAvatarUrl('');
          setAvatarLoaded(false);
        }
        
        setProfileLoading(false);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[HomePage] Error fetching profile:', error);
          setProfileLoading(false);
        }
      });
    
    return () => {
      cancelled = true;
    };
  }, [user?.id]); // Only depend on user ID to prevent unnecessary re-fetches

  useEffect(() => {
    function handleClickOutside(event) {
      if (showDropdown && 
          dropdownRef.current && 
          !dropdownRef.current.contains(event.target) &&
          avatarButtonRef.current &&
          !avatarButtonRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  useEffect(() => {
    if (showDropdown && avatarButtonRef.current) {
      const rect = avatarButtonRef.current.getBoundingClientRect();
      // position:fixed uses viewport coordinates - do NOT add scrollY
      setDropdownPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right
      });
    }
  }, [showDropdown]);

  const handleSignOut = async () => {
    try {
      setShowDropdown(false);
      
      await signOut();
      
    } catch (e) {
      console.error('Error during sign out:', e);
      setShowDropdown(false);
    }
  };

  const toggleDropdown = useCallback(() => {
    setShowDropdown(prev => !prev);
  }, []);

  // Memoize page title to avoid recalculation on every render
  const pageTitle = useMemo(() => {
    const path = location.pathname;
    
    if (path === '/' || path === '/calendar') return 'Main Page';
    if (path === '/my-rota') return 'My Rota';
    if (path === '/admin') return 'Admin Dashboard';
    if (path === '/profile') return 'Your Profile';
    if (path === '/brakes') return 'Breaks';
    if (path === '/performance') return 'Performance';
    if (path.startsWith('/precheck')) return 'Tug PreCheck';
    if (path === '/vmu') return 'VMU';
    if (path === '/vmu/tugs') return 'Tugs';
    if (path === '/vmu/prechecks') return 'PreChecks';
    if (path === '/vmu/check-items') return 'Check Items';
    if (path === '/transport-dashboard') return 'Dashboard';
    
    return 'My Rota';
  }, [location.pathname]);

  const topNavLinks = useMemo(() => {
    if (isTransportManager && !isAdmin) return mainNavConfig.filter((n) => n.path === '/transport-dashboard');
    if (isVmu && !isAdmin) return mainNavConfig.filter((n) => n.path === '/vmu' || n.path === '/vmu/prechecks');
    if (!isAdmin) return mainNavConfig.filter((n) => ['/calendar', '/my-rota', '/performance', '/precheck'].includes(n.path));
    return mainNavConfig.filter((n) => ['/calendar', '/my-rota', '/performance', '/precheck', '/vmu', '/admin'].includes(n.path));
  }, [isAdmin, isVmu, isTransportManager]);

  const bottomNavLinks = useMemo(() => {
    if (isTransportManager && !isAdmin) return mainNavConfig.filter((n) => n.path === '/transport-dashboard');
    if (isVmu && !isAdmin) return mainNavConfig.filter((n) => n.path === '/vmu' || n.path === '/vmu/prechecks');
    const base = mainNavConfig.filter((n) => ['/calendar', '/my-rota', '/performance', '/precheck'].includes(n.path));
    if (isAdmin) return [...base, mainNavConfig.find((n) => n.path === '/admin')];
    return [...base, mainNavConfig.find((n) => n.path === '/profile')];
  }, [isAdmin, isVmu, isTransportManager]);

  if (location.pathname === '/' || location.pathname === '') {
    return <Navigate to={isTransportManager && !isAdmin ? '/transport-dashboard' : isVmu && !isAdmin ? '/vmu' : '/calendar'} replace />;
  }

  const renderDropdownMenu = () => {
    if (!showDropdown) return null;
    
    return (
      <div 
        id="user-dropdown-portal"
        ref={dropdownRef}
        style={{
          position: 'fixed',
          top: `${dropdownPosition.top}px`,
          right: `${dropdownPosition.right}px`,
          width: '12rem',
          zIndex: 99999,
        }}
        className="rounded-2xl py-1 border border-slate-200/60 shadow-xl bg-white/95 backdrop-blur-md"
      >
        {profileName && (
          <div className="px-4 py-3 text-sm border-b border-slate-200/60">
            <p className="font-medium text-charcoal">{profileName}</p>
            <p className="text-xs text-rota-text-muted-light truncate">{user?.email}</p>
          </div>
        )}

        <Link
          to="/profile"
          onClick={() => setShowDropdown(false)}
          className="block w-full text-left px-4 py-2 text-sm text-charcoal hover:bg-slate-50/90"
        >
          Profile
        </Link>
        
        <button
          onClick={handleSignOut}
          className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50/90"
        >
          Log out
        </button>
      </div>
    );
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rota-page-bg-from via-rota-page-bg-via to-rota-page-bg-to" />
    );
  }

  const path = location.pathname;
  const hideHeaderOnMobile =
    path === '/my-rota' || path === '/brakes' || path === '/calendar' ||
    path === '/performance' || path.startsWith('/precheck') || path.startsWith('/vmu') || path === '/transport-dashboard';

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-rota-page-bg-from via-rota-page-bg-via to-rota-page-bg-to">
      {/* Top bar - always visible */}
      {(() => {
        const path = location.pathname;
        const hideHeaderOnMobile = 
          path === '/my-rota' || 
          path === '/brakes' || 
          path === '/calendar' ||
          path === '/performance' ||
          path.startsWith('/precheck') ||
          path.startsWith('/vmu') ||
          path === '/transport-dashboard';
        const isAdminPage = path === '/admin';
        const isProfilePage = path === '/profile';
        const isTransportDashboardPage = path === '/transport-dashboard';
        const hasStickyHeader = isAdminPage || isProfilePage;
        const hasFilterButtons = path === '/my-rota' || path === '/performance';
        
        const visibilityClass = hideHeaderOnMobile ? 'hidden md:block' : '';
        const borderClass = hasFilterButtons ? 'border-b border-slate-200/60 md:border-b-0' : 'border-b border-slate-200/60';

        return (
          <header className={`${borderClass} bg-white/80 backdrop-blur-md pt-safe ${hasStickyHeader ? 'sticky top-0 z-40' : 'relative z-10'} ${visibilityClass}`}>
            <div className={isAdmin ? 'w-full px-4 py-3 sm:px-6 lg:px-8 flex justify-between items-center' : isVmu || isTransportManager ? 'max-w-4xl mx-auto px-4 py-3 flex items-center gap-4' : 'w-full px-4 py-3 sm:px-6 lg:px-8 flex justify-between items-center'}>
              {isVmu && !isAdmin ? (
                <>
                  {isProfilePage && <span className="md:hidden font-semibold text-slate-800">Profile</span>}
                  <nav className="hidden md:flex space-x-2 flex-shrink-0">
                    {topNavLinks.map((nav) => (
                      <Link
                        key={nav.path}
                        to={nav.path}
                        className={topNavLinkClassName(location.pathname === nav.path)}
                      >
                        <NavIcon Icon={nav.Icon} colorClass={location.pathname === nav.path ? 'text-slate-800' : nav.colorClass} size="small" animate={true} />
                        {nav.label}
                      </Link>
                    ))}
                  </nav>
                  <div className="flex-1" aria-hidden="true" />
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <div className="relative">
                      <button
                        ref={avatarButtonRef}
                        onClick={toggleDropdown}
                        className="flex items-center focus:outline-none"
                        aria-label="User menu"
                        aria-haspopup="true"
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-300 shadow-sm bg-slate-200 flex-shrink-0">
                          {avatarUrl && (
                            <img
                              src={avatarUrl}
                              alt="Profile"
                              className={`w-full h-full object-cover transition-opacity duration-200 ${avatarLoaded ? 'opacity-100' : 'opacity-0'}`}
                              onLoad={() => setAvatarLoaded(true)}
                            />
                          )}
                          {(!avatarUrl || !avatarLoaded) && (
                            <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                              <span className="text-slate-700 font-medium text-sm">
                                {user?.email?.charAt(0).toUpperCase() || '?'}
                              </span>
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              ) : isTransportManager && !isAdmin ? (
                <>
                  {isProfilePage && <span className="md:hidden font-semibold text-slate-800">Profile</span>}
                  {isTransportDashboardPage && <span className="md:hidden font-semibold text-slate-800">Dashboard</span>}
                  <nav className="hidden md:flex space-x-2 flex-shrink-0">
                    {topNavLinks.map((nav) => (
                      <Link
                        key={nav.path}
                        to={nav.path}
                        className={topNavLinkClassName(location.pathname === nav.path)}
                      >
                        <NavIcon Icon={nav.Icon} colorClass={location.pathname === nav.path ? 'text-slate-800' : nav.colorClass} size="small" animate={true} />
                        {nav.label}
                      </Link>
                    ))}
                  </nav>
                  <div className="flex-1" aria-hidden="true" />
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <div className="relative">
                      <button
                        ref={avatarButtonRef}
                        onClick={toggleDropdown}
                        className="flex items-center focus:outline-none"
                        aria-label="User menu"
                        aria-haspopup="true"
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-300 shadow-sm bg-slate-200 flex-shrink-0">
                          {avatarUrl && (
                            <img
                              src={avatarUrl}
                              alt="Profile"
                              className={`w-full h-full object-cover transition-opacity duration-200 ${avatarLoaded ? 'opacity-100' : 'opacity-0'}`}
                              onLoad={() => setAvatarLoaded(true)}
                            />
                          )}
                          {(!avatarUrl || !avatarLoaded) && (
                            <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                              <span className="text-slate-700 font-medium text-sm">
                                {user?.email?.charAt(0).toUpperCase() || '?'}
                              </span>
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              ) : !isAdmin ? (
                <>
                  {isProfilePage && <span className="md:hidden font-semibold text-slate-800">Profile</span>}
                  {/* Regular user: nav left, avatar right */}
                  <nav className="hidden md:flex space-x-2 flex-shrink-0">
                    {topNavLinks.map((nav) => (
                      <Link
                        key={nav.path}
                        to={nav.path}
                        className={topNavLinkClassName(location.pathname === nav.path)}
                      >
                        <NavIcon Icon={nav.Icon} colorClass={location.pathname === nav.path ? 'text-slate-800' : nav.colorClass} size="small" animate={true} />
                        {nav.label}
                      </Link>
                    ))}
                  </nav>
                  <div className="flex-1" aria-hidden="true" />
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <div className="relative">
                      <button
                        ref={avatarButtonRef}
                        onClick={toggleDropdown}
                        className="flex items-center focus:outline-none"
                        aria-label="User menu"
                        aria-haspopup="true"
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-300 shadow-sm bg-slate-200 flex-shrink-0">
                          {avatarUrl && (
                            <img
                              src={avatarUrl}
                              alt="Profile"
                              className={`w-full h-full object-cover transition-opacity duration-200 ${avatarLoaded ? 'opacity-100' : 'opacity-0'}`}
                              onLoad={() => setAvatarLoaded(true)}
                            />
                          )}
                          {(!avatarUrl || !avatarLoaded) && (
                            <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                              <span className="text-slate-700 font-medium text-sm">
                                {user?.email?.charAt(0).toUpperCase() || '?'}
                              </span>
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
              {/* Admin: nav left (hamburger + links), NotificationBell + Avatar right */}
              <div className="flex items-center gap-3 flex-shrink-0 min-w-0">
                {isAdminPage && (
                  <>
                    <button
                      onClick={() => window.dispatchEvent(new Event('toggleAdminSidebar'))}
                      className="md:hidden p-2 hover:bg-white/70 rounded-lg transition-colors flex-shrink-0"
                      title="Open menu"
                    >
                      <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                    <span className="md:hidden font-semibold text-slate-800 truncate">
                      {currentAdminSectionLabel || 'Admin'}
                    </span>
                  </>
                )}
                {isProfilePage && !isAdminPage && (
                  <span className="md:hidden font-semibold text-slate-800">Profile</span>
                )}
                <nav className="hidden md:flex space-x-2">
                  {topNavLinks.map((nav) => (
                    <Link
                      key={nav.path}
                      to={nav.path}
                      className={topNavLinkClassName(location.pathname === nav.path)}
                    >
                      <NavIcon Icon={nav.Icon} colorClass={location.pathname === nav.path ? 'text-slate-800' : nav.colorClass} size="small" animate={true} />
                      {nav.label}
                    </Link>
                  ))}
                </nav>
              </div>
              
              <div className="flex items-center space-x-2 flex-shrink-0">
                <NotificationBell />
                <div className="relative">
                  <button 
                    ref={avatarButtonRef}
                    onClick={toggleDropdown}
                    className="flex items-center focus:outline-none"
                    aria-label="User menu"
                    aria-haspopup="true"
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-300 shadow-sm bg-slate-200 flex-shrink-0">
                      {avatarUrl && (
                        <img 
                          src={avatarUrl} 
                          alt="Profile" 
                          className={`w-full h-full object-cover transition-opacity duration-200 ${avatarLoaded ? 'opacity-100' : 'opacity-0'}`}
                          onLoad={() => setAvatarLoaded(true)}
                        />
                      )}
                      {(!avatarUrl || !avatarLoaded) && (
                        <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                          <span className="text-slate-700 font-medium text-sm">
                            {user?.email?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              </div>
                </>
              )}
            </div>
          </header>
        );
      })()}
      
      {renderDropdownMenu()}
      
      <main className={`flex-1 relative z-0 pb-bottom-nav ${hideHeaderOnMobile ? 'pt-safe md:pt-0' : ''}`}>
        <Suspense fallback={<div className="min-h-screen bg-transparent" />}>
          <Routes>
            <Route
              path="/calendar"
              element={
                <React.Suspense fallback={<div className="min-h-screen bg-transparent" />}>
                  <PreCheckReminder />
                  <ShunterOfTheMonthCard />
                  <CalendarPage />
                </React.Suspense>
              }
            />
            <Route 
              path="/admin" 
              element={
                <ProtectedAdminRoute>
                  <AdminPage />
                </ProtectedAdminRoute>
              } 
            />
            <Route 
              path="/admin/approvals" 
              element={
                <ProtectedAdminRoute>
                  <UserApprovalPage />
                </ProtectedAdminRoute>
              } 
            />
            <Route 
              path="/brakes" 
              element={
                <ProtectedRoute>
                  <BrakesPage />
                </ProtectedRoute>
              } 
            />
            <Route path="/profile" element={<ProfilePage supabaseClient={supabase} />} />
            <Route path="/my-rota" element={<WeeklyRotaPage />} />
            <Route
              path="/transport-dashboard"
              element={
                <ProtectedTransportManagerRoute>
                  <TransportManagerDashboard />
                </ProtectedTransportManagerRoute>
              }
            />
            <Route path="/performance" element={<PerformanceLeaderboard />} />
            <Route path="/precheck" element={<PreCheckPage />} />
            <Route path="/precheck/tug/:token" element={<PreCheckPage />} />
            <Route 
              path="/vmu" 
              element={
                <ProtectedVmuRoute>
                  <VmuPage />
                </ProtectedVmuRoute>
              } 
            />
            <Route 
              path="/vmu/tugs" 
              element={
                isAdmin ? (
                  <ProtectedVmuRoute>
                    <div className="min-h-screen flex flex-col max-w-4xl mx-auto px-4 py-6">
                      <div className="flex-1 flex flex-col gap-4">
                        <TugManager />
                      </div>
                    </div>
                  </ProtectedVmuRoute>
                ) : (
                  <Navigate to="/vmu" replace />
                )
              } 
            />
            <Route 
              path="/vmu/prechecks" 
              element={
                <ProtectedVmuRoute>
                  <div className="max-w-4xl mx-auto px-4 py-6"><PreCheckList /></div>
                </ProtectedVmuRoute>
              } 
            />
            <Route 
              path="/vmu/check-items" 
              element={
                isAdmin ? (
                  <ProtectedVmuRoute>
                    <div className="max-w-4xl mx-auto px-4 py-6"><CheckItemManager /></div>
                  </ProtectedVmuRoute>
                ) : (
                  <Navigate to="/vmu" replace />
                )
              } 
            />
            <Route path="*" element={<Navigate to={isTransportManager && !isAdmin ? '/transport-dashboard' : isVmu && !isAdmin ? '/vmu' : '/calendar'} replace />} />
          </Routes>
        </Suspense>
      </main>

      {/* Bottom Navigation - Mobile Only with safe area */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bottom-nav-adaptive border-t border-slate-200/60 shadow-lg pb-safe backdrop-blur-md"
      >
        <div className="flex justify-around items-center px-2 pt-1.5 pb-1">
          {isVmu && !isAdmin ? (
            bottomNavLinks.map((nav) => (
              <Link
                key={nav.path}
                to={nav.path}
                className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-lg transition-all bottom-nav-icon ${
                  location.pathname === nav.path ? 'active' : ''
                }`}
              >
                <NavIcon Icon={nav.Icon} colorClass={nav.colorClass} size="small" animate={true} />
                <span className="text-[10px] font-medium mt-0.5">{nav.shortLabel}</span>
              </Link>
            ))
          ) : (
            <>
              {bottomNavLinks.map((nav) => {
                const isActive = nav.path === '/precheck' ? location.pathname.startsWith('/precheck') : location.pathname === nav.path;
                return (
                  <Link
                    key={nav.path}
                    to={nav.path}
                    className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-lg transition-all bottom-nav-icon ${
                      isActive ? 'active' : ''
                    }`}
                  >
                    <NavIcon Icon={nav.Icon} colorClass={nav.colorClass} size="small" animate={true} />
                    <span className="text-[10px] font-medium mt-0.5">{nav.shortLabel}</span>
                  </Link>
                );
              })}
            </>
          )}
        </div>
      </nav>
    </div>
  );
} 