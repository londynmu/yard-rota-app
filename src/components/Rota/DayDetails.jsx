import React from 'react';
import PropTypes from 'prop-types';
import { sortSlotsByTime, formatTime } from '../../utils/rotaHelpers';

/**
 * DayDetails Component
 * Displays shifts for a specific day, grouped by shift type
 */
function DayDetails({ dateStr, dailyRotaData, currentUserId }) {
  const daySlots = (dailyRotaData[dateStr] || []).filter(slot => slot.profiles);
  
  // Apply sorting function to ensure employees are properly sorted
  const sortedSlots = sortSlotsByTime(daySlots);
  
  const slotsByShiftType = {
    day: sortedSlots.filter(s => s.shift_type === 'day'),
    afternoon: sortedSlots.filter(s => s.shift_type === 'afternoon'),
    night: sortedSlots.filter(s => s.shift_type === 'night')
  };

  if (daySlots.length === 0) {
    return (
      <div className="p-4 text-center bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-600 text-sm">No shifts scheduled for this day</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-2">
      {Object.entries(slotsByShiftType).map(([shiftType, slots]) => {
        if (slots.length === 0) return null;
        
        // Different styling based on shift type
        const shiftConfig = {
          day: {
            title: "DAY SHIFT",
            bgColor: "bg-amber-100",
            textColor: "text-amber-800",
            borderColor: "border-amber-200",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
              </svg>
            )
          },
          afternoon: {
            title: "AFTERNOON SHIFT",
            bgColor: "bg-orange-100",
            textColor: "text-orange-800",
            borderColor: "border-orange-200",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )
          },
          night: {
            title: "NIGHT SHIFT",
            bgColor: "bg-blue-100",
            textColor: "text-blue-800",
            borderColor: "border-blue-200",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )
          }
        };

        const config = shiftConfig[shiftType];
        
        return (
          <div key={shiftType} className="mt-3 first:mt-0">
            <div className={`${config.bgColor} ${config.textColor} px-3 py-1.5 flex items-center justify-between rounded-md`}>
              <div className="flex items-center space-x-2">
                {config.icon}
                <h4 className="text-sm md:text-xs font-bold uppercase">{config.title}</h4>
              </div>
              <span className="bg-white text-charcoal text-xs px-2 py-0.5 rounded-full border border-gray-300">{slots.length}</span>
            </div>
            
            <ul className="divide-y divide-gray-200 bg-white rounded-md">
              {slots.map((slot) => {
                const isCurrentUser = slot.user_id === currentUserId;
                return (
                  <li 
                    key={slot.id}
                    className={`p-2 md:p-2 transition-colors ${isCurrentUser ? 'bg-amber-50 border-l-2 border-l-amber-500' : 'hover:bg-gray-50'}`}
                  >
                    <div className="flex flex-col">
                      <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                        <div className="text-wrap break-words max-w-full">
                          <span className={`text-[15px] md:text-base font-bold ${isCurrentUser ? 'text-amber-700' : 'text-charcoal'}`}>
                            {slot.profiles?.first_name || ''} {slot.profiles?.last_name || 'Unknown User'}
                          </span>
                          {isCurrentUser && (
                            <span className="ml-2 text-[10px] bg-amber-500 text-charcoal px-1.5 py-0.5 rounded-full uppercase font-bold">
                              You
                            </span>
                          )}
                        </div>
                        
                        {(() => {
                          const getStartBadgeStyle = (type) => {
                            switch (type) {
                              case 'day':
                                return { container: 'bg-amber-50 border-amber-300 text-amber-800', icon: 'text-amber-600' };
                              case 'afternoon':
                                return { container: 'bg-orange-50 border-orange-300 text-orange-800', icon: 'text-orange-600' };
                              case 'night':
                                return { container: 'bg-blue-50 border-blue-300 text-blue-800', icon: 'text-blue-600' };
                              default:
                                return { container: 'bg-white border-gray-300 text-charcoal', icon: 'text-gray-600' };
                            }
                          };
                          
                          const style = getStartBadgeStyle(slot.shift_type);
                          return (
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold border ${style.container}`}>
                              {slot.shift_type === 'day' ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-1.5 ${style.icon}`} viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-1.5 ${style.icon}`} viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                                </svg>
                              )}
                              <span className="leading-none">{formatTime(slot.start_time)}</span>
                            </span>
                          );
                        })()}
                      </div>
                      
                      {/* Task Indicator */}
                      {slot.task && (
                        <span className="inline-flex items-center text-xs text-red-700 bg-red-100 border border-red-300 px-2 py-0.5 rounded-full">
                          <span className="w-2 h-2 bg-red-500 rounded-full mr-1.5"></span>
                          {slot.task}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

DayDetails.propTypes = {
  dateStr: PropTypes.string.isRequired,
  dailyRotaData: PropTypes.object.isRequired,
  currentUserId: PropTypes.string
};

// Memoize component to prevent unnecessary re-renders
export default React.memo(DayDetails);
