import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useAuth } from '../lib/AuthContext';
import AdminDashboard from '../components/Admin/AdminDashboard';
import { safeLocalStorage, safeSessionStorage } from '../utils/safeStorage';
import { lockPageScroll } from '../utils/lockPageScroll';
import {
  fetchAdminProfilesCached,
  invalidateAdminProfilesCache,
} from '../utils/adminProfilesCache';
import { lazyWithRetry } from '../utils/lazyWithRetry';

// Lazy non-dashboard sections so /admin dashboard first paint stays lean.
const UserList = lazyWithRetry(() => import('../components/Admin/UserList'));
const AvailabilityManager = lazyWithRetry(() => import('../components/Admin/AvailabilityManager'));
const SettingsManager = lazyWithRetry(() => import('../components/Admin/SettingsManager'));
const UserApprovalPage = lazyWithRetry(() => import('./UserApprovalPage'));
const LoginStats = lazyWithRetry(() => import('../components/Admin/LoginStats'));
const PerformanceImport = lazyWithRetry(() => import('../components/Admin/PerformanceImport'));
const RotaPlannerPage = lazyWithRetry(() => import('./RotaPlannerPage'));
const BrakesManager = lazyWithRetry(() => import('../components/Admin/Brakes/BrakesManager'));
const ShunterOfTheMonthManager = lazyWithRetry(() => import('../components/Admin/ShunterOfTheMonthManager'));
const TugManager = lazyWithRetry(() => import('../components/Admin/PreCheck/TugManager'));
const PreCheckList = lazyWithRetry(() => import('../components/Admin/PreCheck/PreCheckList'));
const CheckItemManager = lazyWithRetry(() => import('../components/Admin/PreCheck/CheckItemManager'));
const AttendancePage = lazyWithRetry(() => import('./AttendancePage'));
const InductionGuideManager = lazyWithRetry(() => import('../components/Admin/InductionGuideManager'));

function AdminSectionFallback() {
  return (
    <div className="space-y-4 animate-pulse motion-reduce:animate-none p-2" aria-busy="true" aria-label="Loading section">
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
  // Users load in background — do not block dashboard first paint.
  const [usersLoading, setUsersLoading] = useState(true);
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

  const fetchUsers = async ({ force = false } = {}) => {
    setUsersLoading(true);
    setError(null);
    try {
      if (force) invalidateAdminProfilesCache();
      const usersList = await fetchAdminProfilesCached({ force });
      setUsers(usersList);
    } catch (err) {
      console.error('[AdminPage] Error fetching users:', err);
      setError('Error loading users.');
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  };

  // Background users fetch — dashboard paints without waiting.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const usersList = await fetchAdminProfilesCached();
        if (!cancelled) {
          setUsers(usersList);
          setError(null);
        }
      } catch (err) {
        console.error('[AdminPage] Error fetching users:', err);
        if (!cancelled) {
          setError('Error loading users.');
          setUsers([]);
        }
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const needsUsersList =
    activeSection === 'users' || activeSection === 'shunter-month';

  // Only block sections that require the full users list.
  if (needsUsersList && usersLoading && users.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-offwhite p-6">
        <div className="animate-pulse space-y-3 motion-reduce:animate-none">
          <div className="h-6 w-48 rounded bg-slate-200" />
          <div className="h-32 w-72 rounded-xl bg-slate-200 md:w-96" />
        </div>
      </div>
    );
  }

  if (needsUsersList && error && users.length === 0) {
    return (
      <div className="min-h-screen p-4 bg-offwhite">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl p-6 border border-gray-200">
          <div className="text-red-600 text-center">
            <h2 className="text-2xl font-bold mb-4 text-charcoal">Error Loading Data</h2>
            <p>{error}</p>
            <button
              type="button"
              onClick={() => fetchUsers({ force: true })}
              className="mt-4 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
            >
              Try again
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
            onRefresh={() => fetchUsers({ force: true })}
            focusUserId={usersFocus?.userId}
            focusTab={usersFocus?.tab}
            onFocusConsumed={() => setUsersFocus(null)}
          />
        );
      case 'approvals':
        return <UserApprovalPage />;
      case 'availability':
        return <AvailabilityManager users={users} />;
      case 'rota-planner':
        return <RotaPlannerPage />;
      case 'breaks':
        return <BrakesManager />;
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
          <Suspense fallback={<AdminSectionFallback />}>
            {renderContent()}
          </Suspense>
        </div>
      </div>
    </div>
  );
} 