import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../ui/ToastContext';

const CATEGORY_OPTIONS = [
  { value: '', label: '— Select category (optional) —' },
  { value: 'trailer_check', label: 'Trailer not checked' },
  { value: 'radio', label: 'Not listening to radio' },
  { value: 'other', label: 'Other' },
];

export default function AddViolationModal({ open, onClose, initialUserId, users, onSuccess }) {
  const { user } = useAuth();
  const toast = useToast();
  const [userId, setUserId] = useState(initialUserId || '');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [bodyError, setBodyError] = useState('');

  const isPreselected = Boolean(initialUserId);

  useEffect(() => {
    if (open) {
      setUserId(initialUserId || '');
      setBody('');
      setCategory('');
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
      toast.error('You must be logged in to add a violation');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('shunter_violations').insert({
        user_id: targetUserId,
        created_by: user.id,
        body: trimmedBody,
        category: category || null,
      });
      if (error) throw error;
      toast.success('Violation added');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error adding violation:', err);
      toast.error(err.message || 'Failed to add violation');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const selectedProfile = users?.find((u) => u.id === (userId || initialUserId));
  const displayName = selectedProfile
    ? `${selectedProfile.first_name || ''} ${selectedProfile.last_name || ''}`.trim() || 'Unknown'
    : '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4">
      <div
        className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-charcoal">Add violation</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-1 rounded"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {isPreselected ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
              <p className="text-charcoal font-semibold">{displayName || 'Unknown'}</p>
            </div>
          ) : (
            <div>
              <label htmlFor="violation-user" className="block text-sm font-medium text-gray-700 mb-1">
                User
              </label>
              <select
                id="violation-user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-charcoal focus:outline-none focus:ring-2 focus:ring-charcoal/20 focus:border-charcoal"
                required={!isPreselected}
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
            <label htmlFor="violation-body" className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="violation-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="e.g. Did not check trailer, Not listening to radio"
              className={`w-full px-3 py-2 border rounded-lg text-charcoal focus:outline-none focus:ring-2 focus:ring-charcoal/20 focus:border-charcoal ${
                bodyError ? 'border-red-400' : 'border-gray-200'
              }`}
            />
            {bodyError && <p className="text-sm text-red-500 mt-1">{bodyError}</p>}
          </div>

          <div>
            <label htmlFor="violation-category" className="block text-sm font-medium text-gray-700 mb-1">
              Category (optional)
            </label>
            <select
              id="violation-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-charcoal focus:outline-none focus:ring-2 focus:ring-charcoal/20 focus:border-charcoal"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value || 'empty'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-charcoal text-white hover:bg-black disabled:opacity-60"
            >
              {saving ? 'Adding…' : 'Add violation'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
