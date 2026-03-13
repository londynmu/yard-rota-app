import { Edit2, Trash2, AlertCircle, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

interface Employee {
  name: string;
  id: string;
}

interface ShiftCardProps {
  timeRange: string;
  assigned: number;
  needed: number;
  employees: Employee[];
  isEmpty?: boolean;
}

export function ShiftCard({ timeRange, assigned, needed, employees, isEmpty }: ShiftCardProps) {
  const ratio = assigned / needed;
  
  // Determine status and styling
  const getStatusColor = () => {
    if (isEmpty) return 'border-red-400 bg-red-50/50';
    if (ratio >= 1) return 'border-emerald-400 bg-emerald-50/30';
    if (ratio >= 0.5) return 'border-amber-400 bg-amber-50/30';
    return 'border-orange-400 bg-orange-50/30';
  };

  const getRatioBadgeColor = () => {
    if (isEmpty) return 'bg-red-100 text-red-700 border-red-300';
    if (ratio >= 1) return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    if (ratio >= 0.5) return 'bg-amber-100 text-amber-700 border-amber-300';
    return 'bg-orange-100 text-orange-700 border-orange-300';
  };

  return (
    <div className={`relative rounded-xl border-2 ${getStatusColor()} p-4 transition-all hover:shadow-lg hover:-translate-y-0.5`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3 gap-3">
        <span className="text-lg font-semibold text-gray-900">{timeRange}</span>
        <Badge variant="outline" className={`${getRatioBadgeColor()} border font-semibold shrink-0`}>
          {assigned}/{needed}
        </Badge>
      </div>

      {/* Employees or Empty State */}
      {isEmpty ? (
        <div className="flex items-center gap-2 py-4 text-red-600">
          <AlertCircle className="size-5" />
          <span className="font-medium">No employees assigned</span>
        </div>
      ) : (
        <div className="space-y-1.5 mb-4">
          {employees.map((employee) => (
            <div key={employee.id} className="flex items-center gap-2 text-sm">
              <div className="size-2 rounded-full bg-blue-500"></div>
              <span className="text-gray-700">{employee.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-3 border-t border-gray-200">
        <Button 
          variant="ghost" 
          size="sm" 
          className="flex-1 hover:bg-blue-50 hover:text-blue-700"
        >
          <Edit2 className="size-4 mr-1.5" />
          Edit
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          className="flex-1 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 className="size-4 mr-1.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}