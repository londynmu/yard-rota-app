import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  BarChart2,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarFold,
  CheckSquare,
  ChevronRight,
  CircleCheck,
  Cog,
  Compass,
  Gauge,
  House,
  LineChart,
  ListChecks,
  ListTodo,
  MapPin,
  Medal,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Timer,
  Truck,
  Users2,
  Wrench,
} from 'lucide-react';
import { ADMIN_NAV, NAV_TONES, findNavGroupId, isAppPath } from '../../config/adminNav';

const ICONS = {
  app: Compass,
  'main-page': House,
  'my-rota': CalendarDays,
  'my-performance': Activity,
  precheck: ListChecks,
  vmu: Wrench,
  dashboard: Gauge,
  people: Users2,
  planning: CalendarFold,
  yard: Truck,
  insights: BarChart2,
  settings: Cog,
  users: Users2,
  approvals: CircleCheck,
  availability: CalendarClock,
  'shunter-month': Medal,
  'rota-planner': CalendarFold,
  breaks: Timer,
  tugs: Truck,
  prechecks: CheckSquare,
  'check-items': ListTodo,
  'induction-guide': BookOpen,
  performance: BarChart2,
  stats: LineChart,
  locations: MapPin,
  agencies: Building2,
  'home-page': House,
  'rota-settings': CalendarFold,
  'vmu-alerts': Wrench,
  whatsapp: MessageCircle,
};

/** Idle icons stay slate; active/badge keep category tone (quieter chrome). */
function toneOf(name) {
  const base = NAV_TONES[name] || NAV_TONES.sky;
  return {
    ...base,
    icon: 'text-slate-500',
    idle: 'text-slate-600 hover:bg-slate-50/90',
  };
}

const ROW =
  'flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors duration-200';
const CHILD_ROW =
  'flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors duration-200';

export default function AdminSidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onNavigate,
  onCloseMobile,
  activeSection,
  settingsTab,
  pendingApprovals,
  shunterIncomplete,
}) {
  const location = useLocation();
  const [isNarrow, setIsNarrow] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  ));
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!mobileOpen || !onCloseMobile) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onCloseMobile();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);

  const expanded = mobileOpen || !collapsed;
  const hideMobileDrawerFromA11y = isNarrow && !mobileOpen;
  const childIsActive = (child) => (
    child.to
      ? isAppPath(location.pathname, child.to)
      : child.section === activeSection && (!child.settingsTab || child.settingsTab === settingsTab)
  );
  const [openGroups, setOpenGroups] = useState(() => {
    const current = findNavGroupId(activeSection, settingsTab);
    return current ? { [current]: true } : {};
  });

  useEffect(() => {
    const current = findNavGroupId(activeSection);
    const routeGroup = ADMIN_NAV.find((item) => item.children?.some(
      (child) => child.to && isAppPath(location.pathname, child.to),
    ));
    const groupId = routeGroup?.id || current;
    if (!groupId) return;
    setOpenGroups((prev) => (prev[groupId] ? prev : { ...prev, [groupId]: true }));
  }, [activeSection, location.pathname]);

  const badgeCount = (key) => {
    if (key === 'approvals') return pendingApprovals || 0;
    if (key === 'shunter' && shunterIncomplete) return 1;
    return 0;
  };

  const go = (item) => {
    onNavigate({
      section: item.section,
      settingsTab: item.settingsTab || null,
    });
  };

  const toggleGroup = (group) => {
    if (!expanded) {
      onToggleCollapsed(false);
      setOpenGroups((prev) => ({ ...prev, [group.id]: true }));
      return;
    }
    setOpenGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }));
  };

  const collapseLabel = collapsed && !mobileOpen ? 'Expand menu' : 'Collapse menu';

  return (
    <aside
      id="admin-sidebar"
      aria-hidden={hideMobileDrawerFromA11y ? true : undefined}
      inert={hideMobileDrawerFromA11y ? true : undefined}
      className={`fixed left-0 bottom-0 z-50 flex flex-col border-r border-slate-200/80 bg-white/95 transition-[width,transform] duration-200 motion-reduce:transition-none ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      } ${expanded ? 'w-64' : 'w-16'} ${hideMobileDrawerFromA11y ? 'invisible pointer-events-none' : ''}`}
      style={{ top: 'var(--app-header-offset, 4rem)' }}
    >
      <nav aria-label="Admin" className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {ADMIN_NAV.map((item) => {
          const Icon = ICONS[item.icon] || Gauge;
          const tone = toneOf(item.tone);
          const activeTone = NAV_TONES[item.tone] || NAV_TONES.sky;
          const childActive = item.children?.some((child) => childIsActive(child));
          const selfActive = !item.children && item.section === activeSection;
          const open = Boolean(openGroups[item.id]);
          const panelId = `admin-nav-${item.id}`;

          if (!item.children) {
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                aria-current={selfActive ? 'true' : undefined}
                onClick={() => go(item)}
                className={`${ROW} ${
                  selfActive ? activeTone.active : `border border-transparent ${tone.idle}`
                } ${expanded ? '' : 'justify-center'}`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${selfActive ? activeTone.icon : tone.icon}`} strokeWidth={1.75} aria-hidden />
                {expanded && <span className="truncate font-medium">{item.label}</span>}
              </button>
            );
          }

          return (
            <div key={item.id}>
              <button
                type="button"
                title={item.label}
                aria-label={item.label}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggleGroup(item)}
                className={`${ROW} ${
                  childActive && !open ? activeTone.active : `border border-transparent ${tone.idle}`
                } ${expanded ? '' : 'justify-center'}`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${childActive && !open ? activeTone.icon : tone.icon}`}
                  strokeWidth={1.75}
                  aria-hidden
                />
                {expanded && (
                  <>
                    <span className="min-w-0 flex-1 truncate text-left font-medium">{item.label}</span>
                    <ChevronRight
                      className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
                      aria-hidden
                    />
                  </>
                )}
              </button>
              {expanded && open && (
                <div id={panelId} role="group" aria-label={item.label} className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-200/80 pl-2">
                  {item.children.map((child) => {
                    const childTone = NAV_TONES[child.tone] || NAV_TONES.sky;
                    const ChildIcon = ICONS[child.id] || Gauge;
                    const active = childIsActive(child);
                    const count = badgeCount(child.badge);
                    const className = `${CHILD_ROW} ${
                      active ? childTone.active : `border border-transparent ${tone.idle}`
                    }`;
                    const badgeLabel = count > 0
                      ? `${child.label}, ${count} pending`
                      : child.label;
                    const inner = (
                      <>
                        <ChildIcon
                          className={`h-3.5 w-3.5 shrink-0 ${active ? childTone.icon : 'text-slate-500'}`}
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">{child.label}</span>
                        {count > 0 && (
                          <span className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800" aria-hidden>
                            {count}
                          </span>
                        )}
                      </>
                    );
                    if (child.to) {
                      return (
                        <Link
                          key={child.id}
                          to={child.to}
                          onClick={onCloseMobile}
                          aria-label={badgeLabel}
                          aria-current={active ? 'page' : undefined}
                          className={className}
                        >
                          {inner}
                        </Link>
                      );
                    }
                    return (
                      <button
                        key={child.id}
                        type="button"
                        aria-label={badgeLabel}
                        aria-current={active ? 'true' : undefined}
                        onClick={() => go(child)}
                        className={className}
                      >
                        {inner}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-slate-200/80 p-2">
        <button
          type="button"
          onClick={() => onToggleCollapsed(!collapsed)}
          className={`${ROW} justify-center border border-slate-200/80 text-xs font-medium text-slate-500 hover:bg-slate-50`}
          title={collapseLabel}
          aria-label={collapseLabel}
          aria-pressed={!collapsed || mobileOpen}
        >
          {collapsed && !mobileOpen ? (
            <PanelLeftOpen className="h-4 w-4 text-sky-500" strokeWidth={1.75} aria-hidden />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 text-sky-500" strokeWidth={1.75} aria-hidden />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

AdminSidebar.propTypes = {
  collapsed: PropTypes.bool.isRequired,
  onToggleCollapsed: PropTypes.func.isRequired,
  mobileOpen: PropTypes.bool.isRequired,
  onNavigate: PropTypes.func.isRequired,
  onCloseMobile: PropTypes.func,
  activeSection: PropTypes.string.isRequired,
  settingsTab: PropTypes.string.isRequired,
  pendingApprovals: PropTypes.number,
  shunterIncomplete: PropTypes.bool,
};

AdminSidebar.defaultProps = {
  onCloseMobile: undefined,
  pendingApprovals: 0,
  shunterIncomplete: false,
};
