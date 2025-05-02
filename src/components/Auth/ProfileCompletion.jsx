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
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">Error: User not available.</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-blue-900 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-8 shadow-xl border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Complete Your Profile</h2>
          
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded text-white text-sm">
              {error}
            </div>
          )}
          
          {success && (
            <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded text-white text-center">
              Profile saved successfully! Redirecting...
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="firstName" className="block text-white mb-1">
                First Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full p-2 bg-white/10 border border-white/30 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent text-white placeholder-white/50"
                placeholder="Enter your first name"
              />
            </div>
            
            <div>
              <label htmlFor="lastName" className="block text-white mb-1">
                Last Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full p-2 bg-white/10 border border-white/30 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent text-white placeholder-white/50"
                placeholder="Enter your last name"
              />
            </div>
            
            <div>
              <span className="block text-white mb-1">
                Preferred Shift <span className="text-red-400">*</span>
              </span>
              <div className="grid grid-cols-3 gap-2">
                <label className={`cursor-pointer flex items-center justify-center p-2 rounded border ${shiftPreference === 'day' ? 'bg-blue-500/30 border-blue-400' : 'bg-white/10 border-white/30 hover:bg-white/20'}`}>
                  <input
                    type="radio"
                    name="shiftPreference"
                    value="day"
                    checked={shiftPreference === "day"}
                    onChange={() => setShiftPreference("day")}
                    className="sr-only"
                  />
                  <span className="text-white text-sm">Day</span>
                </label>
                
                <label className={`cursor-pointer flex items-center justify-center p-2 rounded border ${shiftPreference === 'afternoon' ? 'bg-blue-500/30 border-blue-400' : 'bg-white/10 border-white/30 hover:bg-white/20'}`}>
                  <input
                    type="radio"
                    name="shiftPreference"
                    value="afternoon"
                    checked={shiftPreference === "afternoon"}
                    onChange={() => setShiftPreference("afternoon")}
                    className="sr-only"
                  />
                  <span className="text-white text-sm">Afternoon</span>
                </label>
                
                <label className={`cursor-pointer flex items-center justify-center p-2 rounded border ${shiftPreference === 'night' ? 'bg-blue-500/30 border-blue-400' : 'bg-white/10 border-white/30 hover:bg-white/20'}`}>
                  <input
                    type="radio"
                    name="shiftPreference"
                    value="night"
                    checked={shiftPreference === "night"}
                    onChange={() => setShiftPreference("night")}
                    className="sr-only"
                  />
                  <span className="text-white text-sm">Night</span>
                </label>
              </div>
            </div>
            
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-md shadow-md font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <div className="rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
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