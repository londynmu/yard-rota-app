import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../components/ui/ToastContext';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useNavigate } from 'react-router-dom';

const UserProfile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  
  // Day Notes States
  const [notes, setNotes] = useState([]);
  const [showAddNoteForm, setShowAddNoteForm] = useState(false);
  const [noteDate, setNoteDate] = useState(new Date());
  const [noteText, setNoteText] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          navigate('/login');
          return;
        }
        
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
          
        if (error) throw error;
        
        setProfile(data);
        
        // Fetch user's day notes
        await fetchUserNotes(user.id);
      } catch (error) {
        console.error('Error fetching profile:', error);
        toast.error('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    
    fetchProfile();
  }, [navigate, toast]);
  
  const fetchUserNotes = async (userId) => {
    setLoadingNotes(true);
    try {
      const { data, error } = await supabase
        .from('user_day_notes')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });
        
      if (error) throw error;
      
      setNotes(data || []);
    } catch (error) {
      console.error('Error fetching user notes:', error);
      toast.error('Failed to load your day notes');
    } finally {
      setLoadingNotes(false);
    }
  };
  
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: profile.first_name,
          last_name: profile.last_name,
          email: profile.email,
          preferred_location: profile.preferred_location,
          shift_preference: profile.shift_preference || profile.preferred_shift
        })
        .eq('id', profile.id);
        
      if (error) throw error;
      
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setUpdating(false);
    }
  };
  
  const handleAddNote = async (e) => {
    e.preventDefault();
    
    if (!noteText.trim()) {
      toast.error('Please enter a note');
      return;
    }
    
    setSavingNote(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Format date to YYYY-MM-DD
      const formattedDate = noteDate.toISOString().split('T')[0];
      
      // Check if a note already exists for this date
      const { data: existingNote } = await supabase
        .from('user_day_notes')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', formattedDate)
        .single();
      
      if (existingNote) {
        // Update existing note
        const { error } = await supabase
          .from('user_day_notes')
          .update({ note: noteText })
          .eq('id', existingNote.id);
          
        if (error) throw error;
        
        toast.success('Note updated successfully');
      } else {
        // Insert new note
        const { error } = await supabase
          .from('user_day_notes')
          .insert({
            user_id: user.id,
            date: formattedDate,
            note: noteText
          });
          
        if (error) throw error;
        
        toast.success('Note added successfully');
      }
      
      // Reset form and refresh notes
      setNoteText('');
      setShowAddNoteForm(false);
      await fetchUserNotes(user.id);
    } catch (error) {
      console.error('Error saving note:', error);
      toast.error('Failed to save note');
    } finally {
      setSavingNote(false);
    }
  };
  
  const handleDeleteNote = async (noteId) => {
    const confirmation = window.confirm('Are you sure you want to delete this note?');
    if (!confirmation) return;
    
    try {
      const { error } = await supabase
        .from('user_day_notes')
        .delete()
        .eq('id', noteId);
        
      if (error) throw error;
      
      // Update the notes list
      setNotes(notes.filter(note => note.id !== noteId));
      toast.success('Note deleted successfully');
    } catch (error) {
      console.error('Error deleting note:', error);
      toast.error('Failed to delete note');
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }
  
  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-white mb-6">Your Profile</h1>
      
      <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/40 rounded-lg p-6 mb-8">
        <h2 className="text-xl text-white mb-4">Personal Information</h2>
        
        <form onSubmit={handleUpdateProfile}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-white text-sm font-medium mb-1">First Name</label>
              <input
                type="text"
                value={profile.first_name || ''}
                onChange={(e) => setProfile({...profile, first_name: e.target.value})}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-md text-white px-3 py-2"
              />
            </div>
            
            <div>
              <label className="block text-white text-sm font-medium mb-1">Last Name</label>
              <input
                type="text"
                value={profile.last_name || ''}
                onChange={(e) => setProfile({...profile, last_name: e.target.value})}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-md text-white px-3 py-2"
              />
            </div>
            
            <div>
              <label className="block text-white text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={profile.email || ''}
                onChange={(e) => setProfile({...profile, email: e.target.value})}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-md text-white px-3 py-2"
              />
            </div>
            
            <div>
              <label className="block text-white text-sm font-medium mb-1">Preferred Location</label>
              <input
                type="text"
                value={profile.preferred_location || ''}
                onChange={(e) => setProfile({...profile, preferred_location: e.target.value})}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-md text-white px-3 py-2"
              />
            </div>
            
            <div>
              <label className="block text-white text-sm font-medium mb-1">Preferred Shift</label>
              <select
                value={profile.shift_preference || 'day'}
                onChange={(e) => setProfile({...profile, shift_preference: e.target.value})}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-md text-white px-3 py-2"
              >
                <option value="day">Day</option>
                <option value="afternoon">Afternoon</option>
                <option value="night">Night</option>
              </select>
            </div>
          </div>
          
          <button
            type="submit"
            disabled={updating}
            className="bg-blue-600/80 border border-blue-500/30 hover:bg-blue-700/90 text-white rounded-md px-4 py-2 transition-colors"
          >
            {updating ? 'Updating...' : 'Update Profile'}
          </button>
        </form>
      </div>
      
      {/* Day Notes Section */}
      <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/40 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl text-white">Day Notes</h2>
          <button
            onClick={() => setShowAddNoteForm(!showAddNoteForm)}
            className="bg-blue-600/80 border border-blue-500/30 hover:bg-blue-700/90 text-white rounded-md px-3 py-1.5 text-sm transition-colors"
          >
            {showAddNoteForm ? 'Cancel' : 'Add Note'}
          </button>
        </div>
        
        <p className="text-white/70 text-sm mb-4">
          Add notes about your availability on specific days. Your manager will see these notes when assigning shifts.
        </p>
        
        {/* Add Note Form */}
        {showAddNoteForm && (
          <div className="bg-slate-900/30 border border-slate-700/30 rounded-md p-4 mb-6">
            <form onSubmit={handleAddNote} className="space-y-4">
              <div>
                <label className="block text-white text-sm font-medium mb-1">Date</label>
                <DatePicker
                  selected={noteDate}
                  onChange={(date) => setNoteDate(date)}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-md text-white px-3 py-2"
                  dateFormat="dd/MM/yyyy"
                  minDate={new Date()}
                />
              </div>
              
              <div>
                <label className="block text-white text-sm font-medium mb-1">Note</label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="e.g., I need to leave early around 2 PM"
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-md text-white px-3 py-2 h-24 resize-none"
                  required
                ></textarea>
              </div>
              
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingNote || !noteText.trim()}
                  className="bg-blue-600/80 border border-blue-500/30 hover:bg-blue-700/90 text-white rounded-md px-4 py-2 transition-colors disabled:opacity-50"
                >
                  {savingNote ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </form>
          </div>
        )}
        
        {/* Notes List */}
        <div className="space-y-4">
          {loadingNotes ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8 text-white/50">
              <p>You haven't added any day notes yet.</p>
            </div>
          ) : (
            notes.map(note => (
              <div key={note.id} className="bg-slate-900/30 border border-slate-700/30 rounded-md p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-white font-medium">
                      {new Date(note.date).toLocaleDateString('en-GB')}
                    </h3>
                    <p className="text-white/90 mt-2 whitespace-pre-wrap">{note.note}</p>
                    <p className="text-white/50 text-xs mt-2">
                      Added: {new Date(note.created_at).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="text-red-400 hover:text-red-300 flex-shrink-0"
                    title="Delete Note"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfile; 