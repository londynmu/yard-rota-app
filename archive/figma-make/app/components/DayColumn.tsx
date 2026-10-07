import { ShiftCard } from './ShiftCard';

interface Employee {
  name: string;
  id: string;
}

interface Shift {
  timeRange: string;
  assigned: number;
  needed: number;
  employees: Employee[];
  isEmpty?: boolean;
}

interface DayColumnProps {
  dayName: string;
  date: string;
  shifts: Shift[];
  isToday?: boolean;
}

export function DayColumn({ dayName, date, shifts, isToday }: DayColumnProps) {
  return (
    <div className="min-w-[280px] flex-shrink-0">
      {/* Day Header */}
      <div className={`rounded-t-xl p-4 text-center mb-4 ${
        isToday 
          ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md' 
          : 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-800'
      }`}>
        <div className="text-sm font-medium uppercase tracking-wide opacity-90">
          {dayName}
        </div>
        <div className="text-xl font-bold mt-1">
          {date}
        </div>
      </div>

      {/* Shifts */}
      <div className="space-y-4">
        {shifts.map((shift, index) => (
          <ShiftCard key={index} {...shift} />
        ))}
      </div>
    </div>
  );
}
