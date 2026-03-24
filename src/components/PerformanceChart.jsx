import React, { useMemo } from 'react';
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

const PerformanceChart = ({ data, isAllTime = false }) => {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return { dates: [], values: [] };

    const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      dates: sorted.map((item) => formatDate(parseISO(item.date), 'dd MMM')),
      fullDates: sorted.map((item) => formatDate(parseISO(item.date), 'dd MMM yyyy')),
      values: sorted.map((item) => item.totalMoves),
    };
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div className="card-modern p-4 md:p-5">
        <p className="text-sm text-slate-600">No trend data for the selected period yet.</p>
      </div>
    );
  }

  const firstDate = chartData.fullDates[0];
  const lastDate = chartData.fullDates[chartData.fullDates.length - 1];
  const totalDays = data.length;

  const totalMoves = chartData.values.reduce((sum, val) => sum + val, 0);
  const avgMoves = Math.round(totalMoves / totalDays);
  const maxMoves = Math.max(...chartData.values);

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
        rotate: totalDays > 20 ? 45 : 0,
        fontSize: 10,
        color: CHART_AXIS,
        interval: totalDays > 60 ? Math.floor(totalDays / 15) : totalDays > 30 ? 2 : 0,
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
        type: totalDays > 60 ? 'line' : 'bar',
        data: chartData.values,
        smooth: true,
        symbol: totalDays > 30 ? 'none' : 'circle',
        symbolSize: 6,
        itemStyle: {
          color: CHART_PRIMARY,
          borderRadius: totalDays <= 60 ? [6, 6, 0, 0] : 0,
        },
        areaStyle:
          totalDays > 60
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
          width: 2,
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
        <h3 className="text-xl font-bold text-charcoal tracking-tight mb-2">Daily Moves Trend</h3>
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

      <ReactECharts option={option} style={{ height: '300px', width: '100%' }} opts={{ renderer: 'canvas' }} />

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
