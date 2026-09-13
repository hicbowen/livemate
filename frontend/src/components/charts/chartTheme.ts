export const liveMateChartTheme = {
  type: 'light',
  color: '#0f766e',
  category10: ['#0f766e', '#94a3b8', '#287148', '#d88a24', '#5874a8', '#b44336'],
  axis: {
    labelFill: '#71808d',
    labelFontSize: 10,
    lineStroke: '#d8e1e5',
    tickStroke: '#d8e1e5',
    gridStroke: '#edf1f4',
    gridLineWidth: 1,
  },
  legendCategory: {
    itemLabelFill: '#71808d',
    itemLabelFontSize: 10,
  },
  tooltip: {
    container: {
      boxShadow: '0 8px 24px rgba(37, 51, 66, .14)',
      borderRadius: 6,
    },
  },
} as const
