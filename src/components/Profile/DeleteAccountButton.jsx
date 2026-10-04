import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Modal from '../ui/Modal';
import { useToast } from '../ui/ToastContext';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { parseAvatarStorageRef } from '../../utils/avatarUrl';

const RPC_ERROR_MESSAGES = {
  REAUTH_REQUIRED: 'Please confirm your password again to delete your account.',
  LAST_ADMIN: 'You are the only administrator. Assign another admin first.',
};

const OUTLINE_BUTTON =
  'px-4 py-2 rounded-lg border-2 border-rota-btn-outline-border bg-white text-rota-btn-outline-text hover:bg-rota-day-other-bg-from transition-colors';
const DESTRUCTIVE_BUTTON =
  'px-4 py-2 rounded-lg border-2 border-rota-btn-destructive-border bg-white text-rota-btn-destructive-text hover:bg-rota-btn-destructive-hover-bg transition-colors';

/**
 * Self-service account deletion. The account is anonymised server-side by
 * `delete_own_account`, which requires a sign-in within the last 10 minutes,
 * so the password is re-checked first.
 */
export default function DeleteAccountButton({ className = '' }) {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const close = () => {
    if (isDeleting) return;
    setIsOpen(false);
    setPassword('');
  };

  const handleDelete = async (event) => {
    event.preventDefault();
    if (!password || isDeleting) return;
    if (!user?.email) {
      toast.error('Your session has expired. Please sign in again.');
      return;
    }

    setIsDeleting(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (authError) {
        toast.error('Incorrect password. Try again.');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      const { error: deleteError } = await supabase.rpc('delete_own_account');
      if (deleteError) {
        const key = Object.keys(RPC_ERROR_MESSAGES).find((code) =>
          deleteError.message?.includes(code),
        );
        toast.error(key ? RPC_ERROR_MESSAGES[key] : 'Could not delete your account. Try again.');
        return;
      }

      const avatarRef = parseAvatarStorageRef(profile?.avatar_url);
      if (avatarRef) {
        const { error: storageError } = await supabase.storage
          .from(avatarRef.bucket)
          .remove([avatarRef.objectPath]);
        if (storageError) console.error('Error deleting avatar:', storageError);
      }

      setIsOpen(false);
      await signOut();
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Could not delete your account. Try again.');
    } finally {
      setIsDeleting(false);
      setPassword('');
    }
  };

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={`${DESTRUCTIVE_BUTTON} ${className}`}>
        Delete account
      </button>

      <Modal isOpen={isOpen} onClose={close}>
        <form onSubmit={handleDelete} className="text-center sm:text-left">
          <h3 className="text-xl font-semibold mb-2 text-rota-text-primary">Delete account</h3>
          <p className="text-rota-text-muted mb-4">
            Your name, email, photo, availability and notes will be permanently removed and you will be signed out.
            PreCheck and safety records stay on file without your name. This cannot be undone.
          </p>
          <label htmlFor="delete-account-password" className="block text-left text-sm font-medium text-rota-text-primary mb-1">
            Confirm your password
          </label>
          <input
            id="delete-account-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isDeleting}
            className="w-full mb-6 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rota-btn-destructive-border"
          />
          <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
            <button type="button" onClick={close} disabled={isDeleting} className={`${OUTLINE_BUTTON} order-2 sm:order-1`}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={!password || isDeleting}
              className={`${DESTRUCTIVE_BUTTON} order-1 sm:order-2 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isDeleting ? 'Deleting…' : 'Delete account'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

DeleteAccountButton.propTypes = {
  className: PropTypes.string,
};
