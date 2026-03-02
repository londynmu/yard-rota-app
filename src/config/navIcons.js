/**
 * Shared nav icon config: Lucide icons + Tailwind color classes.
 * Thin stroke (1.25) + animated via NavIcon. Used by AdminPage and HomePage.
 */
import {
  Gauge,
  Users2,
  CircleCheck,
  CalendarClock,
  CalendarFold,
  Timer,
  UserMinus,
  BarChart2,
  LineChart,
  Truck,
  CheckSquare,
  ListTodo,
  Medal,
  Cog,
  Home,
  CalendarDays,
  Activity,
  ListChecks,
  Wrench,
  Shield,
  UserCircle2,
} from 'lucide-react';

const sizeClass = 'w-6 h-6 flex-shrink-0';

/** Admin sidebar + Quick Actions */
export function getAdminMenuItems(pendingApprovals = 0) {
  return [
    { id: 'dashboard', label: 'Dashboard', Icon: Gauge, colorClass: 'text-blue-600', description: 'Overview & Quick Stats' },
    { id: 'users', label: 'Users', Icon: Users2, colorClass: 'text-indigo-600', description: 'Manage users' },
    { id: 'approvals', label: 'Approvals', Icon: CircleCheck, colorClass: 'text-emerald-600', description: 'Pending approvals' },
    { id: 'availability', label: 'Availability', Icon: CalendarClock, colorClass: 'text-teal-600', description: 'User availability' },
    { id: 'rota-planner', label: 'Rota Planner', Icon: CalendarFold, colorClass: 'text-cyan-600', description: 'Plan work schedules' },
    { id: 'breaks', label: 'Breaks', Icon: Timer, colorClass: 'text-amber-600', description: 'Manage employee breaks' },
    { id: 'attendance', label: 'Black list', Icon: UserMinus, colorClass: 'text-rose-600', description: 'Attendance & disciplinary notes' },
    { id: 'performance', label: 'Performance', Icon: BarChart2, colorClass: 'text-violet-600', description: 'Import performance data' },
    { id: 'stats', label: 'Statistics', Icon: LineChart, colorClass: 'text-sky-600', description: 'Login & activity stats' },
    { id: 'tugs', label: 'Tugs', Icon: Truck, colorClass: 'text-blue-600', description: 'Manage tug fleet & QR codes' },
    { id: 'prechecks', label: 'PreChecks', Icon: CheckSquare, colorClass: 'text-emerald-600', description: 'Tug inspection reports' },
    { id: 'check-items', label: 'Check Items', Icon: ListTodo, colorClass: 'text-teal-600', description: 'Manage checklist & tooltips' },
    { id: 'shunter-month', label: 'Shunter of the Month', Icon: Medal, colorClass: 'text-amber-500', description: 'Monthly Day & Night awards' },
    { id: 'settings', label: 'Settings', Icon: Cog, colorClass: 'text-slate-600', description: 'Locations & Agencies' },
  ].map((item) => ({
    ...item,
    badge: item.id === 'approvals' ? pendingApprovals : undefined,
  }));
}

/** Main app nav links */
export const mainNavConfig = [
  { path: '/calendar', label: 'Main Page', shortLabel: 'Home', Icon: Home, colorClass: 'text-blue-600' },
  { path: '/my-rota', label: 'My Rota', shortLabel: 'My Rota', Icon: CalendarDays, colorClass: 'text-teal-600' },
  { path: '/performance', label: 'Performance', shortLabel: 'Stats', Icon: Activity, colorClass: 'text-violet-600' },
  { path: '/precheck', label: 'PreCheck', shortLabel: 'PreCheck', Icon: ListChecks, colorClass: 'text-emerald-600' },
  { path: '/vmu', label: 'VMU', shortLabel: 'VMU', Icon: Wrench, colorClass: 'text-slate-600' },
  { path: '/vmu/prechecks', label: 'PreChecks', shortLabel: 'PreChecks', Icon: ListChecks, colorClass: 'text-emerald-600' },
  { path: '/admin', label: 'Admin Panel', shortLabel: 'Admin', Icon: Shield, colorClass: 'text-slate-700' },
  { path: '/profile', label: 'Profile', shortLabel: 'Profile', Icon: UserCircle2, colorClass: 'text-indigo-600' },
];

export { sizeClass };
