import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../lib/NotificationContext';
import { useNavigate } from 'react-router-dom';

const NotificationBell = () => {
  // Use default values to prevent errors if context is not available
  const { notifications = [], unreadCount = 0, pendingApprovals = 0, markAllAsRead } = useNotifications() || {};
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Format date to "X time ago" format
  const formatTimeAgo = (date) => {
    if (!date) return '';
    
    try {
      const now = new Date();
      const diffMs = now - new Date(date);
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 60) return `${diffSec} second${diffSec !== 1 ? 's' : ''} ago`;
      if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
      if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
      return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
    } catch (error) {
      return '';
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Navigate to approval page
  const handleApprovalClick = () => {
    navigate('/admin/approvals');
    setIsOpen(false);
  };

  // Mark all notifications as read
  const handleMarkAllRead = () => {
    if (typeof markAllAsRead === 'function') {
      markAllAsRead();
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-white focus:outline-none"
        aria-label="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        
        {pendingApprovals > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {pendingApprovals > 9 ? '9+' : pendingApprovals}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-black/80 backdrop-blur-xl rounded-lg shadow-lg z-50 border border-white/20 overflow-hidden">
          <div className="p-2 border-b border-white/20 flex justify-between items-center">
            <h3 className="text-white font-bold">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Pending approvals section */}
          {pendingApprovals > 0 && (
            <div 
              className="p-3 border-b border-white/10 bg-blue-900/40 cursor-pointer hover:bg-blue-900/60"
              onClick={handleApprovalClick}
            >
              <div className="flex items-center">
                <div className="bg-red-500 rounded-full p-1 mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-white font-semibold">
                    {pendingApprovals} user{pendingApprovals !== 1 ? 's' : ''} pending approval
                  </p>
                  <p className="text-xs text-white/60">Click to review</p>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {pendingApprovals === 0 && (
            <div className="p-4 text-center text-white/60">
              No notifications to display
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell; 