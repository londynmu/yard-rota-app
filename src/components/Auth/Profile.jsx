import { useAuth } from '../../lib/AuthContext';

export default function Profile() {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Your Profile</h2>
        
        <div className="mb-6">
          <div className="bg-blue-100 p-4 rounded-md mb-4">
            <p className="text-blue-800 font-medium">Logged in as:</p>
            <p className="text-blue-800 break-all">{user?.email}</p>
          </div>
          
          <p className="text-sm text-gray-600 mb-4">User ID: {user?.id}</p>
          
          <div className="border-t border-gray-200 pt-4">
            <p className="text-gray-600 text-sm mb-1">Last login date:</p>
            <p className="font-medium">
              {user?.last_sign_in_at 
                ? new Date(user.last_sign_in_at).toLocaleString() 
                : 'No data'}
            </p>
          </div>
        </div>
        
        <button
          onClick={handleSignOut}
          className="w-full bg-red-500 text-white py-2 px-4 rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          Log out
        </button>
      </div>
    </div>
  );
} 