/**
 * Admin sidebar groups. Each item has a soft tone used for its icon and active state.
 * Settings children map to SettingsManager tabs.
 */

export const NAV_TONES = {
  sky: {
    icon: 'text-sky-500',
    idle: 'text-slate-600 hover:bg-sky-50/70',
    active: 'border border-sky-100 bg-sky-50 text-sky-900',
    dot: 'bg-sky-400',
  },
  blue: {
    icon: 'text-blue-500',
    idle: 'text-slate-600 hover:bg-blue-50/70',
    active: 'border border-blue-100 bg-blue-50 text-blue-900',
    dot: 'bg-blue-400',
  },
  teal: {
    icon: 'text-teal-500',
    idle: 'text-slate-600 hover:bg-teal-50/70',
    active: 'border border-teal-100 bg-teal-50 text-teal-900',
    dot: 'bg-teal-400',
  },
  emerald: {
    icon: 'text-emerald-500',
    idle: 'text-slate-600 hover:bg-emerald-50/70',
    active: 'border border-emerald-100 bg-emerald-50 text-emerald-900',
    dot: 'bg-emerald-400',
  },
  amber: {
    icon: 'text-amber-500',
    idle: 'text-slate-600 hover:bg-amber-50/70',
    active: 'border border-amber-100 bg-amber-50 text-amber-900',
    dot: 'bg-amber-400',
  },
  rose: {
    icon: 'text-rose-400',
    idle: 'text-slate-600 hover:bg-rose-50/70',
    active: 'border border-rose-100 bg-rose-50 text-rose-900',
    dot: 'bg-rose-300',
  },
  indigo: {
    icon: 'text-indigo-500',
    idle: 'text-slate-600 hover:bg-indigo-50/70',
    active: 'border border-indigo-100 bg-indigo-50 text-indigo-900',
    dot: 'bg-indigo-400',
  },
  violet: {
    icon: 'text-violet-500',
    idle: 'text-slate-600 hover:bg-violet-50/70',
    active: 'border border-violet-100 bg-violet-50 text-violet-900',
    dot: 'bg-violet-400',
  },
  purple: {
    icon: 'text-purple-500',
    idle: 'text-slate-600 hover:bg-purple-50/70',
    active: 'border border-purple-100 bg-purple-50 text-purple-900',
    dot: 'bg-purple-400',
  },
  cyan: {
    icon: 'text-cyan-500',
    idle: 'text-slate-600 hover:bg-cyan-50/70',
    active: 'border border-cyan-100 bg-cyan-50 text-cyan-900',
    dot: 'bg-cyan-400',
  },
};

export const ADMIN_NAV = [
  {
    id: 'app',
    label: 'App',
    icon: 'app',
    tone: 'sky',
    children: [
      { id: 'main-page', label: 'Main Page', to: '/calendar', tone: 'sky' },
      { id: 'my-rota', label: 'My Rota', to: '/my-rota', tone: 'indigo' },
      { id: 'my-performance', label: 'Performance', to: '/performance', tone: 'violet' },
      { id: 'precheck', label: 'PreCheck', to: '/precheck', tone: 'emerald' },
      { id: 'vmu', label: 'VMU', to: '/vmu', tone: 'amber' },
    ],
  },
  { id: 'dashboard', label: 'Dashboard', section: 'dashboard', icon: 'dashboard', tone: 'sky' },
  {
    id: 'people',
    label: 'People',
    icon: 'people',
    tone: 'blue',
    children: [
      { id: 'users', label: 'Users', section: 'users', tone: 'blue' },
      { id: 'approvals', label: 'Approvals', section: 'approvals', tone: 'amber', badge: 'approvals' },
      { id: 'availability', label: 'Availability', section: 'availability', tone: 'teal' },
      { id: 'shunter-month', label: 'Shunter of the Month', section: 'shunter-month', tone: 'amber', badge: 'shunter' },
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    icon: 'planning',
    tone: 'indigo',
    children: [
      { id: 'rota-planner', label: 'Rota planner', section: 'rota-planner', tone: 'indigo' },
      { id: 'breaks', label: 'Breaks', section: 'breaks', tone: 'cyan' },
    ],
  },
  {
    id: 'yard',
    label: 'Yard',
    icon: 'yard',
    tone: 'emerald',
    children: [
      { id: 'tugs', label: 'Tugs', section: 'tugs', tone: 'sky' },
      { id: 'prechecks', label: 'Pre-checks', section: 'prechecks', tone: 'emerald' },
      { id: 'check-items', label: 'Check items', section: 'check-items', tone: 'violet' },
      { id: 'induction-guide', label: 'Yard guide', section: 'induction-guide', tone: 'purple' },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: 'insights',
    tone: 'violet',
    children: [
      { id: 'performance', label: 'Performance', section: 'performance', tone: 'blue' },
      { id: 'stats', label: 'Activity', section: 'stats', tone: 'purple' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    tone: 'teal',
    children: [
      { id: 'locations', label: 'Locations', section: 'settings', settingsTab: 'locations', tone: 'sky' },
      { id: 'agencies', label: 'Agencies', section: 'settings', settingsTab: 'agencies', tone: 'teal' },
      { id: 'home-page', label: 'Home page', section: 'settings', settingsTab: 'home-page', tone: 'amber' },
      { id: 'rota-settings', label: 'Rota', section: 'settings', settingsTab: 'rota', tone: 'indigo' },
      { id: 'whatsapp', label: 'WhatsApp', section: 'settings', settingsTab: 'whatsapp', tone: 'emerald' },
    ],
  },
];

export function isAppPath(pathname, to) {
  if (!pathname || !to) return false;
  if (to === '/calendar' || to === '/precheck' || to === '/vmu') {
    return pathname === to || pathname.startsWith(`${to}/`);
  }
  return pathname === to;
}

export function findNavGroupId(section) {
  if (section === 'settings') {
    return 'settings';
  }
  const group = ADMIN_NAV.find((item) => item.children?.some((child) => child.section === section));
  return group?.id || null;
}
