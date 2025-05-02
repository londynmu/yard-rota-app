import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const TimePicker = ({ onClose, onSelectTime, initialTime = '08:00' }) => {
  const [selectedHour, setSelectedHour] = useState(initialTime.split(':')[0]);
  const [selectedMinute, setSelectedMinute] = useState(initialTime.split(':')[1]);
  
  // Available hours (00-23)
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  
  // Available minutes (00, 15, 30, 45)
  const minutes = ['00', '15', '30', '45'];
  
  // Prevent body scrolling when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);
  
  const handleConfirm = () => {
    onSelectTime(`${selectedHour}:${selectedMinute}`);
  };
  
  const modalContent = (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]">
      <div className="bg-black/80 border border-white/30 rounded-lg max-w-md w-[95%] m-4">
        <div className="p-4 border-b border-white/20 flex justify-between items-center">
          <h3 className="text-xl font-medium text-white">Select Time</h3>
          <button 
            onClick={onClose}
            className="text-white/70 hover:text-white"
          >
            <span className="sr-only">Close</span>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-4">
          <div className="flex flex-col items-center">
            <div className="flex justify-center items-center space-x-4 mb-6">
              {/* Hour selector */}
              <div className="flex flex-col items-center">
                <span className="text-white/70 mb-2">Hour</span>
                <div className="bg-black/50 border border-white/20 rounded-lg p-2 h-48 overflow-y-auto w-20">
                  {hours.map(hour => (
                    <button
                      key={hour}
                      className={`w-full text-center py-2 rounded-md mb-1 ${
                        selectedHour === hour 
                          ? 'bg-blue-600/50 text-white border border-blue-400/30' 
                          : 'hover:bg-white/10 text-white'
                      }`}
                      onClick={() => setSelectedHour(hour)}
                    >
                      {hour}
                    </button>
                  ))}
                </div>
              </div>
              
              <span className="text-3xl font-bold text-white">:</span>
              
              {/* Minute selector */}
              <div className="flex flex-col items-center">
                <span className="text-white/70 mb-2">Minute</span>
                <div className="bg-black/50 border border-white/20 rounded-lg p-2 h-48 w-20">
                  {minutes.map(minute => (
                    <button
                      key={minute}
                      className={`w-full text-center py-2 rounded-md mb-1 ${
                        selectedMinute === minute 
                          ? 'bg-blue-600/50 text-white border border-blue-400/30' 
                          : 'hover:bg-white/10 text-white'
                      }`}
                      onClick={() => setSelectedMinute(minute)}
                    >
                      {minute}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="mt-4 w-full">
              <div className="text-center font-bold text-xl mb-4 text-white">
                {selectedHour}:{selectedMinute}
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 border border-white/20 rounded-md text-white hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 px-4 py-3 bg-blue-600/30 border border-blue-400/30 rounded-md text-white hover:bg-blue-600/40 transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default TimePicker; 