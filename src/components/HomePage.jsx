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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
      setMobileMenuOpen(false);
      
      await signOut();
      
    } catch (e) {
      console.error('Error during sign out:', e);
      setShowDropdown(false);
      setMobileMenuOpen(false);
    }
  };

  const toggleDropdown = () => {
    setShowDropdown(prev => !prev);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(prev => !prev);
  };

  const getPageTitle = () => {
    const path = location.pathname;
    
    if (path === '/' || path === '/calendar') return 'Main Page';
    if (path === '/my-rota') return 'My Rota';
    if (path === '/admin') return 'Admin Dashboard';
    if (path === '/profile') return 'Your Profile';
    if (path === '/rota-planner') return 'Rota Planner';
    if (path === '/brakes') return 'Breaks';
    
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
      <header className="bg-white shadow-sm border-b border-gray-200 relative z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
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
                to="/brakes"
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  location.pathname === '/brakes' 
                    ? 'bg-black text-white' 
                    : 'text-charcoal hover:bg-gray-100'
                }`}
              >
                Breaks
              </Link>
              {isAdmin && (
                <>
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
            
            <button 
              className="md:hidden p-2 rounded-lg text-charcoal hover:bg-gray-100 focus:outline-none"
              onClick={toggleMobileMenu}
              aria-label="Menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
            
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
        
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-gray-200">
            <div className="px-2 pt-2 pb-3 space-y-1">
              <Link
                to="/calendar"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-lg ${
                  location.pathname === '/calendar' 
                    ? 'bg-black text-white' 
                    : 'text-charcoal hover:bg-gray-100'
                }`}
              >
                Main Page
              </Link>
              <Link
                to="/my-rota"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-lg ${
                  location.pathname === '/my-rota' 
                    ? 'bg-black text-white' 
                    : 'text-charcoal hover:bg-gray-100'
                }`}
              >
                My Rota
              </Link>
              <Link
                to="/brakes"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-lg ${
                  location.pathname === '/brakes' 
                    ? 'bg-black text-white' 
                    : 'text-charcoal hover:bg-gray-100'
                }`}
              >
                Breaks
              </Link>
              {isAdmin && (
                <>
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-3 py-2 rounded-lg ${
                      location.pathname === '/admin' 
                        ? 'bg-black text-white' 
                        : 'text-charcoal hover:bg-gray-100'
                    }`}
                  >
                    Admin Panel
                  </Link>
                  <Link
                    to="/rota-planner"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-3 py-2 rounded-lg ${
                      location.pathname === '/rota-planner' 
                        ? 'bg-black text-white' 
                        : 'text-charcoal hover:bg-gray-100'
                    }`}
                  >
                    Rota Planner
                  </Link>
                </>
              )}
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-lg ${
                  location.pathname === '/profile' 
                    ? 'bg-black text-white' 
                    : 'text-charcoal hover:bg-gray-100'
                }`}
              >
                Profile
              </Link>
              <button
                onClick={handleSignOut}
                className="block w-full text-left px-3 py-2 rounded-lg text-base font-medium text-red-500 hover:bg-red-50"
              >
                Log out
              </button>
            </div>
          </div>
        )}
      </header>
      
      {renderDropdownMenu()}
      
      <main className="flex-1 relative z-0">
        <Routes>
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/rota-planner" element={<RotaPlannerPage />} />
          <Route path="/profile" element={<ProfilePage supabaseClient={supabase} />} />
          <Route path="/my-rota" element={<WeeklyRotaPage />} />
          <Route path="/brakes" element={<BrakesPage />} />
          <Route path="/admin/approvals" element={<UserApprovalPage />} />
          <Route path="*" element={<Navigate to="/calendar" replace />} />
        </Routes>
      </main>
    </div>
  );
} 