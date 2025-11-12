import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const TimePicker = ({ onClose, onSelectTime, initialTime = '08:00' }) => {
  const [selectedHour, setSelectedHour] = useState(initialTime.split(':')[0]);
  const [selectedMinute, setSelectedMinute] = useState(initialTime.split(':')[1]);
  
  // Refs do kontenerów przewijanych
  const hoursContainerRef = useRef(null);
  const minutesContainerRef = useRef(null);
  
  // Refs do aktualnie wybranych elementów
  const selectedHourRef = useRef(null);
  const selectedMinuteRef = useRef(null);
  
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
  
  // Przewijanie do aktualnie wybranej godziny i minuty po otwarciu
  useEffect(() => {
    // Dajemy krótkie opóźnienie, aby DOM miał czas się wyrenderować
    const timer = setTimeout(() => {
      if (selectedHourRef.current && hoursContainerRef.current) {
        selectedHourRef.current.scrollIntoView({
          behavior: 'auto',
          block: 'center'
        });
      }
      
      if (selectedMinuteRef.current && minutesContainerRef.current) {
        selectedMinuteRef.current.scrollIntoView({
          behavior: 'auto',
          block: 'center'
        });
      }
    }, 50);
    
    return () => clearTimeout(timer);
  }, []);
  
  const handleConfirm = () => {
    onSelectTime(`${selectedHour}:${selectedMinute}`);
  };
  
  const modalContent = (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]">
      <div className="bg-white border border-gray-200 rounded-lg max-w-md w-[95%] m-4 shadow-lg">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-xl font-medium text-charcoal">Select Time</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-charcoal"
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
                <span className="text-gray-600 mb-2">Hour</span>
                <div 
                  ref={hoursContainerRef}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-2 h-48 overflow-y-auto w-20"
                >
                  {hours.map(hour => (
                    <button
                      key={hour}
                      ref={selectedHour === hour ? selectedHourRef : null}
                      className={`w-full text-center py-2 rounded-md mb-1 ${
                        selectedHour === hour 
                          ? 'bg-blue-500 text-white border-2 border-blue-600' 
                          : 'hover:bg-gray-100 text-charcoal'
                      }`}
                      onClick={() => setSelectedHour(hour)}
                    >
                      {hour}
                    </button>
                  ))}
                </div>
              </div>
              
              <span className="text-3xl font-bold text-charcoal">:</span>
              
              {/* Minute selector */}
              <div className="flex flex-col items-center">
                <span className="text-gray-600 mb-2">Minute</span>
                <div 
                  ref={minutesContainerRef}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-2 h-48 w-20"
                >
                  {minutes.map(minute => (
                    <button
                      key={minute}
                      ref={selectedMinute === minute ? selectedMinuteRef : null}
                      className={`w-full text-center py-2 rounded-md mb-1 ${
                        selectedMinute === minute 
                          ? 'bg-blue-500 text-white border-2 border-blue-600' 
                          : 'hover:bg-gray-100 text-charcoal'
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
              <div className="text-center font-bold text-xl mb-4 text-charcoal">
                {selectedHour}:{selectedMinute}
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 border-2 border-black rounded-lg text-charcoal bg-transparent hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 px-4 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
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