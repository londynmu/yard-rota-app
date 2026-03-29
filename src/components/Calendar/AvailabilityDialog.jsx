import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { Check, TreePalm, X } from 'lucide-react';
import { addDays, eachDayOfInterval, format } from 'date-fns';

const AVAILABILITY_STATUSES = ['available', 'unavailable', 'holiday'];

function getAppliedDayChipStyle(status) {
  switch (status) {
    case 'available':
      return {
        Icon: Check,
        chipClass:
          'border-emerald-300/70 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-900 shadow-sm',
        iconClass: 'text-emerald-700',
        subtextClass: 'text-emerald-800/80',
      };
    case 'unavailable':
      return {
        Icon: X,
        chipClass:
          'border-rose-300/70 bg-gradient-to-br from-rose-50 to-pink-50 text-rose-900 shadow-sm',
        iconClass: 'text-rose-700',
        subtextClass: 'text-rose-800/80',
      };
    case 'holiday':
      return {
        Icon: TreePalm,
        chipClass:
          'border-blue-300/70 bg-gradient-to-br from-blue-50 to-cyan-50 text-blue-900 shadow-sm',
        iconClass: 'text-blue-700',
        subtextClass: 'text-blue-800/80',
      };
    default:
      return {
        Icon: Check,
        chipClass: 'border-slate-200 bg-white text-slate-700',
        iconClass: 'text-slate-600',
        subtextClass: 'text-slate-500',
      };
  }
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
  const [comment, setComment] = useState('');
  const [selectedDates, setSelectedDates] = useState([]);
  const [dayStatusByDate, setDayStatusByDate] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dateOptions = useMemo(
    () => eachDayOfInterval({ start: date, end: addDays(date, 13) }),
    [date]
  );
  const clickedDateYmd = useMemo(() => format(date, 'yyyy-MM-dd'), [date]);
  const isSingleSelection = selectedDates.length === 1;

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
    setComment(initialData?.comment || '');
  }, [availabilityByDate, clickedDateYmd, dateOptions, initialData, initialSelectedDates]);

  useEffect(() => {
    if (selectedDates.length !== 1) {
      setComment('');
      return;
    }

    const onlyDate = selectedDates[0];
    const existingComment = availabilityByDate?.[onlyDate]?.comment;
    if (typeof existingComment === 'string') {
      setComment(existingComment);
      return;
    }

    if (onlyDate === clickedDateYmd && typeof initialData?.comment === 'string') {
      setComment(initialData.comment);
      return;
    }

    setComment('');
  }, [availabilityByDate, clickedDateYmd, initialData, selectedDates]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting || isSaving || selectedDates.length === 0) return;

    const entries = selectedDates.map((dateString) => ({
      date: dateString,
      status: dayStatusByDate[dateString] || availabilityByDate?.[dateString]?.status || activeStatus,
    }));

    setIsSubmitting(true);
    const didSave = await onSave({
      date: clickedDateYmd,
      entries,
      comment: isSingleSelection ? comment : '',
      applyComment: isSingleSelection,
    });
    setIsSubmitting(false);

    if (didSave !== false) {
      onClose();
    }
  };

  const dayOfWeek = format(date, 'EEEE');
  const activeStatusStyle = getAppliedDayChipStyle(activeStatus);

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-rota-modal-overlay">
      <div className="flex min-h-full items-start justify-center px-4 pt-4 pb-bottom-nav sm:pt-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="glass-card mx-auto my-2 w-full max-w-sm shadow-strong"
        >
          <form onSubmit={handleSubmit} className="max-h-[calc(100dvh-8rem)] overflow-y-auto p-6">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold leading-tight text-charcoal">
                  Set Availability for {dayOfWeek}
                </h2>
                <p className="mt-1 text-sm font-medium text-rota-text-muted">{format(date, 'd MMM yyyy')}</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-rota-text-muted-light transition-colors hover:bg-slate-100 hover:text-charcoal"
                onClick={onClose}
                aria-label="Close"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-charcoal">Apply to days</p>
                <p className="text-xs text-rota-text-muted">{selectedDates.length} selected</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {dateOptions.map((optionDate) => {
                  const optionDateString = format(optionDate, 'yyyy-MM-dd');
                  const isChecked = selectedDates.includes(optionDateString);
                  const statusForDate = dayStatusByDate[optionDateString] || availabilityByDate?.[optionDateString]?.status;
                  const hasExistingStatus = AVAILABILITY_STATUSES.includes(statusForDate);
                  const chipStyle = getAppliedDayChipStyle(statusForDate);
                  const ChipIcon = chipStyle.Icon;

                  return (
                    <button
                      key={optionDateString}
                      type="button"
                      onClick={() => handleDateClick(optionDateString)}
                      className={`relative rounded-lg border px-3 py-2 pr-9 text-left transition-all ${
                        isChecked
                          ? `${chipStyle.chipClass} ring-1 ring-black/5`
                          : hasExistingStatus
                            ? `${chipStyle.chipClass} opacity-75`
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {hasExistingStatus && (
                        <ChipIcon
                          className={`absolute right-2 top-2 h-4 w-4 shrink-0 ${chipStyle.iconClass} ${isChecked ? '' : 'opacity-70'}`}
                          strokeWidth={2.25}
                          aria-hidden
                        />
                      )}
                      <p className="text-xs font-semibold">{format(optionDate, 'EEE')}</p>
                      <p className={`text-xs ${hasExistingStatus ? chipStyle.subtextClass : 'text-slate-500'}`}>
                        {format(optionDate, 'd MMM')}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-6">
              <p className="mb-2 text-sm font-semibold text-charcoal">Active status for next clicks</p>
              <div className="grid grid-cols-1 gap-3">
                <button
                  type="button"
                  onClick={() => setActiveStatus('available')}
                  className={`rounded-xl border-2 px-4 py-3 font-medium transition-all ${
                    activeStatus === 'available'
                      ? 'border-emerald-600 bg-emerald-50/80 text-emerald-900 shadow-sm'
                      : 'border-emerald-300/70 bg-white text-emerald-800 hover:bg-emerald-50/50'
                  }`}
                >
                  Available
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStatus('unavailable')}
                  className={`rounded-xl border-2 px-4 py-3 font-medium transition-all ${
                    activeStatus === 'unavailable'
                      ? 'border-rose-500 bg-rose-50/80 text-rose-900 shadow-sm'
                      : 'border-rose-300/70 bg-white text-rose-800 hover:bg-rose-50/50'
                  }`}
                >
                  Unavailable
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStatus('holiday')}
                  className={`rounded-xl border-2 px-4 py-3 font-medium transition-all ${
                    activeStatus === 'holiday'
                      ? 'border-blue-600 bg-sky-50/90 text-blue-900 shadow-sm'
                      : 'border-blue-300/70 bg-white text-blue-800 hover:bg-sky-50/50'
                  }`}
                >
                  Holiday
                </button>
              </div>
              <p className={`mt-2 text-xs ${activeStatusStyle.subtextClass}`}>
                Changing this does not recolor days already selected.
              </p>
            </div>

            {isSingleSelection ? (
              <div className="mb-6">
                <label className="mb-2 block font-medium text-charcoal" htmlFor="comment">
                  Comments (optional)
                </label>
                <textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full rounded-lg border border-rota-input-border bg-white px-3 py-2 text-charcoal placeholder-gray-400 focus:border-rota-input-focus-border focus:outline-none focus:ring-2 focus:ring-[rgba(59,130,246,0.2)]"
                  rows="3"
                  placeholder="Add any notes about this day..."
                />
              </div>
            ) : (
              <p className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Comments are available only when exactly one day is selected.
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <motion.button
                type="button"
                onClick={onClose}
                whileTap={{ scale: 0.97 }}
                className="btn-secondary order-2 sm:order-1"
              >
                Cancel
              </motion.button>
              <motion.button
                type="submit"
                disabled={isSaving || isSubmitting || selectedDates.length === 0}
                whileTap={{ scale: 0.97 }}
                className={`btn-primary order-1 sm:order-2 ${
                  isSaving || isSubmitting || selectedDates.length === 0
                    ? 'cursor-not-allowed opacity-60'
                    : ''
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