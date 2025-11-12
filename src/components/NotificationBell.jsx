import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../lib/NotificationContext';
import { useNavigate } from 'react-router-dom';

const NotificationBell = () => {
  // Use default values to prevent errors if context is not available
  const { unreadCount = 0, pendingApprovals = 0, markAllAsRead } = useNotifications() || {};
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

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
        className="relative p-2 text-charcoal hover:bg-gray-100 rounded-lg focus:outline-none"
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
        <div className="fixed md:absolute right-0 left-0 md:left-auto top-16 md:top-auto md:mt-1 w-full md:w-80 bg-white rounded-none md:rounded-lg shadow-lg z-50 border-t md:border border-gray-200 overflow-hidden md:max-w-xs mx-auto md:mx-0">
          <div className="p-3 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-charcoal font-bold">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Pending approvals section */}
          {pendingApprovals > 0 && (
            <div 
              className="p-3 border-b border-gray-200 bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors"
              onClick={handleApprovalClick}
            >
              <div className="flex items-center">
                <div className="bg-red-500 rounded-full p-1 mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-charcoal font-semibold">
                    {pendingApprovals} user{pendingApprovals !== 1 ? 's' : ''} pending approval
                  </p>
                  <p className="text-xs text-gray-600">Click to review</p>
                </div>
              </div>
            </div>
          )}

          {/* Notification navigation arrows */}
          {pendingApprovals === 0 && (
            <div className="flex items-center justify-between py-3 px-4 border-b border-gray-200">
              <button className="text-gray-600 hover:text-charcoal">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="text-center text-gray-600 text-sm font-medium">
                May 2024
              </div>
              <button className="text-gray-600 hover:text-charcoal">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}

          {/* Empty state */}
          {pendingApprovals === 0 && (
            <div className="p-6 text-center">
              <p className="text-gray-600 text-sm font-medium">No notifications to display</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell; 