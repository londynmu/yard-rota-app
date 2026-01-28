import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { format as formatDate, parseISO } from 'date-fns';
import PropTypes from 'prop-types';

const PerformanceChart = ({ data, isAllTime = false }) => {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return { dates: [], values: [] };

    // Sort by date ascending
    const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      dates: sorted.map(item => formatDate(parseISO(item.date), 'dd MMM')),
      fullDates: sorted.map(item => formatDate(parseISO(item.date), 'dd MMM yyyy')),
      values: sorted.map(item => item.totalMoves),
    };
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <p className="text-sm text-gray-500">No trend data for the selected period yet.</p>
      </div>
    );
  }

  const firstDate = chartData.fullDates[0];
  const lastDate = chartData.fullDates[chartData.fullDates.length - 1];
  const totalDays = data.length;

  // Calculate totals
  const totalMoves = chartData.values.reduce((sum, val) => sum + val, 0);
  const avgMoves = Math.round(totalMoves / totalDays);
  const maxMoves = Math.max(...chartData.values);

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#ea580c',
      borderWidth: 2,
      textStyle: {
        color: '#2D2D2D',
      },
      formatter: (params) => {
        const param = params[0];
        const fullDate = chartData.fullDates[param.dataIndex];
        return `
          <div style="padding: 4px;">
            <div style="font-weight: bold; color: #ea580c; margin-bottom: 4px;">
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
        color: '#6B7280',
        interval: totalDays > 60 ? Math.floor(totalDays / 15) : (totalDays > 30 ? 2 : 0),
      },
      axisLine: {
        lineStyle: {
          color: '#E5E7EB',
        },
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontSize: 10,
        color: '#6B7280',
      },
      splitLine: {
        lineStyle: {
          color: '#F3F4F6',
        },
      },
    },
    series: [
      {
        name: 'Moves',
        type: totalDays > 60 ? 'line' : 'bar', // Line for many days, bar for fewer
        data: chartData.values,
        smooth: true,
        symbol: totalDays > 30 ? 'none' : 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#ea580c',
          borderRadius: totalDays <= 60 ? [6, 6, 0, 0] : 0,
        },
        areaStyle: totalDays > 60 ? {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(234, 88, 12, 0.4)' },
              { offset: 1, color: 'rgba(234, 88, 12, 0.05)' },
            ],
          },
        } : undefined,
        lineStyle: {
          width: 2,
          color: '#ea580c',
        },
        emphasis: {
          focus: 'series',
          itemStyle: {
            color: '#c2410c',
          },
        },
      },
    ],
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      {/* Header with stats */}
      <div className="mb-4">
        <h3 className="text-lg font-bold text-charcoal mb-2">Daily Moves Trend</h3>
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-gray-500">Period:</span>{' '}
            <span className="font-semibold text-charcoal">{firstDate} - {lastDate}</span>
          </div>
          <div>
            <span className="text-gray-500">Days:</span>{' '}
            <span className="font-semibold text-charcoal">{totalDays}</span>
          </div>
          <div>
            <span className="text-gray-500">Total:</span>{' '}
            <span className="font-semibold text-orange-600">{totalMoves.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-500">Avg/day:</span>{' '}
            <span className="font-semibold text-charcoal">{avgMoves.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-500">Best:</span>{' '}
            <span className="font-semibold text-green-600">{maxMoves.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <ReactECharts
        option={option}
        style={{ height: '300px', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />

      <p className="text-xs text-gray-500 text-center mt-2 italic">
        Tap chart to see daily details
      </p>
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
