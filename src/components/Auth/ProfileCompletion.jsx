import { useEffect, useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabaseClient";

export default function ProfileCompletion({ onComplete }) {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [shiftPreference, setShiftPreference] = useState("day");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function fetchPartialProfile() {
      if (user) {
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select("first_name, last_name, shift_preference")
            .eq("id", user.id)
            .single();

          if (error && error.code !== 'PGRST116') throw error;

          if (data) {
            setFirstName(data.first_name || "");
            setLastName(data.last_name || "");
            setShiftPreference(data.shift_preference || "day");
          }
        } catch (error) {
          console.error("Error fetching existing profile data:", error);
        }
      }
    }
    fetchPartialProfile();
  }, [user]);

  const capitalizeFirstLetter = (string) => {
    if (!string) return "";
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please fill in all required fields");
      setLoading(false);
      return;
    }

    if (!user) {
      setError("User not found. Cannot save profile.");
      setLoading(false);
      return;
    }

    try {
      const { error: upsertError } = await supabase.from("profiles").upsert({
        id: user.id,
        first_name: capitalizeFirstLetter(firstName),
        last_name: capitalizeFirstLetter(lastName),
        shift_preference: shiftPreference,
        profile_completed: true,
        updated_at: new Date(),
      });

      if (upsertError) throw upsertError;

      setSuccess(true);
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      setError(error.message || "An error occurred while saving your profile");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    console.error("ProfileCompletion rendered without a user!");
    return <div className="min-h-screen flex items-center justify-center bg-offwhite dark:bg-gray-900 text-charcoal dark:text-white">Error: User not available.</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream dark:bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-charcoal dark:text-white mb-6 text-center">Complete Your Profile</h2>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
          
          {success && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-600 dark:text-green-400 text-center">
              Profile saved successfully! Redirecting...
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="firstName" className="block text-charcoal dark:text-white mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full p-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="Enter your first name"
              />
            </div>
            
            <div>
              <label htmlFor="lastName" className="block text-charcoal dark:text-white mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full p-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="Enter your last name"
              />
            </div>
            
            <div>
              <span className="block text-charcoal dark:text-white mb-1">
                Preferred Shift <span className="text-red-500">*</span>
              </span>
              <div className="grid grid-cols-3 gap-2">
                <label className={`cursor-pointer flex items-center justify-center p-2 rounded-lg border ${shiftPreference === 'day' ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>
                  <input
                    type="radio"
                    name="shiftPreference"
                    value="day"
                    checked={shiftPreference === "day"}
                    onChange={() => setShiftPreference("day")}
                    className="sr-only"
                  />
                  <span className={`text-sm ${shiftPreference === 'day' ? 'text-white dark:text-black' : 'text-charcoal dark:text-white'}`}>Day</span>
                </label>
                
                <label className={`cursor-pointer flex items-center justify-center p-2 rounded-lg border ${shiftPreference === 'afternoon' ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>
                  <input
                    type="radio"
                    name="shiftPreference"
                    value="afternoon"
                    checked={shiftPreference === "afternoon"}
                    onChange={() => setShiftPreference("afternoon")}
                    className="sr-only"
                  />
                  <span className={`text-sm ${shiftPreference === 'afternoon' ? 'text-white dark:text-black' : 'text-charcoal dark:text-white'}`}>Afternoon</span>
                </label>
                
                <label className={`cursor-pointer flex items-center justify-center p-2 rounded-lg border ${shiftPreference === 'night' ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>
                  <input
                    type="radio"
                    name="shiftPreference"
                    value="night"
                    checked={shiftPreference === "night"}
                    onChange={() => setShiftPreference("night")}
                    className="sr-only"
                  />
                  <span className={`text-sm ${shiftPreference === 'night' ? 'text-white dark:text-black' : 'text-charcoal dark:text-white'}`}>Night</span>
                </label>
              </div>
            </div>
            
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-black p-2 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <div className="rounded-full h-5 w-5 border-t-2 border-b-2 border-white dark:border-black mr-2"></div>
                    Saving...
                  </span>
                ) : (
                  "Save Profile"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 