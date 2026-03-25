import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { format as formatDate, parseISO } from 'date-fns';
import PropTypes from 'prop-types';

/** Matches tailwind theme: blue-500 / blue-700 / slate (base.*) */
const CHART_PRIMARY = '#3b82f6';
const CHART_PRIMARY_EMPHASIS = '#1d4ed8';
const CHART_AXIS = '#64748b';
const CHART_LINE = '#e2e8f0';
const CHART_SPLIT = '#f1f5f9';
const CHARCOAL = '#2d2d2d';
const SWIPE_THRESHOLD = 40;
const DEFAULT_WINDOW_SIZE = 31;

const getVisibleWindow = (records, windowStartIndex, windowSize) => {
  if (!records || records.length === 0) return [];
  const startIndex = Math.max(0, Math.min(windowStartIndex, records.length - 1));
  const endIndex = Math.min(records.length, startIndex + windowSize);
  return records.slice(startIndex, endIndex);
};

const PerformanceChart = ({ data, isAllTime = false }) => {
  const touchStartX = useRef(null);
  const [windowStartIndex, setWindowStartIndex] = useState(0);

  const fullSeries = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [data]);

  const windowSize = DEFAULT_WINDOW_SIZE;
  const maxWindowStart = Math.max(0, fullSeries.length - windowSize);

  useEffect(() => {
    if (!fullSeries.length) {
      setWindowStartIndex(0);
      return;
    }
    if (isAllTime) {
      setWindowStartIndex(maxWindowStart);
      return;
    }
    setWindowStartIndex(0);
  }, [isAllTime, fullSeries.length, maxWindowStart]);

  const visibleSeries = useMemo(() => {
    if (!isAllTime) return fullSeries;
    return getVisibleWindow(fullSeries, windowStartIndex, windowSize);
  }, [fullSeries, isAllTime, windowStartIndex, windowSize]);

  const chartData = useMemo(() => {
    if (!visibleSeries.length) return { dates: [], fullDates: [], values: [] };
    return {
      dates: visibleSeries.map((item) => formatDate(parseISO(item.date), 'dd MMM')),
      fullDates: visibleSeries.map((item) => formatDate(parseISO(item.date), 'dd MMM yyyy')),
      values: visibleSeries.map((item) => item.totalMoves),
    };
  }, [visibleSeries]);

  if (!data || data.length === 0) {
    return (
      <div className="card-modern p-4 md:p-5">
        <p className="text-sm text-slate-600">No trend data for the selected period yet.</p>
      </div>
    );
  }

  const firstDate = chartData.fullDates[0] || '—';
  const lastDate = chartData.fullDates[chartData.fullDates.length - 1] || '—';
  const totalDays = data.length;

  const totalMoves = fullSeries.reduce((sum, item) => sum + (item.totalMoves || 0), 0);
  const avgMoves = Math.round(totalMoves / totalDays);
  const maxMoves = Math.max(...fullSeries.map((item) => item.totalMoves || 0));
  const canGoPrev = isAllTime && windowStartIndex > 0;
  const canGoNext = isAllTime && windowStartIndex < maxWindowStart;

  const moveToPrevWindow = () => {
    if (!canGoPrev) return;
    setWindowStartIndex((prev) => Math.max(0, prev - windowSize));
  };

  const moveToNextWindow = () => {
    if (!canGoNext) return;
    setWindowStartIndex((prev) => Math.min(maxWindowStart, prev + windowSize));
  };

  const handleTouchStart = (event) => {
    touchStartX.current = event.touches?.[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event) => {
    if (!isAllTime || touchStartX.current == null) return;
    const endX = event.changedTouches?.[0]?.clientX ?? null;
    if (endX == null) return;
    const deltaX = endX - touchStartX.current;
    touchStartX.current = null;

    if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;
    if (deltaX > 0) {
      moveToPrevWindow();
      return;
    }
    moveToNextWindow();
  };

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: CHART_PRIMARY,
      borderWidth: 2,
      textStyle: {
        color: CHARCOAL,
      },
      formatter: (params) => {
        const param = params[0];
        const fullDate = chartData.fullDates[param.dataIndex];
        return `
          <div style="padding: 4px;">
            <div style="font-weight: bold; color: ${CHART_PRIMARY}; margin-bottom: 4px;">
              ${fullDate}
            </div>
            <div style="font-size: 18px; font-weight: bold;">
              ${param.value.toLocaleString()} moves
            </div>
          </div>
        `;
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: chartData.dates,
      boundaryGap: true,
      axisLabel: {
        rotate: chartData.dates.length > 20 ? 40 : 0,
        fontSize: 10,
        color: CHART_AXIS,
        interval:
          chartData.dates.length > 26
            ? 3
            : chartData.dates.length > 18
              ? 1
              : 0,
      },
      axisLine: {
        lineStyle: {
          color: CHART_LINE,
        },
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontSize: 10,
        color: CHART_AXIS,
      },
      splitLine: {
        lineStyle: {
          color: CHART_SPLIT,
        },
      },
    },
    series: [
      {
        name: 'Moves',
        type: chartData.dates.length > 18 ? 'line' : 'bar',
        data: chartData.values,
        smooth: true,
        symbol: chartData.dates.length > 20 ? 'none' : 'circle',
        symbolSize: 6,
        itemStyle: {
          color: CHART_PRIMARY,
          borderRadius: chartData.dates.length <= 18 ? [6, 6, 0, 0] : 0,
        },
        areaStyle:
          chartData.dates.length > 18
            ? {
                color: {
                  type: 'linear',
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: 'rgba(59, 130, 246, 0.35)' },
                    { offset: 1, color: 'rgba(59, 130, 246, 0.05)' },
                  ],
                },
              }
            : undefined,
        lineStyle: {
          width: 2.5,
          color: CHART_PRIMARY,
        },
        emphasis: {
          focus: 'series',
          itemStyle: {
            color: CHART_PRIMARY_EMPHASIS,
          },
        },
      },
    ],
  };

  return (
    <div className="card-modern p-4 md:p-5">
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xl font-bold text-charcoal tracking-tight">Daily Moves Trend</h3>
          {isAllTime && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={moveToPrevWindow}
                disabled={!canGoPrev}
                className="rounded-lg border border-slate-200/70 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Show previous month window"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={moveToNextWindow}
                disabled={!canGoNext}
                className="rounded-lg border border-slate-200/70 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Show next month window"
              >
                Next
              </button>
            </div>
          )}
        </div>
        {isAllTime && (
          <div className="mb-2 text-xs text-slate-500">
            Swipe left/right on the chart to browse month windows.
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <div>
            <span className="text-slate-500">Period:</span>{' '}
            <span className="font-medium text-charcoal">
              {firstDate} - {lastDate}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Days:</span>{' '}
            <span className="font-medium text-charcoal">{totalDays}</span>
          </div>
          <div>
            <span className="text-slate-500">Total:</span>{' '}
            <span className="font-medium text-blue-700">{totalMoves.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-500">Avg/day:</span>{' '}
            <span className="font-medium text-charcoal">{avgMoves.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-500">Best:</span>{' '}
            <span className="font-medium text-emerald-700">{maxMoves.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <ReactECharts option={option} style={{ height: '300px', width: '100%' }} opts={{ renderer: 'canvas' }} />
      </div>

      <p className="text-xs text-slate-500 text-center mt-2">Tap chart to see daily details</p>
    </div>
  );
};

PerformanceChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      totalMoves: PropTypes.number.isRequired,
    })
  ).isRequired,
  isAllTime: PropTypes.bool,
};

export default PerformanceChart;
