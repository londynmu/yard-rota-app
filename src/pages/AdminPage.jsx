import React, { useState, useEffect } from 'react';
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

export default function AdminPage() {
  // Pobierz tylko user i loading z AuthContext
  const { user, loading: authLoading } = useAuth(); 
  const [users, setUsers] = useState([]);
  // Stan ładowania teraz dla całej strony (auth + profil + dane userów)
  const [pageLoading, setPageLoading] = useState(true); 
  const [error, setError] = useState(null);
  // Aktywna sekcja - zmiana na sidebar navigation
  const [activeSection, setActiveSection] = useState(() => {
    const savedSection = localStorage.getItem('adminActiveSection');
    // Validate saved section
    const validSections = [
      'dashboard', 'users', 'approvals', 'availability', 
      'rota-planner', 'breaks', 'performance', 'stats', 
      'shunter-month', 'settings'
    ];
    return (savedSection && validSections.includes(savedSection)) ? savedSection : 'dashboard';
  });
  // Sidebar hover state - tylko na desktop, mobile używa mobileSidebarOpen
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Aktualizuj tytuł strony w top barze
  useEffect(() => {
    const titleElement = document.getElementById('page-title');
    if (titleElement) {
      const titles = {
        'dashboard': 'Dashboard',
        'users': 'Users',
        'approvals': 'Approvals',
        'availability': 'Availability',
        'rota-planner': 'Rota Planner',
        'breaks': 'Breaks',
        'performance': 'Performance',
        'stats': 'Statistics',
        'shunter-month': 'Shunter of the Month',
        'settings': 'Settings'
      };
      titleElement.textContent = titles[activeSection] || 'Admin Panel';
    }
  }, [activeSection]);
  const [isAdmin, setIsAdmin] = useState(false);
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

  // Efekt do sprawdzania uprawnień admina PO załadowaniu AuthContext
  useEffect(() => {
    // Funkcja do pobrania profilu i sprawdzenia roli
    const checkAdminStatus = async () => {
      if (!user) { // Jeśli nie ma użytkownika, to na pewno nie admin
        setError('You must be logged in and have admin privileges.');
        setIsAdmin(false);
        setPageLoading(false); // Zakończ ładowanie, bo wiemy, że nie ma dostępu
        return;
      }

      // Jeśli jest użytkownik, spróbuj pobrać jego profil
      setPageLoading(true); // Rozpocznij ładowanie (na wypadek, gdyby authLoading było false wcześniej)
      try {
        const { data: userProfile, error: profileError } = await supabase
          .from('profiles')
          .select('role') // Fetch only the role
          .eq('id', user.id)
          .single();

        if (profileError) {
          // If error other than missing profile (code 406)
          if (profileError.code !== 'PGRST116') { 
            throw profileError; // Throw error forward
          }
          // If profile does not exist (PGRST116)
          setError('Admin permissions require a user profile.');
          setIsAdmin(false);
        } else if (userProfile && userProfile.role === 'admin') {
          // Profile found and role is admin
          setIsAdmin(true);
          setError(null); // Clear error if user is admin
        } else {
          // Profile found but role is not admin
          setError('You do not have permission to access this page.');
          setIsAdmin(false);
        }
      } catch (err) {
        console.error('[AdminPage] Error checking admin status:', err);
        setError('Error verifying permissions.');
        setIsAdmin(false);
      } finally {
        // Zakończ ładowanie strony dopiero po sprawdzeniu profilu
        setPageLoading(false); 
      }
    };

    // Uruchom sprawdzanie dopiero, gdy AuthContext zakończy ładowanie
    if (!authLoading) { 
      checkAdminStatus();
    }

  }, [user, authLoading]); // Zależność od user i authLoading

  // --- Monthly Shunter reminder banner ---
  const [showShunterReminder, setShowShunterReminder] = useState(false);

  useEffect(() => {
    if (!isAdmin || pageLoading) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const monthKey = `${year}-${month}`;
    const storageKey = `shunterReminderDismissed-${monthKey}`;
    const dismissed = localStorage.getItem(storageKey) === 'true';

    if (!dismissed) {
      setShowShunterReminder(true);
    }
  }, [isAdmin, pageLoading]);

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
    setPageLoading(true); // Show loading state
    try {
      // Direct query to get ALL fields from profiles including yard_system_id and agency
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*, agencies(id, name)');
      
      if (profilesError) throw profilesError;
      
      // Validate profilesData
      if (!Array.isArray(profilesData)) {
        throw new Error('Invalid data format received from profiles table');
      }
      
      // Try to get emails using RPC function
      let usersWithEmails = [];
      
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_complete_profiles_with_emails');
        if (!rpcError && rpcData && Array.isArray(rpcData)) {
          // Merge RPC email data with profile data
          usersWithEmails = profilesData.map(profile => {
            const rpcUser = rpcData.find(u => u.id === profile.id);
            return {
              ...profile,
              email: rpcUser?.email || 'N/A',
              performance_score: profile.performance_score ?? 50,
              is_active: profile.is_active !== false,
              agency_name: profile.agencies?.name || null
            };
          });
        } else {
          // If RPC fails, just use profiles without emails
          usersWithEmails = profilesData.map(profile => ({
            ...profile,
            email: 'N/A',
            performance_score: profile.performance_score ?? 50,
            is_active: profile.is_active !== false,
            agency_name: profile.agencies?.name || null
          }));
        }
      } catch (rpcErr) {
        // If any error, just use profiles without emails
        usersWithEmails = profilesData.map(profile => ({
          ...profile,
          email: 'N/A',
          performance_score: profile.performance_score ?? 50,
          is_active: profile.is_active !== false,
          agency_name: profile.agencies?.name || null
        }));
      }
      
      setUsers(usersWithEmails);
    } catch (err) {
      console.error('[AdminPage] General error fetching users:', err);
      setError('Error loading users.');
      setUsers([]); 
    } finally {
      setPageLoading(false); // End loading state
    }
  };

  // Efekt do pobierania listy użytkowników (jeśli admin)
  useEffect(() => {
    if (!isAdmin) return;
    
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
  }, [isAdmin, user]); // Keep user dependency for the fallback email logic

  // --- Renderowanie --- 
  // Użyj pageLoading do głównego wskaźnika ładowania
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
  
  // Show error if it occurred (e.g. lack of permissions)
  if (error) {
    return (
      <div className="min-h-screen p-4 bg-offwhite">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl p-6 border border-gray-200">
          <div className="text-red-600 text-center">
            <h2 className="text-2xl font-bold mb-4 text-charcoal">Access Denied</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }
  
  // Jeśli zakończono ładowanie, nie ma błędu, ale nie jest adminem (nie powinno się zdarzyć)
  if (!isAdmin) {
    return (
      <div className="min-h-screen p-4 bg-offwhite">
        <p className="text-charcoal">Access Denied. Administrative privileges required.</p> 
      </div>
    );
  }

  // Definicja menu sidebar
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠', description: 'Overview & Quick Stats' },
    { id: 'users', label: 'Users', icon: '👥', description: 'Manage users' },
    { id: 'approvals', label: 'Approvals', icon: '✓', description: 'Pending approvals', badge: pendingApprovals },
    { id: 'availability', label: 'Availability', icon: '📅', description: 'User availability' },
    { id: 'rota-planner', label: 'Rota Planner', icon: '📋', description: 'Plan work schedules' },
    { id: 'breaks', label: 'Breaks', icon: '☕', description: 'Manage employee breaks' },
    { id: 'performance', label: 'Performance', icon: '📊', description: 'Import performance data' },
    { id: 'stats', label: 'Statistics', icon: '📈', description: 'Login & activity stats' },
    { id: 'shunter-month', label: 'Shunter of the Month', icon: '🏆', description: 'Monthly Day & Night awards' },
    { id: 'settings', label: 'Settings', icon: '⚙️', description: 'Locations & Agencies' },
  ];

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
              className="bg-white rounded-xl shadow-md border border-gray-200 p-5 hover:shadow-lg hover:border-gray-300 transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="text-3xl group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-charcoal group-hover:text-black">
                    {item.label}
                    {item.badge > 0 && (
                      <span className="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-orange-600 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </h3>
                </div>
                <svg className="w-5 h-5 text-gray-400 group-hover:text-black group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      case 'shunter-month':
        return <ShunterOfTheMonthManager users={users} />;
      case 'settings':
        return <SettingsManager />;
      case 'performance':
        return <PerformanceImport />;
      case 'stats':
        return <LoginStats />;
      default:
        return <DashboardView />;
    }
  };

  // Główna zawartość strony admina (tylko jeśli isAdmin === true)
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

      {/* Sidebar - zawsze widoczny na desktop, rozwija się po najechaniu */}
      <aside 
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
        className={`
          ${sidebarHovered ? 'w-72' : 'w-20'}
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
                } ${sidebarHovered ? 'px-3' : 'justify-center px-2'}`}
                title={!sidebarHovered ? item.label : ''}
              >
                <div className="w-8 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">{item.icon}</span>
                </div>
                {sidebarHovered && (
                  <div className="flex-1 text-left font-medium flex items-center gap-2 whitespace-nowrap opacity-0 animate-fadeIn ml-3" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
                    {item.label}
                    {item.badge > 0 && (
                      <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-orange-600 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
                {!sidebarHovered && item.badge > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-orange-600 rounded-full border border-white"></span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        {sidebarHovered && (
          <div className="p-4 border-t border-gray-200 opacity-0 animate-fadeIn" style={{ animationDelay: '150ms', animationFillMode: 'forwards' }}>
            <div className="text-xs text-gray-500 text-center whitespace-nowrap">
              Logged in as Admin
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area - zawsze z marginesem 80px (dla zwiniętego sidebara) */}
      <main className="min-h-screen overflow-y-auto md:ml-20">
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