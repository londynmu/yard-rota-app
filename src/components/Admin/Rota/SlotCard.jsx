import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../../lib/supabaseClient';

const SlotCard = ({ slot, onAssign, onEdit }) => {
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!slot.assigned_employees || slot.assigned_employees.length === 0) {
        setAssignedUsers([]);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', slot.assigned_employees);

        if (error) throw error;
        setAssignedUsers(data || []);
      } catch (error) {
        console.error('Error fetching assigned users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [slot.assigned_employees]);

  const formatTime = (timeString) => {
    if (!timeString) return '';
    // Convert 24h format to 12h format
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Calculate fill percentage
  const fillPercentage = slot.capacity > 0 
    ? Math.min(100, (slot.assigned_employees.length / slot.capacity) * 100) 
    : 0;

  // Determine color based on fill percentage
  const getStatusColor = () => {
    if (fillPercentage >= 100) return 'bg-green-500/30 border-green-400/30';
    if (fillPercentage > 0) return 'bg-yellow-500/30 border-yellow-400/30';
    return 'bg-blue-500/30 border-blue-400/30';
  };

  return (
    <div className={`relative rounded-lg overflow-hidden shadow-md ${getStatusColor()}`}>
      <div className="absolute top-0 left-0 h-1 bg-white/30" style={{ width: `${fillPercentage}%` }}></div>
      
      <div className="p-4 backdrop-blur-sm">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h4 className="font-semibold text-white">{slot.location}</h4>
            <p className="text-sm text-white/80">
              {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
            </p>
          </div>
          
          <div className="flex flex-col items-end">
            <div className="flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="text-white/70 hover:text-white mr-2"
                aria-label="Edit slot"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
              <span className="text-xs bg-white/20 rounded-full px-2 py-0.5 text-white">
                {slot.assigned_employees.length}/{slot.capacity}
              </span>
            </div>
          </div>
        </div>
        
        <div className="mb-3">
          <h5 className="text-xs uppercase tracking-wider text-white/70 mb-1">Assigned Staff</h5>
          
          {loading ? (
            <div className="flex justify-center py-2">
              <div className="w-5 h-5 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
            </div>
          ) : assignedUsers.length > 0 ? (
            <ul className="space-y-1">
              {assignedUsers.map(user => (
                <li key={user.id} className="flex items-center gap-2 text-white text-sm">
                  <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-xs overflow-hidden">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.first_name} className="w-full h-full object-cover" />
                    ) : (
                      `${user.first_name?.charAt(0) || ''}${user.last_name?.charAt(0) || ''}`
                    )}
                  </div>
                  <span>{user.first_name} {user.last_name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-white/50 text-sm italic">No staff assigned</p>
          )}
        </div>
        
        <div className="flex justify-between gap-2 mt-auto">
          <button
            onClick={onAssign}
            className="w-full px-3 py-1.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded text-white text-sm hover:bg-white/20 transition-colors"
          >
            Assign Staff
          </button>
        </div>
      </div>
    </div>
  );
};

SlotCard.propTypes = {
  slot: PropTypes.shape({
    id: PropTypes.string.isRequired,
    date: PropTypes.string.isRequired,
    shift_type: PropTypes.string.isRequired,
    location: PropTypes.string.isRequired,
    start_time: PropTypes.string.isRequired,
    end_time: PropTypes.string.isRequired,
    capacity: PropTypes.number.isRequired,
    assigned_employees: PropTypes.array.isRequired
  }).isRequired,
  onAssign: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired
};

export default SlotCard; 