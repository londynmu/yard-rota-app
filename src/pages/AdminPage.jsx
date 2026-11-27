import React, { useState, useEffect, useRef, Suspense } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import UserList from '../components/Admin/UserList';
import AvailabilityManager from '../components/Admin/AvailabilityManager';
import SettingsManager from '../components/Admin/SettingsManager';
import UserApprovalPage from './UserApprovalPage';
import LoginStats from '../components/Admin/LoginStats';
import PerformanceImport from '../components/Admin/PerformanceImport';
import RotaPlannerPage from './RotaPlannerPage';
import ShunterOfTheMonthManager from '../components/Admin/ShunterOfTheMonthManager';
import TugManager from '../components/Admin/PreCheck/TugManager';
import PreCheckList from '../components/Admin/PreCheck/PreCheckList';
import CheckItemManager from '../components/Admin/PreCheck/CheckItemManager';
import AttendancePage from './AttendancePage';
import InductionGuideManager from '../components/Admin/InductionGuideManager';
import AdminDashboard from '../components/Admin/AdminDashboard';
import { safeLocalStorage, safeSessionStorage } from '../utils/safeStorage';
import { lockPageScroll } from '../utils/lockPageScroll';
import { lazyWithRetry } from '../utils/lazyWithRetry';

const BrakesManager = lazyWithRetry(() => import('../components/Admin/Brakes/BrakesManager'));

function AdminSectionFallback() {
  return (
    <div className="space-y-4 animate-pulse motion-reduce:animate-none" aria-busy="true" aria-label="Loading section">
      <div className="h-10 w-48 rounded-lg bg-slate-200" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="min-h-[140px] rounded-xl border-2 border-slate-200 bg-white p-4 shadow-md">
            <div className="mb-3 h-4 w-24 rounded bg-slate-300" />
            <div className="mb-2 h-6 w-32 rounded bg-slate-300" />
            <div className="h-4 w-full rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminPage() {
  // Pobierz tylko user z AuthContext
  const { user } = useAuth(); 
  const [users, setUsers] = useState([]);
  // Stan ładowania dla danych użytkowników
  const [pageLoading, setPageLoading] = useState(true); 
  const [error, setError] = useState(null);
  // Aktywna sekcja - zmiana na sidebar navigation
  const [activeSection, setActiveSection] = useState(() => {
    const savedSection = safeLocalStorage.getItem('adminActiveSection');
    // Validate saved section
    const validSections = [
      'dashboard', 'users', 'approvals', 'availability', 
      'rota-planner', 'breaks', 'attendance', 'performance', 'stats', 
      'shunter-month', 'settings', 'tugs', 'prechecks', 'check-items', 'induction-guide'
    ];
    return (savedSection && validSections.includes(savedSection)) ? savedSection : 'dashboard';
  });
  // Sidebar hover state - tylko na desktop, mobile używa mobileSidebarOpen
  const [settingsTab, setSettingsTab] = useState(() => (
    safeLocalStorage.getItem('adminSettingsTab') || 'locations'
  ));
  const mainContentRef = useRef(null);
  const prevSectionRef = useRef(activeSection);
  // Deep-link from Black list → Users Violations tab
  const [usersFocus, setUsersFocus] = useState(null);

  // Aktualizuj tytuł strony w top barze + powiadom header (mobile)
  useEffect(() => {
    const titles = {
      'dashboard': 'Dashboard',
      'users': 'Users',
      'approvals': 'Approvals',
      'availability': 'Availability',
      'rota-planner': 'Rota Planner',
      'breaks': 'Breaks',
      'attendance': 'Attendance',
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
  
  useEffect(() => {
    safeLocalStorage.setItem('adminActiveSection', activeSection);
    safeLocalStorage.setItem('adminSettingsTab', settingsTab);
    window.dispatchEvent(new CustomEvent('adminShellState', {
      detail: { section: activeSection, settingsTab },
    }));
  }, [activeSection, settingsTab]);

  useEffect(() => {
    const handle = (event) => {
      const nextSection = event.detail?.section;
      const nextTab = event.detail?.settingsTab;
      if (nextTab) setSettingsTab(nextTab);
      if (nextSection) setActiveSection(nextSection);
    };
    window.addEventListener('adminSidebarNavigate', handle);
    return () => window.removeEventListener('adminSidebarNavigate', handle);
  }, []);

  // Check if we need to migrate old rota tab
  useEffect(() => {
    const savedTab = safeLocalStorage.getItem('adminActiveTab');
    if (savedTab === 'rota') {
      // Update to use new rota-planner section
      safeLocalStorage.setItem('adminActiveSection', 'rota-planner');
      safeLocalStorage.removeItem('adminActiveTab');
      setActiveSection('rota-planner');
    }
  }, []);

  useEffect(() => {
    const prev = prevSectionRef.current;
    prevSectionRef.current = activeSection;
    if (prev === 'stats' && activeSection !== 'stats' && mainContentRef.current) {
      try {
        safeSessionStorage.setItem('admin_stats_scroll', String(mainContentRef.current.scrollTop));
      } catch (_) {}
    }
    if (activeSection === 'stats') {
      const saved = safeSessionStorage.getItem('admin_stats_scroll');
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

  useEffect(() => {
    if (activeSection !== 'users') return undefined;
    return lockPageScroll();
  }, [activeSection]);

  const openUserViolations = (userId) => {
    if (!userId) return;
    setUsersFocus({ userId, tab: 'violations' });
    setActiveSection('users');
  };

  const openUserAssessments = (userId) => {
    if (!userId) return;
    setUsersFocus({ userId, tab: 'assessments' });
    setActiveSection('users');
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
          show_on_reports: row.show_on_reports !== false,
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
      // Fallback without email/notes columns (revoked for clients)
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select(
          'id, first_name, last_name, role, account_status, is_active, show_on_reports, performance_score, agency_id, avatar_url, shift_preference, preferred_location, yard_system_id, deleted_at, agencies(id, name)',
        )
        .is('deleted_at', null);

      if (profilesError) throw profilesError;

      if (!Array.isArray(profilesData)) {
        throw new Error('Invalid data format received from profiles table');
      }

      const usersList = profilesData.map((profile) => ({
        ...profile,
        performance_score: profile.performance_score ?? 50,
        is_active: profile.is_active !== false,
        show_on_reports: profile.show_on_reports !== false,
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
      }
    };
    
    loadData();
    
    return () => {
      cancelled = true;
    };
  }, [user]); // Keep user dependency for the fallback email logic

  // --- Renderowanie --- 
  // Pokazuj loader tylko podczas ładowania danych użytkowników
  // ProtectedAdminRoute już obsługuje weryfikację uprawnień
  if (pageLoading) {
    return (
      <div className="min-h-screen bg-offwhite flex animate-pulse">
        {/* Sidebar skeleton */}
        <aside className="w-16 md:w-64 bg-white border-r border-gray-200 flex-shrink-0">
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="w-8 h-8 bg-slate-200 rounded-lg" />
                <div className="hidden md:block h-4 bg-slate-200 rounded flex-1" />
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

  // Renderowanie zawartości w zależności od aktywnej sekcji
  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return (
          <AdminDashboard
            onOpen={setActiveSection}
            onOpenUserAssessment={openUserAssessments}
            users={users}
          />
        );
      case 'users':
        return (
          <UserList
            users={users}
            onRefresh={fetchUsers}
            focusUserId={usersFocus?.userId}
            focusTab={usersFocus?.tab}
            onFocusConsumed={() => setUsersFocus(null)}
          />
        );
      case 'approvals':
        return <UserApprovalPage />;
      case 'availability':
        return <AvailabilityManager />;
      case 'rota-planner':
        return <RotaPlannerPage />;
      case 'breaks':
        return (
          <Suspense fallback={<AdminSectionFallback />}>
            <BrakesManager />
          </Suspense>
        );
      case 'attendance':
        return (
          <AttendancePage onOpenUserViolations={openUserViolations} />
        );
      case 'tugs':
        return <TugManager />;
      case 'prechecks':
        return <PreCheckList />;
      case 'check-items':
        return <CheckItemManager />;
      case 'shunter-month':
        return (
          <ShunterOfTheMonthManager
            users={users}
            onAwardsChange={() => window.dispatchEvent(new Event('adminShunterRefresh'))}
          />
        );
      case 'settings':
        return (
          <SettingsManager
            initialSection={settingsTab}
            onSectionChange={setSettingsTab}
          />
        );
      case 'performance':
        return <PerformanceImport />;
      case 'stats':
        return <LoginStats />;
      case 'induction-guide':
        return <InductionGuideManager />;
      default:
        return (
          <AdminDashboard
            onOpen={setActiveSection}
            onOpenUserAssessment={openUserAssessments}
            users={users}
          />
        );
    }
  };

  const isUsersSection = activeSection === 'users';
  const isAttendanceSection = activeSection === 'attendance';

  // Główna zawartość strony admina - uprawnienia już sprawdzone przez ProtectedAdminRoute
  return (
    <div className={`bg-offwhite ${
      isUsersSection
        ? 'h-[calc(100dvh-4rem)] overflow-hidden'
        : isAttendanceSection
          ? 'min-h-screen md:h-[calc(100dvh-4rem)] md:min-h-0 md:overflow-hidden'
          : 'min-h-screen'
    }`}>
      <div
        ref={mainContentRef}
        className={
          isUsersSection
            ? 'h-full overflow-hidden'
            : isAttendanceSection
              ? 'min-h-screen overflow-y-auto md:h-full md:min-h-0 md:overflow-hidden'
              : 'min-h-screen overflow-y-auto'
        }
      >
        <div className={`p-4 md:p-6 lg:p-8 ${isUsersSection ? 'h-full' : isAttendanceSection ? 'md:h-full' : ''}`}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
} 