import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import UserList from '../components/Admin/UserList';
import AvailabilityManager from '../components/Admin/AvailabilityManager';
import SettingsManager from '../components/Admin/SettingsManager';
import UserApprovalPage from './UserApprovalPage';
import LoginStats from '../components/Admin/LoginStats';
import BreaksConfigManager from '../components/Admin/BreaksConfigManager';
import AgencyConfigManager from '../components/Admin/AgencyConfigManager';
import LocationConfigManager from '../components/Admin/LocationConfigManager';

export default function AdminPage() {
  // Pobierz tylko user i loading z AuthContext
  const { user, loading: authLoading } = useAuth(); 
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  // Stan ładowania teraz dla całej strony (auth + profil + dane userów)
  const [pageLoading, setPageLoading] = useState(true); 
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    // Użyj wartości z localStorage, jeśli istnieje, w przeciwnym razie użyj domyślnej wartości 'users'
    const savedTab = localStorage.getItem('adminActiveTab');
    // If saved tab is 'rota', we'll let the effect handle it
    return savedTab && savedTab !== 'rota' ? savedTab : 'users';
  });
  const [isAdmin, setIsAdmin] = useState(false); 

  // Check if we need to redirect to the new Rota Planner page
  useEffect(() => {
    const savedTab = localStorage.getItem('adminActiveTab');
    if (savedTab === 'rota') {
      // Update the saved tab to prevent future redirects
      localStorage.setItem('adminActiveTab', 'users');
      // Redirect to the new Rota Planner page
      navigate('/rota-planner');
    }
  }, [navigate]);

  // Efekt do zapisywania aktywnej zakładki w localStorage
  useEffect(() => {
    localStorage.setItem('adminActiveTab', activeTab);
    
    // Scroll to top when changing tabs to prevent automatic scrolling to middle/bottom
    window.scrollTo(0, 0);
  }, [activeTab]);

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
      console.log('[AdminPage] User detected. Fetching profile to check role...');
      setPageLoading(true); // Rozpocznij ładowanie (na wypadek, gdyby authLoading było false wcześniej)
      try {
        const { data: userProfile, error: profileError } = await supabase
          .from('profiles')
          .select('role') // Pobierz tylko rolę
          .eq('id', user.id)
          .single();

        if (profileError) {
          // Jeśli błąd inny niż brak profilu (kod 406)
          if (profileError.code !== 'PGRST116') { 
            throw profileError; // Rzuć błąd dalej
          }
          // Jeśli profil nie istnieje (PGRST116)
          console.warn('[AdminPage] Profile not found for user.');
          setError('Admin permissions require a user profile.');
          setIsAdmin(false);
        } else if (userProfile && userProfile.role === 'admin') {
          // Profil znaleziony i rola to admin
          console.log('[AdminPage] Admin role confirmed.');
          setIsAdmin(true);
          setError(null); // Wyczyść błąd, jeśli jest adminem
        } else {
          // Profil znaleziony, ale rola inna niż admin
          console.log('[AdminPage] User is not admin. Role:', userProfile?.role);
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

  // Define fetchUsers function outside useEffect so it can be passed to components
  const fetchUsers = async () => {
    console.log('[AdminPage] Fetching users...');
    setPageLoading(true); // Show loading state
    try {
      // Fetch regular profiles with emails using complete RPC function
      const { data: usersWithEmail, error: rpcError } = await supabase.rpc('get_complete_profiles_with_emails');
      if (rpcError) {
        console.error('[AdminPage] Error fetching users with complete profiles:', rpcError);
        // Fallback to original function if the new one doesn't exist yet
        const { data: fallbackUsers, error: fallbackError } = await supabase.rpc('get_profiles_with_emails');
        if (fallbackError) throw new Error('Could not fetch users via RPC.');
        
        // Process fetched users from fallback
        const processedUsers = fallbackUsers?.map(u => ({ 
          ...u, 
          performance_score: u.performance_score ?? 50, 
          is_active: u.is_active !== false 
        })) || [];
        
        setUsers(processedUsers);
      } else {
        // Process fetched users from complete function
        const processedUsers = usersWithEmail?.map(u => ({ 
          ...u, 
          performance_score: u.performance_score ?? 50, 
          is_active: u.is_active !== false 
        })) || [];
        
        setUsers(processedUsers);
      }
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
    // Use the fetchUsers defined outside this effect
    if (isAdmin) { 
      fetchUsers();
    }
    // Do not include fetchUsers in the dependency array since it's now defined outside
  }, [isAdmin, user]); // Keep user dependency for the fallback email logic

  // --- Renderowanie --- 
  // Użyj pageLoading do głównego wskaźnika ładowania
  if (pageLoading) {
    return (
        <div className="min-h-screen flex justify-center items-center bg-offwhite dark:bg-gray-900">
            <div className="animate-spin rounded-full h-14 w-14 border-t-2 border-b-2 border-black dark:border-white"></div>
        </div>
    );
  }
  
  // Pokaż błąd, jeśli wystąpił (np. brak uprawnień)
  if (error) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto bg-black/60 backdrop-blur-xl rounded-xl shadow-2xl p-6 border-2 border-white/30">
          <div className="text-red-300 text-center">
            <h2 className="text-2xl font-bold mb-4 text-white drop-shadow-md">Access Denied</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }
  
  // Jeśli zakończono ładowanie, nie ma błędu, ale nie jest adminem (nie powinno się zdarzyć)
  if (!isAdmin) {
    return (
      <div className="min-h-screen p-4">
        <p>Access Denied. Administrative privileges required.</p> 
      </div>
    );
  }

  // Główna zawartość strony admina (tylko jeśli isAdmin === true)
  return (
    <div className="min-h-screen bg-offwhite dark:bg-gray-900 py-6 px-4 sm:px-8 overflow-hidden relative">
      <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
          <div className="overflow-x-auto pb-1">
            <div className="flex flex-nowrap whitespace-nowrap border-b border-gray-200 dark:border-gray-700 mb-[-1px] min-w-full">
              {['users', 'approvals', 'availability', 'settings', 'breaks config', 'locations', 'agencies', 'stats'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? 'border-b-2 border-black dark:border-white text-black dark:text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="px-6 py-4">
          {activeTab === 'users' && <UserList users={users} refreshData={fetchUsers} />}
          {activeTab === 'approvals' && <UserApprovalPage />}
          {activeTab === 'availability' && <AvailabilityManager />}
          {activeTab === 'settings' && <SettingsManager />}
          {activeTab === 'breaks config' && <BreaksConfigManager />}
          {activeTab === 'locations' && <LocationConfigManager />}
          {activeTab === 'agencies' && <AgencyConfigManager />}
          {activeTab === 'stats' && <LoginStats />}
        </div>
      </div>
    </div>
  );
} 