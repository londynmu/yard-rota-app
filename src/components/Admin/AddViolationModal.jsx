import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../ui/ToastContext';
import Modal from '../ui/Modal';

const OUTLINE_CANCEL =
  'order-2 inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border-2 border-rota-btn-outline-border bg-white px-4 py-2 text-rota-btn-outline-text transition-colors hover:bg-rota-day-other-bg-from motion-reduce:transition-none sm:order-1 sm:flex-none';
const OUTLINE_CONFIRM =
  'order-1 inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border-2 border-rota-text-primary bg-white px-4 py-2 text-rota-text-primary transition-colors hover:bg-rota-day-other-bg-from motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 sm:order-2 sm:flex-none';

export default function AddViolationModal({ open, onClose, initialUserId, users, onSuccess }) {
  const { user } = useAuth();
  const toast = useToast();
  const [userId, setUserId] = useState(initialUserId || '');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [bodyError, setBodyError] = useState('');

  const isPreselected = Boolean(initialUserId);

  useEffect(() => {
    if (open) {
      setUserId(initialUserId || '');
      setBody('');
      setBodyError('');
    }
  }, [open, initialUserId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBodyError('');
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setBodyError('Description is required');
      return;
    }
    const targetUserId = userId || initialUserId;
    if (!targetUserId) {
      toast.error('Please select a user');
      return;
    }
    if (!user?.id) {
      toast.error('You must be logged in to add a note');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('shunter_violations').insert({
        user_id: targetUserId,
        created_by: user.id,
        body: trimmedBody,
      });
      if (error) throw error;
      toast.success('Note added');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error adding violation:', err);
      toast.error(err.message || 'Failed to add note');
    } finally {
      setSaving(false);
    }
  };

  const selectedProfile = users?.find((u) => u.id === (userId || initialUserId));
  const displayName = selectedProfile
    ? `${selectedProfile.first_name || ''} ${selectedProfile.last_name || ''}`.trim() || 'Unknown'
    : '';

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      overlayClassName="z-[10000]"
      ariaLabelledBy="add-note-title"
      className="max-w-md !p-0"
    >
      <div className="flex items-center justify-between border-b border-rota-modal-border px-5 py-3">
        <h3 id="add-note-title" className="text-xl font-semibold text-rota-text-primary">
          Add note
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-charcoal motion-reduce:transition-none"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        {isPreselected ? (
          <div>
            <p className="mb-1 text-sm font-medium text-charcoal">User</p>
            <p className="text-sm font-semibold text-charcoal">{displayName || 'Unknown'}</p>
          </div>
        ) : (
          <div>
            <label htmlFor="violation-user" className="mb-1 block text-sm font-medium text-charcoal">
              User
            </label>
            <select
              id="violation-user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="admin-input admin-select min-h-11"
              required={!isPreselected}
              data-autofocus
            >
              <option value="">Select user…</option>
              {(users || []).map((u) => (
                <option key={u.id} value={u.id}>
                  {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.id}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="violation-body" className="mb-1 block text-sm font-medium text-charcoal">
            Description <span className="text-red-600">*</span>
          </label>
          <textarea
            id="violation-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="What happened?"
            aria-invalid={Boolean(bodyError)}
            aria-describedby={bodyError ? 'violation-body-error' : undefined}
            data-autofocus={isPreselected ? true : undefined}
            className={`admin-input min-h-11 resize-y ${bodyError ? '!border-red-400' : ''}`}
          />
          {bodyError ? (
            <p id="violation-body-error" className="mt-1 text-sm text-red-600" role="alert">
              {bodyError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={OUTLINE_CANCEL}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={OUTLINE_CONFIRM}>
            {saving ? 'Adding…' : 'Add note'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

AddViolationModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  initialUserId: PropTypes.string,
  users: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      first_name: PropTypes.string,
      last_name: PropTypes.string,
    })
  ),
  onSuccess: PropTypes.func,
};

AddViolationModal.defaultProps = {
  initialUserId: null,
  users: [],
  onSuccess: null,
};
