export default function CalendarHeader({ currentDate, onPrevMonth, onNextMonth }) {
  // Get month name and year
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const month = monthNames[currentDate.getMonth()];
  const year = currentDate.getFullYear();
  
  return (
    <div className="flex justify-between items-center mb-4 p-3 bg-gray-50 dark:bg-gray-750 shadow-md rounded-xl border border-gray-30 shadow-lg">
      <button 
        onClick={onPrevMonth}
        className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-white/50 transition-all"
        aria-label="Previous month"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      
      <h2 className="text-xl font-bold text-charcoal dark:text-white drop-shadow-sm px-4 py-2 bg-gray-100 dark:bg-gray-700 shadow-sm rounded-lg border border-gray-20">
        {month} {year}
      </h2>
      
      <button 
        onClick={onNextMonth}
        className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-white/50 transition-all"
        aria-label="Next month"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
} 