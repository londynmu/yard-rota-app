import React, { useLayoutEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import CalendarGrid from '../components/Calendar/CalendarGrid';
import CalendarMonthHeader from '../components/Home/CalendarMonthHeader';
import AvailabilityOverlays from '../components/Home/AvailabilityOverlays';
import BreaksPanel from '../components/Home/BreaksPanel';
import ManageBreaksLink from '../components/Home/ManageBreaksLink';
import TodayShiftSummaryCard from '../components/Home/TodayShiftSummaryCard';
import { useNotifications } from '../lib/NotificationContext';
import { getAdminMenuItems } from '../config/navIcons';
import NavIcon from '../components/NavIcon';
import { useAvailabilityEditor } from '../hooks/useAvailabilityEditor';
import { useBreaksFilters } from '../hooks/useBreaksFilters';
import { useTodayShiftSummary } from '../hooks/useTodayShiftSummary';

const ADMIN_QUICK_LINK_IDS = ['users', 'approvals', 'rota-planner', 'breaks', 'prechecks'];

/** Desktop main page: break list, calendar and today's yard summary side by side. */
export default function CalendarPage({ desktopBelowCalendar = null }) {
  const { isAdmin } = useNotifications();
  const navigate = useNavigate();
  const editor = useAvailabilityEditor();
  const filters = useBreaksFilters();
  const todayShiftSummary = useTodayShiftSummary(filters.selectedLocation);
  const scrollContainerRef = useRef(null);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (typeof document !== 'undefined') {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = 0;
  }, []);

  const adminQuickLinks = getAdminMenuItems(0).filter((item) => ADMIN_QUICK_LINK_IDS.includes(item.id));
  const desktopCards = React.Children.toArray(
    React.isValidElement(desktopBelowCalendar) ? desktopBelowCalendar.props?.children : desktopBelowCalendar
  );

  const renderAdminQuickNav = () => (
    isAdmin ? (
      <div className="card-modern p-2 flex-shrink-0">
        <div className="grid grid-cols-1 gap-1">
          {adminQuickLinks.map((item) => (
            <Link
              key={item.id}
              to="/admin"
              onClick={() => localStorage.setItem('adminActiveSection', item.id)}
              className="flex items-center gap-2 px-2 py-1.5 bg-gradient-to-r from-slate-50 via-teal-50/40 to-slate-50 border border-slate-200/60 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 text-left group"
            >
              <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/90 border border-slate-200/60 shadow-sm transition-transform group-hover:scale-105 shrink-0">
                <NavIcon Icon={item.Icon} colorClass={item.colorClass} size="small" animate={true} />
              </div>
              <h3 className="flex-1 min-w-0 font-medium text-xs text-charcoal truncate">
                {item.label}
              </h3>
              <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      </div>
    ) : null
  );

  const renderShunterStats = () => (
    <TodayShiftSummaryCard summary={todayShiftSummary} location={filters.selectedLocation} embedded>
      {desktopCards.map((card, index) => (
        <React.Fragment key={index}>
          {React.isValidElement(card) ? React.cloneElement(card, { embedded: true }) : card}
        </React.Fragment>
      ))}
    </TodayShiftSummaryCard>
  );

  return (
    <>
      <div
        ref={scrollContainerRef}
        className="h-full overflow-y-auto bg-transparent px-4 py-6 md:px-6 pb-6"
      >
        <div className="page-content-inner-desktop-wide">
          {editor.errorMessage && (
            <div className="mb-4 p-3 bg-rota-alert-error-bg text-rota-alert-error-text border border-rota-alert-error-border rounded-xl shadow-sm">
              {editor.errorMessage}
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-12 gap-6 items-start lg:items-stretch lg:min-h-[min(32rem,calc(100vh-9rem))]">
            <div className="min-w-0 min-h-0 flex flex-col max-h-[min(32rem,calc(100vh-9rem))] overflow-hidden lg:col-span-4 lg:row-span-2 lg:h-0 lg:max-h-none lg:min-h-full">
              <div
                className={`card-modern p-4 md:p-5 flex flex-col h-full min-h-0 overflow-hidden ${isAdmin ? 'cursor-pointer' : ''}`}
                onClick={isAdmin ? () => navigate('/brakes') : undefined}
                onKeyDown={
                  isAdmin
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          navigate('/brakes');
                        }
                      }
                    : undefined
                }
                role={isAdmin ? 'link' : undefined}
                tabIndex={isAdmin ? 0 : undefined}
                aria-label={isAdmin ? 'Open break planner' : undefined}
              >
                {filters.showManageBreaksButton && (
                  <div className="w-full mb-4 flex-shrink-0" onClick={(event) => event.stopPropagation()}>
                    <ManageBreaksLink />
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                  <BreaksPanel filters={filters} fullWidthFilters isolateFilterClicks />
                </div>
              </div>
            </div>

            <div className="min-w-0 min-h-0 flex flex-col lg:col-span-4 lg:row-span-2 lg:h-0 lg:min-h-full">
              <div className="card-modern p-3 h-full flex flex-col">
                <CalendarMonthHeader
                  currentDate={editor.currentDate}
                  onPrevious={editor.handlePreviousMonth}
                  onNext={editor.handleNextMonth}
                  compact
                />

                <CalendarGrid
                  currentDate={editor.currentDate}
                  dayData={editor.dayData}
                  onDayClick={editor.handleDayClick}
                  isLoading={editor.loading}
                  density="compact"
                />
              </div>

              <div className="lg:hidden mt-3 flex flex-col gap-2">
                {renderShunterStats()}
                {renderAdminQuickNav()}
              </div>
            </div>

            <div className="hidden lg:flex lg:col-span-4 lg:row-span-2 min-h-0 flex-col gap-3">
              {renderShunterStats()}
              {renderAdminQuickNav()}
            </div>
          </div>
        </div>
      </div>

      <AvailabilityOverlays editor={editor} />
    </>
  );
}

CalendarPage.propTypes = {
  desktopBelowCalendar: PropTypes.node,
};
