import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useLocation, Routes, Route, Link, Navigate } from 'react-router-dom';
import CalendarPage from '../pages/CalendarPage';
import ProfilePage from '../pages/ProfilePage';
import TeamView from '../pages/TeamView';
import AdminPage from '../pages/AdminPage';
import RotaPlannerPage from '../pages/RotaPlannerPage';
import WeeklyRotaPage from '../pages/WeeklyRotaPage';
import { supabase } from '../lib/supabaseClient';

export default function HomePage() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileName, setProfileName] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const dropdownRef = useRef(null);
  const avatarButtonRef = useRef(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  const fetchProfileAndCheckAdmin = useCallback(async () => {
    if (!user) {
      setProfileLoading(false);
      setIsAdmin(false);
      return;
    }
    
    setProfileLoading(true);
    try {
      console.log('[HomePage] Fetching profile for nav/admin check...');
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url, role')
        .eq('id', user.id)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('[HomePage] Error fetching profile:', error);
        setIsAdmin(false);
        return;
      }
      
      console.log('[HomePage] Fetched profile data:', data);
      if (data) {
        setAvatarUrl(data.avatar_url || '');
        
        if (data.first_name || data.last_name) {
          setProfileName(`${data.first_name || ''} ${data.last_name || ''}`);
        }
        
        if (data.role === 'admin') {
          console.log('[HomePage] Admin role confirmed from profile.');
          setIsAdmin(true);
        } else {
          console.log('[HomePage] User is not admin. Role:', data.role);
          setIsAdmin(false);
        }
      } else {
        console.log('[HomePage] Profile not found.');
        setIsAdmin(false);
        setProfileName('');
        setAvatarUrl('');
      }
    } catch (error) {
      console.error('[HomePage] Error fetching profile/checking admin:', error);
      setIsAdmin(false);
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchProfileAndCheckAdmin();
    } else {
      setIsAdmin(false);
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
    if (path === '/team') return 'Team View';
    if (path === '/my-rota') return 'My Rota';
    if (path === '/admin') return 'Admin Dashboard';
    if (path === '/profile') return 'Your Profile';
    if (path === '/rota-planner') return 'Rota Planner';
    
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
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        }}
        className="bg-black/60 backdrop-blur-xl rounded-lg py-1 border border-white/30 shadow-lg"
      >
        {profileName && (
          <div className="px-4 py-3 text-sm text-white border-b border-white/20 bg-gradient-to-r from-blue-900/50 to-purple-900/50 backdrop-blur-xl">
            <p className="font-medium">{profileName}</p>
            <p className="text-xs text-white/80 truncate">{user?.email}</p>
          </div>
        )}
        
        <Link
          to="/profile"
          onClick={() => setShowDropdown(false)}
          className="block w-full text-left px-4 py-2 text-sm text-white"
        >
          Profile
        </Link>
        
        <button
          onClick={handleSignOut}
          className="block w-full text-left px-4 py-2 text-sm text-red-300"
        >
          Log out
        </button>
      </div>
    );
  };

  if (profileLoading) {
    // Return completely empty loading state with just background
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-blue-900 to-green-500">
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-blue-900 to-green-500 flex flex-col">
      <header className="backdrop-blur-xl bg-black/60 shadow-lg border-b border-white/30 relative z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">{getPageTitle()}</h1>
          
          <div className="flex items-center space-x-4">
            <nav className="hidden md:flex space-x-2">
              <Link
                to="/calendar"
                className={`px-4 py-2 text-sm font-medium ${
                  location.pathname === '/calendar' 
                    ? 'text-white font-bold' 
                    : 'text-white/80'
                }`}
              >
                Main Page
              </Link>
              <Link
                to="/team"
                className={`px-4 py-2 text-sm font-medium ${
                  location.pathname === '/team' 
                    ? 'text-white font-bold' 
                    : 'text-white/80'
                }`}
              >
                Team View
              </Link>
              <Link
                to="/my-rota"
                className={`px-4 py-2 text-sm font-medium ${
                  location.pathname === '/my-rota' 
                    ? 'text-white font-bold' 
                    : 'text-white/80'
                }`}
              >
                My Rota
              </Link>
              {isAdmin && (
                <>
                  <Link
                    to="/admin"
                    className={`px-4 py-2 text-sm font-medium ${
                      location.pathname === '/admin' 
                        ? 'text-white font-bold' 
                        : 'text-white/80'
                    }`}
                  >
                    Admin Panel
                  </Link>
                  <Link
                    to="/rota-planner"
                    className={`px-4 py-2 text-sm font-medium ${
                      location.pathname === '/rota-planner' 
                        ? 'text-white font-bold' 
                        : 'text-white/80'
                    }`}
                  >
                    Rota Planner
                  </Link>
                </>
              )}
            </nav>
            
            <button 
              className="md:hidden p-2 rounded-lg text-white focus:outline-none"
              onClick={toggleMobileMenu}
              aria-label="Menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            <div className="relative">
              <button 
                ref={avatarButtonRef}
                onClick={toggleDropdown}
                className="flex items-center focus:outline-none"
                aria-label="User menu"
                aria-haspopup="true"
              >
                <div className="w-10 h-10 rounded-full overflow-hidden border border-white/30 shadow-md">
                  {avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt="Profile" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <span className="text-white font-medium text-sm">
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
          <div className="md:hidden backdrop-blur-xl bg-black/60 border-t border-white/30 shadow-lg">
            <div className="px-2 pt-2 pb-3 space-y-1">
              <Link
                to="/calendar"
                onClick={() => setMobileMenuOpen(false)}
                className={`block w-full text-left px-3 py-2 text-base font-medium ${
                  location.pathname === '/calendar' 
                    ? 'text-white font-bold' 
                    : 'text-white/80'
                }`}
              >
                Main Page
              </Link>
              <Link
                to="/team"
                onClick={() => setMobileMenuOpen(false)}
                className={`block w-full text-left px-3 py-2 text-base font-medium ${
                  location.pathname === '/team' 
                    ? 'text-white font-bold' 
                    : 'text-white/80'
                }`}
              >
                Team View
              </Link>
              <Link
                to="/my-rota"
                onClick={() => setMobileMenuOpen(false)}
                className={`block w-full text-left px-3 py-2 text-base font-medium ${
                  location.pathname === '/my-rota' 
                    ? 'text-white font-bold' 
                    : 'text-white/80'
                }`}
              >
                My Rota
              </Link>
              {isAdmin && (
                <>
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block w-full text-left px-3 py-2 text-base font-medium ${
                      location.pathname === '/admin' 
                        ? 'text-white font-bold' 
                        : 'text-white/80'
                    }`}
                  >
                    Admin Panel
                  </Link>
                  <Link
                    to="/rota-planner"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block w-full text-left px-3 py-2 text-base font-medium ${
                      location.pathname === '/rota-planner' 
                        ? 'text-white font-bold' 
                        : 'text-white/80'
                    }`}
                  >
                    Rota Planner
                  </Link>
                </>
              )}
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className={`block w-full text-left px-3 py-2 text-base font-medium ${
                  location.pathname === '/profile' 
                    ? 'text-white font-bold' 
                    : 'text-white/80'
                }`}
              >
                Profile
              </Link>
              <button
                onClick={handleSignOut}
                className="block w-full text-left px-3 py-2 rounded-lg text-base font-medium text-red-300"
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
          <Route path="/team" element={<TeamView />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/rota-planner" element={<RotaPlannerPage />} />
          <Route path="/profile" element={<ProfilePage supabaseClient={supabase} />} />
          <Route path="/my-rota" element={<WeeklyRotaPage />} />
          <Route path="*" element={<Navigate to="/calendar" replace />} />
        </Routes>
      </main>
    </div>
  );
} 