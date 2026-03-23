import React, { useState, useEffect, useRef } from 'react';
import { getAdminMenuItems } from '../config/navIcons';
import NavIcon from '../components/NavIcon';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import UserList from '../components/Admin/UserList';
import AvailabilityManager from '../components/Admin/AvailabilityManager';
import SettingsManager from '../components/Admin/SettingsManager';
import UserApprovalPage from './UserApprovalPage';
import LoginStats from '../components/Admin/LoginStats';
import PerformanceImport from '../components/Admin/PerformanceImport';
import RotaPlannerPage from './RotaPlannerPage';
import BrakesManager from '../components/Admin/Brakes/BrakesManager';
import ShunterOfTheMonthManager from '../components/Admin/ShunterOfTheMonthManager';
import TugManager from '../components/Admin/PreCheck/TugManager';
import PreCheckList from '../components/Admin/PreCheck/PreCheckList';
import CheckItemManager from '../components/Admin/PreCheck/CheckItemManager';
import AttendancePage from './AttendancePage';
import InductionGuideManager from '../components/Admin/InductionGuideManager';

export default function AdminPage() {
  // Pobierz tylko user z AuthContext
  const { user } = useAuth(); 
  const [users, setUsers] = useState([]);
  // Stan ładowania dla danych użytkowników
  const [pageLoading, setPageLoading] = useState(true); 
  const [error, setError] = useState(null);
  // Aktywna sekcja - zmiana na sidebar navigation
  const [activeSection, setActiveSection] = useState(() => {
    const savedSection = localStorage.getItem('adminActiveSection');
    // Validate saved section
    const validSections = [
      'dashboard', 'users', 'approvals', 'availability', 
      'rota-planner', 'breaks', 'attendance', 'performance', 'stats', 
      'shunter-month', 'settings', 'tugs', 'prechecks', 'check-items', 'induction-guide'
    ];
    return (savedSection && validSections.includes(savedSection)) ? savedSection : 'dashboard';
  });
  // Sidebar hover state - tylko na desktop, mobile używa mobileSidebarOpen
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const mainContentRef = useRef(null);
  const prevSectionRef = useRef(activeSection);

  // Aktualizuj tytuł strony w top barze + powiadom header (mobile)
  useEffect(() => {
    const titles = {
      'dashboard': 'Dashboard',
      'users': 'Users',
      'approvals': 'Approvals',
      'availability': 'Availability',
      'rota-planner': 'Rota Planner',
      'breaks': 'Breaks',
      'attendance': 'Black list',
      'performance': 'Performance',
      'stats': 'Activity',
      'shunter-month': 'Shunter of the Month',
      'tugs': 'Tug Management',
      'prechecks': 'PreCheck Reports',
      'check-items': 'Check Items',
      'settings': 'Settings',
      'induction-guide': 'Yard induction guide'
    };
    const label = titles[activeSection] || 'Admin Panel';
    const titleElement = document.getElementById('page-title');
    if (titleElement) titleElement.textContent = label;
    window.dispatchEvent(new CustomEvent('adminSectionChange', { detail: { label } }));
  }, [activeSection]);
  
  const [pendingApprovals, setPendingApprovals] = useState(0);

  // Listener dla custom event z top bara - tylko mobile
  useEffect(() => {
    const handleToggleSidebar = () => {
      if (window.innerWidth < 768) {
        setMobileSidebarOpen(true);
      }
      // Na desktop nie potrzebujemy hamburgera - hover działa automatycznie
    };
    
    window.addEventListener('toggleAdminSidebar', handleToggleSidebar);
    
    return () => {
      window.removeEventListener('toggleAdminSidebar', handleToggleSidebar);
    };
  }, []);

  // Check if we need to migrate old rota tab
  useEffect(() => {
    const savedTab = localStorage.getItem('adminActiveTab');
    if (savedTab === 'rota') {
      // Update to use new rota-planner section
      localStorage.setItem('adminActiveSection', 'rota-planner');
      localStorage.removeItem('adminActiveTab');
      setActiveSection('rota-planner');
    }
  }, []);

  // Efekt do zapisywania aktywnej sekcji w localStorage
  useEffect(() => {
    localStorage.setItem('adminActiveSection', activeSection);
  }, [activeSection]);

  // Zapisz scroll Statistics przy wyjściu, przywróć przy wejściu
  useEffect(() => {
    const prev = prevSectionRef.current;
    prevSectionRef.current = activeSection;
    if (prev === 'stats' && activeSection !== 'stats' && mainContentRef.current) {
      try {
        sessionStorage.setItem('admin_stats_scroll', String(mainContentRef.current.scrollTop));
      } catch (_) {}
    }
    if (activeSection === 'stats') {
      const saved = sessionStorage.getItem('admin_stats_scroll');
      if (saved != null && mainContentRef.current) {
        const top = parseInt(saved, 10);
        if (!isNaN(top)) {
          requestAnimationFrame(() => {
            if (mainContentRef.current) mainContentRef.current.scrollTop = top;
          });
        }
      }
    }
  }, [activeSection]);

  // --- Monthly Shunter reminder banner ---
  const [showShunterReminder, setShowShunterReminder] = useState(false);

  useEffect(() => {
    if (pageLoading) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const monthKey = `${year}-${month}`;
    const storageKey = `shunterReminderDismissed-${monthKey}`;
    const dismissed = localStorage.getItem(storageKey) === 'true';

    if (!dismissed) {
      setShowShunterReminder(true);
    }
  }, [pageLoading]);

  const handleDismissShunterReminder = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const monthKey = `${year}-${month}`;
    const storageKey = `shunterReminderDismissed-${monthKey}`;
    localStorage.setItem(storageKey, 'true');
    setShowShunterReminder(false);
  };

  // Pobieranie liczby oczekujących zatwierdzeń
  const fetchPendingApprovals = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('account_status', 'pending_approval');
      
      if (error) throw error;
      setPendingApprovals(data?.length || 0);
    } catch (err) {
      console.error('Error fetching pending approvals:', err);
    }
  };

  // Define fetchUsers function outside useEffect so it can be passed to components
  const fetchUsers = async () => {
    setPageLoading(true);
    try {
      // Prefer RPC – profiles with last_sign_in_at and agency from DB (no email)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_admin_profiles_with_emails');
      if (!rpcError && Array.isArray(rpcData) && rpcData.length >= 0) {
        let usersList = rpcData.map((row) => ({
          ...row,
          performance_score: row.performance_score ?? 50,
          is_active: row.is_active !== false,
          agency_name: row.agency_name ?? null
        }));
        // If RPC does not return role (e.g. migration not applied), fetch from profiles
        const firstRow = usersList[0];
        if (usersList.length > 0 && !Object.prototype.hasOwnProperty.call(firstRow, 'role')) {
          const ids = usersList.map((u) => u.id);
          const { data: roleData } = await supabase.from('profiles').select('id, role').in('id', ids);
          const roleMap = new Map((roleData || []).map((r) => [r.id, r.role]));
          usersList = usersList.map((u) => ({ ...u, role: roleMap.get(u.id) ?? null }));
        }
        setUsers(usersList);
        setPageLoading(false);
        return;
      }
      // Fallback: direct profiles query
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*, agencies(id, name)');

      if (profilesError) throw profilesError;

      if (!Array.isArray(profilesData)) {
        throw new Error('Invalid data format received from profiles table');
      }

      const usersList = profilesData.map((profile) => ({
        ...profile,
        performance_score: profile.performance_score ?? 50,
        is_active: profile.is_active !== false,
        agency_name: profile.agencies?.name ?? null
      }));

      setUsers(usersList);
    } catch (err) {
      console.error('[AdminPage] Error fetching users:', err);
      setError('Error loading users.');
      setUsers([]);
    } finally {
      setPageLoading(false);
    }
  };

  // Efekt do pobierania listy użytkowników przy montowaniu
  useEffect(() => {
    let cancelled = false;
    
    const loadData = async () => {
      if (!cancelled) {
        await fetchUsers();
        await fetchPendingApprovals();
      }
    };
    
    loadData();
    
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Keep user dependency for the fallback email logic

  // --- Renderowanie --- 
  // Pokazuj loader tylko podczas ładowania danych użytkowników
  // ProtectedAdminRoute już obsługuje weryfikację uprawnień
  if (pageLoading) {
    return (
      <div className="min-h-screen bg-offwhite flex animate-pulse">
        {/* Sidebar skeleton */}
        <aside className="w-16 md:w-64 bg-slate-700 border-r border-slate-600 flex-shrink-0">
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="w-8 h-8 bg-slate-600 rounded-lg" />
                <div className="hidden md:block h-4 bg-slate-600 rounded flex-1" />
              </div>
            ))}
          </div>
        </aside>

        {/* Main content skeleton */}
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header skeleton */}
            <div className="h-8 bg-slate-300 rounded w-48 mb-6" />
            
            {/* Stats cards skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl shadow-lg p-6 border-2 border-slate-200">
                  <div className="h-4 bg-slate-300 rounded w-32 mb-4" />
                  <div className="h-10 bg-slate-300 rounded w-20" />
                </div>
              ))}
            </div>

            {/* Content cards skeleton */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-lg p-6 border-2 border-slate-200">
                <div className="h-6 bg-slate-300 rounded w-40 mb-4" />
                <div className="space-y-3">
                  <div className="h-4 bg-slate-200 rounded w-full" />
                  <div className="h-4 bg-slate-200 rounded w-5/6" />
                  <div className="h-4 bg-slate-200 rounded w-4/6" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }
  
  // Show error if it occurred during data fetching
  if (error) {
    return (
      <div className="min-h-screen p-4 bg-offwhite">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl p-6 border border-gray-200">
          <div className="text-red-600 text-center">
            <h2 className="text-2xl font-bold mb-4 text-charcoal">Error Loading Data</h2>
            <p>{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  const menuItems = getAdminMenuItems(pendingApprovals);

  // Dashboard Component - pokazywany jako główny widok
  const DashboardView = () => (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-charcoal mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {menuItems.filter(item => item.id !== 'dashboard').map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/60 p-5 hover:shadow-xl hover:border-slate-300/80 transition-all duration-300 text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl group-hover:from-blue-50 group-hover:to-indigo-50 transition-colors duration-300 flex items-center justify-center group-hover:scale-105">
                  <NavIcon Icon={item.Icon} colorClass={item.colorClass} size="large" animate={true} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-charcoal group-hover:text-charcoal">
                    {item.label}
                    {item.badge > 0 && (
                      <span className="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-orange-600 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </h3>
                </div>
                <svg className="w-5 h-5 text-slate-400 group-hover:text-charcoal group-hover:translate-x-1 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // Renderowanie zawartości w zależności od aktywnej sekcji
  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardView />;
      case 'users':
        return <UserList users={users} onRefresh={fetchUsers} />;
      case 'approvals':
        return <UserApprovalPage />;
      case 'availability':
        return <AvailabilityManager />;
      case 'rota-planner':
        return <RotaPlannerPage />;
      case 'breaks':
        return <BrakesManager />;
      case 'attendance':
        return <AttendancePage users={users} />;
      case 'tugs':
        return <TugManager />;
      case 'prechecks':
        return <PreCheckList />;
      case 'check-items':
        return <CheckItemManager />;
      case 'shunter-month':
        return <ShunterOfTheMonthManager users={users} />;
      case 'settings':
        return <SettingsManager />;
      case 'performance':
        return <PerformanceImport />;
      case 'stats':
        return <LoginStats />;
      case 'induction-guide':
        return <InductionGuideManager />;
      default:
        return <DashboardView />;
    }
  };

  // Główna zawartość strony admina - uprawnienia już sprawdzone przez ProtectedAdminRoute
  return (
    <div className="min-h-screen bg-offwhite">
      {/* Mobile Overlay - tylko na mobile */}
      {mobileSidebarOpen && (
        <div 
          className="fixed bg-black bg-opacity-50 z-40 md:hidden"
          style={{ top: '64px', bottom: 0, left: 0, right: 0 }}
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar - zawsze widoczny na desktop, rozwija się po najechaniu; na mobile wysuwa się do końca z napisami */}
      <aside 
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
        className={`
          ${(sidebarHovered || mobileSidebarOpen) ? 'w-72' : 'w-20'}
          bg-white border-r border-gray-200 flex flex-col shadow-lg
          fixed left-0 z-50
          ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          transition-all duration-200 ease-out
        `}
        style={{ top: '64px', bottom: 0 }}
      >
        {/* Sidebar Menu */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {menuItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveSection(item.id);
                  setMobileSidebarOpen(false);
                }}
                className={`relative w-full flex items-center py-2 mb-0.5 rounded-lg ${
                  isActive
                    ? 'bg-charcoal text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100'
                } ${(sidebarHovered || mobileSidebarOpen) ? 'px-3' : 'justify-center px-2'}`}
                title={!(sidebarHovered || mobileSidebarOpen) ? item.label : ''}
              >
                <div className="w-8 flex items-center justify-center flex-shrink-0">
                  <NavIcon
                    Icon={item.Icon}
                    colorClass={isActive ? 'text-white' : item.colorClass}
                    animate={true}
                  />
                </div>
                {(sidebarHovered || mobileSidebarOpen) && (
                  <div className="flex-1 text-left font-medium flex items-center gap-2 whitespace-nowrap opacity-0 animate-fadeIn ml-3" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
                    {item.label}
                    {item.badge > 0 && (
                      <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-orange-600 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
                {!(sidebarHovered || mobileSidebarOpen) && item.badge > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-orange-600 rounded-full border border-white"></span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        {(sidebarHovered || mobileSidebarOpen) && (
          <div className="p-4 border-t border-gray-200 opacity-0 animate-fadeIn" style={{ animationDelay: '150ms', animationFillMode: 'forwards' }}>
            <div className="text-xs text-gray-500 text-center whitespace-nowrap">
              Logged in as Admin
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area - zawsze z marginesem 80px (dla zwiniętego sidebara) */}
      <main ref={mainContentRef} className="min-h-screen overflow-y-auto md:ml-20">
        <div className="p-4 md:p-6 lg:p-8">
          {showShunterReminder && (
            <div className="mb-4 bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-charcoal">
                  Time to pick your Shunter of the Month
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  One Day and one Night shunter for the whole company. Open the &quot;Shunter of the Month&quot; section to choose winners.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSection('shunter-month')}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-black text-white hover:bg-gray-900"
                >
                  Go to Shunter of the Month
                </button>
                <label className="inline-flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-gray-300 text-black focus:ring-black"
                    onChange={handleDismissShunterReminder}
                  />
                  <span>Don&apos;t remind me again this month</span>
                </label>
              </div>
            </div>
          )}
          {renderContent()}
        </div>
      </main>
    </div>
  );
} 