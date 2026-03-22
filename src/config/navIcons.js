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

/** Central palette (Figma / modernization guide alignment) */
const colors = {
  primary: 'text-blue-600',
  secondary: 'text-indigo-600',
  success: 'text-emerald-600',
  info: 'text-teal-600',
  accent: 'text-cyan-600',
  warning: 'text-amber-600',
  danger: 'text-rose-600',
  violet: 'text-violet-600',
  sky: 'text-sky-600',
  slate: 'text-slate-600',
  slateStrong: 'text-slate-700',
  gold: 'text-amber-500',
};

/** Admin sidebar + Quick Actions */
export function getAdminMenuItems(pendingApprovals = 0) {
  return [
    { id: 'dashboard', label: 'Dashboard', Icon: Gauge, colorClass: colors.primary, description: 'Overview & Quick Stats' },
    { id: 'users', label: 'Users', Icon: Users2, colorClass: colors.secondary, description: 'Manage users' },
    { id: 'approvals', label: 'Approvals', Icon: CircleCheck, colorClass: colors.success, description: 'Pending approvals' },
    { id: 'availability', label: 'Availability', Icon: CalendarClock, colorClass: colors.info, description: 'User availability' },
    { id: 'rota-planner', label: 'Rota Planner', Icon: CalendarFold, colorClass: colors.accent, description: 'Plan work schedules' },
    { id: 'breaks', label: 'Breaks', Icon: Timer, colorClass: colors.warning, description: 'Manage employee breaks' },
    { id: 'attendance', label: 'Black list', Icon: UserMinus, colorClass: colors.danger, description: 'Attendance & disciplinary notes' },
    { id: 'performance', label: 'Performance', Icon: BarChart2, colorClass: colors.violet, description: 'Import performance data' },
    { id: 'stats', label: 'Activity', Icon: LineChart, colorClass: colors.sky, description: 'User activity logs & summary' },
    { id: 'tugs', label: 'Tugs', Icon: Truck, colorClass: colors.primary, description: 'Manage tug fleet & QR codes' },
    { id: 'prechecks', label: 'PreChecks', Icon: CheckSquare, colorClass: colors.success, description: 'Tug inspection reports' },
    { id: 'check-items', label: 'Check Items', Icon: ListTodo, colorClass: colors.info, description: 'Manage checklist & tooltips' },
    { id: 'shunter-month', label: 'Shunter of the Month', Icon: Medal, colorClass: colors.gold, description: 'Monthly Day & Night awards' },
    { id: 'settings', label: 'Settings', Icon: Cog, colorClass: colors.slate, description: 'Locations & Agencies' },
  ].map((item) => ({
    ...item,
    badge: item.id === 'approvals' ? pendingApprovals : undefined,
  }));
}

/** Main app nav links */
export const mainNavConfig = [
  { path: '/calendar', label: 'Main Page', shortLabel: 'Home', Icon: Home, colorClass: colors.primary },
  { path: '/my-rota', label: 'My Rota', shortLabel: 'My Rota', Icon: CalendarDays, colorClass: colors.info },
  { path: '/performance', label: 'Performance', shortLabel: 'Stats', Icon: Activity, colorClass: colors.violet },
  { path: '/precheck', label: 'PreCheck', shortLabel: 'PreCheck', Icon: ListChecks, colorClass: colors.success },
  { path: '/vmu', label: 'VMU', shortLabel: 'VMU', Icon: Wrench, colorClass: colors.slate },
  { path: '/vmu/prechecks', label: 'PreChecks', shortLabel: 'PreChecks', Icon: ListChecks, colorClass: colors.success },
  { path: '/admin', label: 'Admin Panel', shortLabel: 'Admin', Icon: Shield, colorClass: colors.slateStrong },
  { path: '/transport-dashboard', label: 'Dashboard', shortLabel: 'Dashboard', Icon: Gauge, colorClass: colors.slateStrong },
  { path: '/profile', label: 'Profile', shortLabel: 'Profile', Icon: UserCircle2, colorClass: colors.secondary },
];

export { sizeClass };
