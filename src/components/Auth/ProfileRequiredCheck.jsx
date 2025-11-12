import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import ProfilePage from '../../pages/ProfilePage';
import PropTypes from 'prop-types';

export default function ProfileRequiredCheck({ children }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isProfileComplete, setIsProfileComplete] = useState(true);

  useEffect(() => {
    const checkProfileCompletion = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      // Admin bypass for specific email or service role
      if (user.email === 'tideend@gmail.com' || user.role === 'service_role') {
        setIsProfileComplete(true);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('profile_completed')
          .eq('id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error checking profile completion:', error);
          setIsProfileComplete(true); // Default to true on error to avoid blocking users
        } else {
          const isComplete = !!data?.profile_completed;
          setIsProfileComplete(isComplete);
        }
      } catch (error) {
        console.error('Error in profile check:', error);
        setIsProfileComplete(true); // Default to true on error
      } finally {
        setLoading(false);
      }
    };

    checkProfileCompletion();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-offwhite">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
      </div>
    );
  }

  if (!isProfileComplete && user) {
    return <ProfilePage isRequired={true} supabaseClient={supabase} simplifiedView={true} />;
  }

  return children;
}

ProfileRequiredCheck.propTypes = {
  children: PropTypes.node.isRequired
}; 