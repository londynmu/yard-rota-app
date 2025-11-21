import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useLocation, Routes, Route, Link, Navigate } from 'react-router-dom';
import CalendarPage from '../pages/CalendarPage';
import ProfilePage from '../pages/ProfilePage';
import AdminPage from '../pages/AdminPage';
import RotaPlannerPage from '../pages/RotaPlannerPage';
import WeeklyRotaPage from '../pages/WeeklyRotaPage';
import UserApprovalPage from '../pages/UserApprovalPage';
import BrakesPage from '../pages/BrakesPage';
import PerformanceLeaderboard from '../pages/PerformanceLeaderboard';
import NotificationBell from './NotificationBell';
import { useNotifications } from '../lib/NotificationContext';
import { supabase } from '../lib/supabaseClient';

export default function HomePage() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useNotifications();
  const location = useLocation();
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileName, setProfileName] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const dropdownRef = useRef(null);
  const avatarButtonRef = useRef(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  const fetchProfileAndCheckAdmin = useCallback(async () => {
    if (!user) {
      setProfileLoading(false);
      return;
    }
    
    setProfileLoading(true);
    try {
      console.log('[HomePage] Fetching profile for avatar/name data...');
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url')
        .eq('id', user.id)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('[HomePage] Error fetching profile:', error);
        return;
      }
      
      console.log('[HomePage] Fetched profile data:', data);
      if (data) {
        setAvatarUrl(data.avatar_url || '');
        
        if (data.first_name || data.last_name) {
          setProfileName(`${data.first_name || ''} ${data.last_name || ''}`);
        }
      } else {
        console.log('[HomePage] Profile not found.');
        setProfileName('');
        setAvatarUrl('');
      }
    } catch (error) {
      console.error('[HomePage] Error fetching profile:', error);
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchProfileAndCheckAdmin();
    } else {
      setProfileLoading(false);
      setAvatarUrl('');
      setProfileName('');
    }
  }, [user, fetchProfileAndCheckAdmin]);

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
      setDropdownPosition({
        top: rect.bottom + window.scrollY,
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

  const toggleDropdown = () => {
    setShowDropdown(prev => !prev);
  };

  const getPageTitle = () => {
    const path = location.pathname;
    
    if (path === '/' || path === '/calendar') return 'Main Page';
    if (path === '/my-rota') return 'My Rota';
    if (path === '/admin') return 'Admin Dashboard';
    if (path === '/profile') return 'Your Profile';
    if (path === '/rota-planner') return 'Rota Planner';
    if (path === '/brakes') return 'Breaks';
    if (path === '/performance') return 'Performance';
    
    return 'My Rota';
  };

  if (location.pathname === '/' || location.pathname === '') {
    return <Navigate to="/calendar" replace />;
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
        className="bg-white rounded-lg py-1 border border-gray-200 shadow-lg"
      >
        {profileName && (
          <div className="px-4 py-3 text-sm border-b border-gray-200">
            <p className="font-medium text-charcoal">{profileName}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
        )}
        
        <Link
          to="/profile"
          onClick={() => setShowDropdown(false)}
          className="block w-full text-left px-4 py-2 text-sm text-charcoal hover:bg-gray-100"
        >
          Profile
        </Link>
        
        <button
          onClick={handleSignOut}
          className="block w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50"
        >
          Log out
        </button>
      </div>
    );
  };

  if (profileLoading) {
    // Return completely empty loading state with just background
    return (
      <div className="min-h-screen bg-offwhite">
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-offwhite flex flex-col">
      {/* Hide header on mobile for My Rota, Breaks, and Calendar pages - bottom nav provides navigation */}
      {(() => {
        const path = location.pathname;
        const hideHeaderOnMobile = 
          path === '/my-rota' || 
          path === '/brakes' || 
          path === '/calendar' ||
          path === '/performance';
        const visibilityClass = hideHeaderOnMobile ? 'hidden md:block' : '';

        return (
          <header className={`bg-white shadow-sm border-b border-gray-200 relative z-10 ${visibilityClass}`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
              <h1 className="text-2xl font-bold text-charcoal">{getPageTitle()}</h1>
              
              <div className="flex items-center space-x-4">
                <nav className="hidden md:flex space-x-2">
                  <Link
                    to="/calendar"
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      location.pathname === '/calendar' 
                        ? 'bg-black text-white' 
                        : 'text-charcoal hover:bg-gray-100'
                    }`}
                  >
                    Main Page
                  </Link>
                  <Link
                    to="/my-rota"
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      location.pathname === '/my-rota' 
                        ? 'bg-black text-white' 
                        : 'text-charcoal hover:bg-gray-100'
                    }`}
                  >
                    My Rota
                  </Link>
                  <Link
                    to="/performance"
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      location.pathname === '/performance' 
                        ? 'bg-black text-white' 
                        : 'text-charcoal hover:bg-gray-100'
                    }`}
                  >
                    Performance
                  </Link>
                  {isAdmin && (
                    <>
                      <Link
                        to="/brakes"
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                          location.pathname === '/brakes' 
                            ? 'bg-black text-white' 
                            : 'text-charcoal hover:bg-gray-100'
                        }`}
                      >
                        Breaks
                      </Link>
                      <Link
                        to="/admin"
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                          location.pathname === '/admin' 
                            ? 'bg-black text-white' 
                            : 'text-charcoal hover:bg-gray-100'
                        }`}
                      >
                        Admin Panel
                      </Link>
                      <Link
                        to="/rota-planner"
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                          location.pathname === '/rota-planner' 
                            ? 'bg-black text-white' 
                            : 'text-charcoal hover:bg-gray-100'
                        }`}
                      >
                        Rota Planner
                      </Link>
                    </>
                  )}
                </nav>
                
                {isAdmin && <NotificationBell />}
                
                <div className="relative">
                  <button 
                    ref={avatarButtonRef}
                    onClick={toggleDropdown}
                    className="flex items-center focus:outline-none"
                    aria-label="User menu"
                    aria-haspopup="true"
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-gray-300 shadow-sm">
                      {avatarUrl ? (
                        <img 
                          src={avatarUrl} 
                          alt="Profile" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                          <span className="text-charcoal font-medium text-sm">
                            {user?.email?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </header>
        );
      })()}
      
      {renderDropdownMenu()}
      
      <main className="flex-1 relative z-0 mb-16 md:mb-0">
        <Routes>
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/rota-planner" element={<RotaPlannerPage />} />
          <Route path="/profile" element={<ProfilePage supabaseClient={supabase} />} />
          <Route path="/my-rota" element={<WeeklyRotaPage />} />
          <Route path="/performance" element={<PerformanceLeaderboard />} />
          <Route path="/brakes" element={isAdmin ? <BrakesPage /> : <Navigate to="/calendar" replace />} />
          <Route path="/admin/approvals" element={<UserApprovalPage />} />
          <Route path="*" element={<Navigate to="/calendar" replace />} />
        </Routes>
      </main>

      {/* iOS-Style Bottom Navigation - Mobile Only with safe area */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bottom-nav-adaptive border-t shadow-lg pb-safe"
      >
        <div className="flex justify-around items-center px-2 py-2">
          {/* Home */}
          <Link
            to="/calendar"
            className={`flex flex-col items-center justify-center flex-1 py-2 px-1 rounded-lg transition-all bottom-nav-icon ${
              location.pathname === '/calendar' ? 'active' : ''
            }`}
          >
            <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-xs font-medium">Home</span>
          </Link>

          {/* My Rota */}
          <Link
            to="/my-rota"
            className={`flex flex-col items-center justify-center flex-1 py-2 px-1 rounded-lg transition-all bottom-nav-icon ${
              location.pathname === '/my-rota' ? 'active' : ''
            }`}
          >
            <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-medium">My Rota</span>
          </Link>

          {/* Performance */}
          <Link
            to="/performance"
            className={`flex flex-col items-center justify-center flex-1 py-2 px-1 rounded-lg transition-all bottom-nav-icon ${
              location.pathname === '/performance' ? 'active' : ''
            }`}
          >
            <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs font-medium">Stats</span>
          </Link>

          {/* Breaks & Admin (only if admin) */}
          {isAdmin && (
            <>
              <Link
                to="/brakes"
                className={`flex flex-col items-center justify-center flex-1 py-2 px-1 rounded-lg transition-all bottom-nav-icon ${
                  location.pathname === '/brakes' ? 'active' : ''
                }`}
              >
                <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs font-medium">Breaks</span>
              </Link>

              <Link
                to="/admin"
                className={`flex flex-col items-center justify-center flex-1 py-2 px-1 rounded-lg transition-all bottom-nav-icon ${
                  location.pathname === '/admin' || location.pathname === '/rota-planner' ? 'active' : ''
                }`}
              >
                <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-xs font-medium">Admin</span>
              </Link>
            </>
          )}

          {/* Profile */}
          <Link
            to="/profile"
            className={`flex flex-col items-center justify-center flex-1 py-2 px-1 rounded-lg transition-all bottom-nav-icon ${
              location.pathname === '/profile' ? 'active' : ''
            }`}
          >
            <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs font-medium">Profile</span>
          </Link>
        </div>
      </nav>
    </div>
  );
} 