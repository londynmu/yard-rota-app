import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, CircleCheck, CircleMinus, TreePalm } from 'lucide-react';
import { addMonths, eachDayOfInterval, format, isSunday, startOfDay } from 'date-fns';
import { getUkBankHolidayName } from '../../utils/ukBankHolidays';

const AVAILABILITY_STATUSES = ['available', 'unavailable', 'holiday'];

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available', Icon: CircleCheck },
  { value: 'unavailable', label: 'Unavailable', Icon: CircleMinus },
  { value: 'holiday', label: 'Holiday', Icon: TreePalm },
];

function getOrdinalDay(day) {
  if (day >= 11 && day <= 13) {
    return `${day}th`;
  }
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function getStatusTone(status) {
  switch (status) {
    case 'available':
      return {
        pillSelected: 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm',
        pillIconSelected: 'text-emerald-700',
        cardSelected:
          'border-emerald-400 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-900 shadow-md',
        cardSaved:
          'border-emerald-300/70 bg-gradient-to-br from-emerald-50/70 to-teal-50/70 text-emerald-900',
        dayText: 'text-emerald-800',
        dayMuted: 'text-emerald-800/80',
      };
    case 'unavailable':
      return {
        pillSelected: 'border-rose-400 bg-rose-50 text-rose-800 shadow-sm',
        pillIconSelected: 'text-rose-700',
        cardSelected:
          'border-rose-400 bg-gradient-to-br from-rose-50 to-pink-50 text-rose-900 shadow-md',
        cardSaved:
          'border-rose-300/70 bg-gradient-to-br from-rose-50/70 to-pink-50/70 text-rose-900',
        dayText: 'text-rose-800',
        dayMuted: 'text-rose-800/80',
      };
    case 'holiday':
      return {
        pillSelected: 'border-blue-500 bg-sky-50 text-blue-900 shadow-sm',
        pillIconSelected: 'text-blue-700',
        cardSelected:
          'border-blue-400 bg-gradient-to-br from-blue-50 to-cyan-50 text-blue-900 shadow-md',
        cardSaved:
          'border-blue-300/70 bg-gradient-to-br from-blue-50/70 to-cyan-50/70 text-blue-900',
        dayText: 'text-blue-800',
        dayMuted: 'text-blue-800/80',
      };
    default:
      return {
        pillSelected: 'border-slate-300 bg-slate-50 text-charcoal shadow-sm',
        pillIconSelected: 'text-slate-600',
        cardSelected: 'border-slate-300 bg-white text-charcoal shadow-md',
        cardSaved: 'border-slate-200 bg-white text-slate-700',
        dayText: 'text-charcoal',
        dayMuted: 'text-slate-500',
      };
  }
}

function statusLabelForDisplay(status) {
  if (!AVAILABILITY_STATUSES.includes(status)) {
    return 'Not set';
  }
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'Not set';
}

function AvailabilityDialog({
  date,
  initialData,
  availabilityByDate,
  initialSelectedDates,
  onSave,
  onClose,
  isSaving,
}) {
  const [activeStatus, setActiveStatus] = useState('available');
  const [selectedDates, setSelectedDates] = useState([]);
  const [dayStatusByDate, setDayStatusByDate] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [carouselArrowsDismissed, setCarouselArrowsDismissed] = useState(false);
  const [carouselScrollable, setCarouselScrollable] = useState(false);
  const carouselRef = useRef(null);

  const dateOptions = useMemo(() => {
    const start = startOfDay(date);
    return eachDayOfInterval({ start, end: addMonths(start, 1) });
  }, [date]);
  const clickedDateYmd = useMemo(() => format(date, 'yyyy-MM-dd'), [date]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    const initialSelection = Array.isArray(initialSelectedDates) && initialSelectedDates.length > 0
      ? [...new Set(initialSelectedDates)]
      : [clickedDateYmd];
    setSelectedDates(initialSelection);

    const seededStatuses = {};
    dateOptions.forEach((optionDate) => {
      const optionYmd = format(optionDate, 'yyyy-MM-dd');
      const savedStatus = availabilityByDate?.[optionYmd]?.status;
      if (AVAILABILITY_STATUSES.includes(savedStatus)) {
        seededStatuses[optionYmd] = savedStatus;
      }
    });
    if (AVAILABILITY_STATUSES.includes(initialData?.status)) {
      seededStatuses[clickedDateYmd] = initialData.status;
    }
    setDayStatusByDate(seededStatuses);
    setActiveStatus(seededStatuses[clickedDateYmd] || initialData?.status || 'available');
    setCarouselArrowsDismissed(false);
  }, [availabilityByDate, clickedDateYmd, dateOptions, initialData, initialSelectedDates]);

  const updateCarouselScrollable = useCallback(() => {
    const node = carouselRef.current;
    if (!node) return;
    setCarouselScrollable(node.scrollWidth > node.clientWidth + 0.5);
  }, []);

  useEffect(() => {
    const node = carouselRef.current;
    if (!node) return undefined;

    updateCarouselScrollable();
    const observer = new ResizeObserver(updateCarouselScrollable);
    observer.observe(node);
    return () => observer.disconnect();
  }, [dateOptions, updateCarouselScrollable]);

  const handleCarouselScroll = () => {
    if (carouselArrowsDismissed || !carouselScrollable) return;
    setCarouselArrowsDismissed(true);
  };

  const handleDateClick = (dateString) => {
    const isSelected = selectedDates.includes(dateString);
    const existingStatus = dayStatusByDate[dateString] || availabilityByDate?.[dateString]?.status || null;

    if (!isSelected) {
      setSelectedDates((prev) => [...prev, dateString]);
      setDayStatusByDate((prev) => ({ ...prev, [dateString]: activeStatus }));
      return;
    }

    if (existingStatus !== activeStatus) {
      setDayStatusByDate((prev) => ({ ...prev, [dateString]: activeStatus }));
      return;
    }

    if (selectedDates.length === 1) return;
    setSelectedDates((prev) => prev.filter((item) => item !== dateString));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting || isSaving || selectedDates.length === 0) return;

    const entries = selectedDates.map((dateString) => ({
      date: dateString,
      status: dayStatusByDate[dateString] || availabilityByDate?.[dateString]?.status || activeStatus,
    }));

    setIsSubmitting(true);
    const didSave = await onSave({
      date: clickedDateYmd,
      entries,
      comment: '',
      applyComment: false,
    });
    setIsSubmitting(false);

    if (didSave !== false) {
      onClose();
    }
  };

  const showCarouselArrows = carouselScrollable && !carouselArrowsDismissed;
  const saveDisabled = isSaving || isSubmitting || selectedDates.length === 0;

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-rota-modal-overlay"
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center px-4 py-6 pb-bottom-nav">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="glass-card mx-auto w-full max-w-md shadow-strong"
          onClick={(event) => event.stopPropagation()}
        >
          <form onSubmit={handleSubmit} className="flex flex-col p-4">
            <div className="flex flex-col items-center">
              <h2 className="text-center text-base font-semibold text-rota-text-muted">
                Set availability as
              </h2>
              <div className="mt-2 flex max-w-full justify-center overflow-x-auto">
                <div className="inline-flex items-center gap-1.5">
                  {STATUS_OPTIONS.map((option) => {
                    const selected = activeStatus === option.value;
                    const tone = getStatusTone(option.value);
                    const Icon = option.Icon;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setActiveStatus(option.value)}
                        className={`inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-sm font-semibold shadow-sm transition-all ${
                          selected
                            ? tone.pillSelected
                            : 'border-slate-200 bg-slate-50 text-charcoal hover:bg-white'
                        }`}
                      >
                        <Icon
                          className={`h-3.5 w-3.5 ${
                            selected ? tone.pillIconSelected : 'text-rota-text-muted'
                          }`}
                          strokeWidth={2.25}
                          aria-hidden
                        />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="relative mt-4 h-44 overflow-hidden">
              <div
                ref={carouselRef}
                onScroll={handleCarouselScroll}
                className="flex gap-2 overflow-x-auto overflow-y-hidden px-6 pb-2"
              >
                {dateOptions.map((optionDate) => {
                  const optionDateString = format(optionDate, 'yyyy-MM-dd');
                  const isChecked = selectedDates.includes(optionDateString);
                  const statusForDate = dayStatusByDate[optionDateString]
                    || availabilityByDate?.[optionDateString]?.status;
                  const hasExistingStatus = AVAILABILITY_STATUSES.includes(statusForDate);
                  const tone = getStatusTone(statusForDate);
                  const cardClass = isChecked
                    ? tone.cardSelected
                    : hasExistingStatus
                      ? tone.cardSaved
                      : 'border-slate-200 bg-white/80 text-charcoal hover:bg-slate-50';
                  const weekdayClass = isChecked || hasExistingStatus
                    ? tone.dayMuted
                    : 'text-rota-text-muted';
                  const dayClass = isChecked || hasExistingStatus
                    ? tone.dayText
                    : 'text-charcoal';
                  const bankHolidayName = getUkBankHolidayName(optionDate);
                  const dayTitle = [
                    isSunday(optionDate) ? 'Sunday' : '',
                    bankHolidayName || '',
                  ].filter(Boolean).join(' — ');

                  return (
                    <button
                      key={optionDateString}
                      type="button"
                      aria-pressed={isChecked}
                      title={dayTitle || undefined}
                      onClick={() => handleDateClick(optionDateString)}
                      className={`relative flex h-36 w-28 shrink-0 flex-col items-center justify-center rounded-2xl border px-2 py-3 text-center transition-all ${cardClass}`}
                    >
                      {bankHolidayName && (
                        <span
                          className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500"
                          aria-hidden
                        />
                      )}
                      <span className={`text-xs font-semibold tracking-wide ${weekdayClass}`}>
                        {format(optionDate, 'EEE')}
                      </span>
                      <span className={`mt-1 text-xl font-bold leading-tight ${dayClass}`}>
                        {getOrdinalDay(optionDate.getDate())}
                      </span>
                      <span className={`mt-0.5 text-xs font-semibold tracking-wide ${weekdayClass}`}>
                        {format(optionDate, 'MMM')}
                      </span>
                      {bankHolidayName && (
                        <span className="mt-0.5 max-w-full truncate text-[10px] text-rota-text-muted">
                          {bankHolidayName}
                        </span>
                      )}
                      <span className="mt-2 text-xs font-medium text-rota-text-muted">
                        {statusLabelForDisplay(statusForDate)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {showCarouselArrows && (
                <>
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex w-6 items-center justify-center">
                    <ChevronLeft className="h-7 w-7 text-blue-600/55" aria-hidden />
                  </div>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex w-6 items-center justify-center">
                    <ChevronRight className="h-7 w-7 text-blue-600/55" aria-hidden />
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 flex gap-2 border-t border-slate-200/80 pt-3">
              <motion.button
                type="button"
                onClick={onClose}
                whileTap={{ scale: 0.97 }}
                className="btn-secondary flex-1"
              >
                Cancel
              </motion.button>
              <motion.button
                type="submit"
                disabled={saveDisabled}
                whileTap={{ scale: 0.97 }}
                className={`btn-secondary flex-1 ${
                  saveDisabled ? 'cursor-not-allowed opacity-60' : ''
                }`}
              >
                {isSaving || isSubmitting ? 'Saving...' : 'Save'}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}

AvailabilityDialog.propTypes = {
  date: PropTypes.instanceOf(Date).isRequired,
  initialData: PropTypes.shape({
    status: PropTypes.string,
    comment: PropTypes.string,
  }),
  availabilityByDate: PropTypes.object,
  initialSelectedDates: PropTypes.arrayOf(PropTypes.string),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  isSaving: PropTypes.bool,
};

AvailabilityDialog.defaultProps = {
  initialData: null,
  availabilityByDate: {},
  initialSelectedDates: [],
  isSaving: false,
};

export default React.memo(AvailabilityDialog, (prevProps, nextProps) => (
  prevProps.date?.getTime() === nextProps.date?.getTime()
  && prevProps.initialData === nextProps.initialData
  && prevProps.availabilityByDate === nextProps.availabilityByDate
  && prevProps.initialSelectedDates === nextProps.initialSelectedDates
  && prevProps.onSave === nextProps.onSave
  && prevProps.onClose === nextProps.onClose
  && prevProps.isSaving === nextProps.isSaving
));
