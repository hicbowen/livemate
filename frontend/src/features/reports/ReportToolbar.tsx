import { AppButton, AppCard, AppSelect } from 'react-desktop-shell'

import type { AnchorListItem } from '../../../bindings/github.com/hicbowen/livemate/internal/domain/models.js'

export type ReportType = 'operations_period' | 'anchor_period'
export type ReportRange = '7' | '14' | '30' | 'custom'

const reportTypes = [
  { value: 'operations_period', label: '运营周期报告' },
  { value: 'anchor_period', label: '主播阶段报告' },
]

const reportRanges = [
  { value: '7', label: '近 7 天' },
  { value: '14', label: '近 14 天' },
  { value: '30', label: '近 30 天' },
  { value: 'custom', label: '自定义' },
]

export function ReportToolbar({ type, range, startDate, endDate, anchors, selectedAnchorID, loading, onTypeChange, onRangeChange, onStartDateChange, onEndDateChange, onAnchorChange, onGenerate }: {
  type: ReportType
  range: ReportRange
  startDate: string
  endDate: string
  anchors: AnchorListItem[]
  selectedAnchorID: number | null
  loading: boolean
  onTypeChange: (value: ReportType) => void
  onRangeChange: (value: ReportRange) => void
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onAnchorChange: (value: number | null) => void
  onGenerate: () => void
}) {
  const anchorOptions = [{ value: '', label: '请选择主播' }, ...anchors.map((anchor) => ({ value: String(anchor.id), label: anchor.nickname }))]
  return <AppCard appearance="outlined" padding="regular" className="report-toolbar">
    <div className="report-toolbar-grid">
      <label>报告类型<AppSelect options={reportTypes} value={type} onValueChange={(value) => { if (value === 'operations_period' || value === 'anchor_period') onTypeChange(value) }} /></label>
      <label>时间范围<AppSelect options={reportRanges} value={range} onValueChange={(value) => { if (value === '7' || value === '14' || value === '30' || value === 'custom') onRangeChange(value) }} /></label>
      {type === 'anchor_period' && <label>主播<AppSelect options={anchorOptions} value={selectedAnchorID === null ? '' : String(selectedAnchorID)} onValueChange={(value) => onAnchorChange(value ? Number(value) : null)} /></label>}
      <div className="report-toolbar-action"><AppButton appearance="primary" onClick={onGenerate} loading={loading}>生成报告</AppButton></div>
    </div>
    {range === 'custom' && <div className="report-date-fields"><label>开始日期<input type="date" value={startDate} onChange={(event) => onStartDateChange(event.currentTarget.value)} /></label><span>至</span><label>结束日期<input type="date" value={endDate} onChange={(event) => onEndDateChange(event.currentTarget.value)} /></label></div>}
  </AppCard>
}
