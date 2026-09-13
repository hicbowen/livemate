import Line, { type LineConfig } from '@ant-design/plots/es/components/line'

import { liveMateChartTheme } from './chartTheme'

export interface TrendLinePoint {
  label: string
  date: string
  value: number | null
}

export interface TrendLineSeries {
  key: string
  name: string
  color: string
  points: TrendLinePoint[]
  dashed?: boolean
}

interface TrendChartDatum extends TrendLinePoint {
  series: string
  seriesKey: string
  color: string
  dashed: boolean
}

interface TrendLineChartProps {
  series: TrendLineSeries[]
  height?: number
  ariaLabel: string
  formatValue: (value: number | null) => string
}

function flattenSeries(series: TrendLineSeries[]): TrendChartDatum[] {
  return series.flatMap((item) => item.points.map((point) => ({
    ...point,
    series: item.name,
    seriesKey: item.key,
    color: item.color,
    dashed: Boolean(item.dashed),
  })))
}

export function TrendLineChart({ series, height = 240, ariaLabel, formatValue }: TrendLineChartProps) {
  const data = flattenSeries(series)
  const labels = Array.from(new Set(data.map((point) => point.label)))
  const names = series.map((item) => item.name)
  const colors = series.map((item) => item.color)

  const config: LineConfig = {
    data,
    height,
    autoFit: true,
    xField: 'label',
    yField: 'value',
    colorField: 'series',
    scale: {
      x: { domain: labels },
      color: { domain: names, range: colors },
      y: { nice: true },
    },
    axis: {
      x: {
        title: false,
        labelAutoRotate: false,
        labelAutoHide: true,
      },
      y: {
        title: false,
        labelFormatter: (value: string) => formatValue(Number(value)),
        grid: true,
      },
    },
    legend: {
      color: {
        position: 'bottom',
        itemMarker: 'line',
      },
    },
    interaction: {
      tooltip: {
        shared: true,
        crosshairs: true,
        marker: false,
      },
    },
    tooltip: {
      title: (datum: TrendChartDatum) => datum.label,
      items: [
        (datum: TrendChartDatum) => ({
          name: `${datum.series} · ${datum.date}`,
          value: formatValue(datum.value),
          color: datum.color,
        }),
      ],
    },
    style: {
      lineWidth: (datum: TrendChartDatum) => datum.dashed ? 1.8 : 2.4,
      lineDash: (datum: TrendChartDatum) => datum.dashed ? [5, 4] : [0, 0],
      lineCap: 'round',
      lineJoin: 'round',
    },
    point: {
      size: 3.5,
    },
    theme: liveMateChartTheme,
  }

  return <div className="trend-line-chart" role="img" aria-label={ariaLabel}>
    <Line {...config} />
  </div>
}
