import { useEffect, useMemo, useRef, useState } from 'react'
import { AppButton, AppCard, AppDatePicker, AppInlineEdit, AppPage, AppSearchBox } from 'react-desktop-shell'
import type { AppInlineEditHandle } from 'react-desktop-shell'
import dayjs from 'dayjs'

import type {
  DailyDataRow,
  DailyDataSaveResult,
  DailySessionInput,
} from '../../../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import { errorMessage, optionalInteger, Service } from '../../api'
import { appDateToDayjs, dayjsToAppDate } from '../../utils/desktopShellDateTime'

type DailyColumnKey = 'duration_minutes' | 'views' | 'avg_online' | 'avg_stay_seconds' | 'followers_gained' | 'revenue_yuan'

type DailyDraft = Record<DailyColumnKey, string>

type DailyColumn = {
  key: DailyColumnKey
  label: string
  placeholder: string
  suffix?: string
}

const columns: DailyColumn[] = [
  { key: 'duration_minutes', label: '时长', placeholder: '分钟' },
  { key: 'views', label: '场观', placeholder: '—' },
  { key: 'avg_online', label: '平均在线', placeholder: '—' },
  { key: 'avg_stay_seconds', label: '停留', placeholder: '秒' },
  { key: 'followers_gained', label: '新增粉丝', placeholder: '—' },
  { key: 'revenue_yuan', label: '流水', placeholder: '元' },
]

function localDate(value = new Date()): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function emptyDraft(): DailyDraft {
  return {
    duration_minutes: '',
    views: '',
    avg_online: '',
    avg_stay_seconds: '',
    followers_gained: '',
    revenue_yuan: '',
  }
}

function textValue(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

function rowToDraft(row: DailyDataRow): DailyDraft {
  return {
    duration_minutes: textValue(row.duration_minutes),
    views: textValue(row.views),
    avg_online: textValue(row.avg_online),
    avg_stay_seconds: textValue(row.avg_stay_seconds),
    followers_gained: textValue(row.followers_gained),
    revenue_yuan: row.revenue_cents === null || row.revenue_cents === undefined ? '' : (row.revenue_cents / 100).toFixed(2),
  }
}

function hasData(draft: DailyDraft): boolean {
  return columns.some(({ key }) => draft[key].trim() !== '')
}

const clearFieldByColumn: Record<DailyColumnKey, string> = {
  duration_minutes: 'duration_minutes',
  views: 'views',
  avg_online: 'avg_online',
  avg_stay_seconds: 'avg_stay_seconds',
  followers_gained: 'followers_gained',
  revenue_yuan: 'revenue_cents',
}

function existingValue(row: DailyDataRow, key: DailyColumnKey): number | null | undefined {
  if (key === 'revenue_yuan') return row.revenue_cents
  return row[key]
}

function clearFieldsFor(row: DailyDataRow, draft: DailyDraft): string[] {
  return columns
    .filter(({ key }) => existingValue(row, key) !== null && existingValue(row, key) !== undefined && draft[key].trim() === '')
    .map(({ key }) => clearFieldByColumn[key])
}

function hasChanges(row: DailyDataRow, draft: DailyDraft): boolean {
  return hasData(draft) || clearFieldsFor(row, draft).length > 0
}

function isValidNumber(value: string, integer = true, allowNegative = false): boolean {
	const trimmed = value.trim()
	if (!trimmed) return true
	const parsed = Number(trimmed)
	return Number.isFinite(parsed) && (allowNegative || parsed >= 0) && (!integer || Number.isInteger(parsed))
}

function toCents(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  return Math.round(Number(trimmed) * 100)
}

function toDailyInput(row: DailyDataRow, draft: DailyDraft): DailySessionInput {
  return {
    anchor_id: row.anchor_id,
    duration_minutes: optionalInteger(draft.duration_minutes),
    views: optionalInteger(draft.views),
    avg_online: optionalInteger(draft.avg_online),
    avg_stay_seconds: optionalInteger(draft.avg_stay_seconds),
    followers_gained: optionalInteger(draft.followers_gained),
    revenue_cents: toCents(draft.revenue_yuan),
    clear_fields: clearFieldsFor(row, draft),
  }
}

function resultMessage(result: DailyDataSaveResult): string {
  const created = result.created_count > 0 ? `新增 ${result.created_count} 场` : ''
  const updated = result.updated_count > 0 ? `更新 ${result.updated_count} 场` : ''
  return `已保存 ${result.saved_count} 位主播数据${created || updated ? `（${[created, updated].filter(Boolean).join('，')}）` : ''}。`
}

export function DailyDataPage({ onOpenAnchor, onOpenImport }: { onOpenAnchor: (id: number) => void; onOpenImport: () => void }) {
  const [sessionDate, setSessionDate] = useState(localDate)
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [rows, setRows] = useState<DailyDataRow[]>([])
  const [drafts, setDrafts] = useState<Record<number, DailyDraft>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const inputRefs = useRef<Record<string, AppInlineEditHandle | null>>({})

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await Service.GetDailyData({ session_date: sessionDate, query: appliedQuery })
      const nextDrafts: Record<number, DailyDraft> = {}
      result.rows?.forEach((row) => { nextDrafts[row.anchor_id] = rowToDraft(row) })
      setRows(result.rows ?? [])
      setDrafts(nextDrafts)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [sessionDate, appliedQuery])

  const filledCount = useMemo(() => rows.reduce((count, row) => count + (hasData(drafts[row.anchor_id] ?? emptyDraft()) ? 1 : 0), 0), [drafts, rows])

  const updateCell = (anchorId: number, key: DailyColumnKey, value: string) => {
    setDrafts((current) => ({
      ...current,
      [anchorId]: { ...(current[anchorId] ?? emptyDraft()), [key]: value },
    }))
    setMessage('')
  }

  const focusCell = (rowIndex: number, columnIndex: number) => {
    if (rowIndex < 0 || rowIndex >= rows.length || columnIndex < 0 || columnIndex >= columns.length) return
    const row = rows[rowIndex]
    inputRefs.current[`${row.anchor_id}:${columns[columnIndex].key}`]?.focus()
  }

  const save = async () => {
    setError('')
    setMessage('')
    const dataRows = rows.filter((row) => hasChanges(row, drafts[row.anchor_id] ?? emptyDraft()))
    if (dataRows.length === 0) {
      setError('请至少填写或清空一位主播的数据后再保存。')
      return
    }
    const invalid = dataRows.find((row) => {
      const draft = drafts[row.anchor_id]
	  	  return !isValidNumber(draft.duration_minutes) || !isValidNumber(draft.views) || !isValidNumber(draft.avg_online) || !isValidNumber(draft.avg_stay_seconds) || !isValidNumber(draft.followers_gained, true, true) || !isValidNumber(draft.revenue_yuan, false)
    })
    if (invalid) {
	  	  setError(`“${invalid.nickname}”的数据格式不正确：整数指标不能包含小数；除新增粉丝外，数量和金额不能为负数。`)
      return
    }
    setSaving(true)
    try {
      const result = await Service.SaveDailyData({
        session_date: sessionDate,
        source: '每日数据',
        rows: dataRows.map((row) => toDailyInput(row, drafts[row.anchor_id])),
      })
      setMessage(resultMessage(result))
      await load()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  const validateCell = (column: DailyColumn, value: string) => {
    const integer = column.key !== 'revenue_yuan'
    const allowNegative = column.key === 'followers_gained'
    return isValidNumber(value, integer, allowNegative) ? null : (integer ? '请输入整数' : '请输入有效金额')
  }

  return <AppPage title="每日数据" description="在一个表格里完成当天主要直播数据录入；空白主播不会被保存。" actions={<><AppButton appearance="subtle" onClick={onOpenImport}>导入文件</AppButton><AppButton appearance="subtle" onClick={() => void load()}>刷新</AppButton><AppButton appearance="primary" onClick={() => void save()} loading={saving}>批量保存</AppButton></>}>
    <section className="daily-workbench-toolbar">
      <div className="daily-date-control"><label htmlFor="daily-session-date">数据日期</label><AppDatePicker id="daily-session-date" allowClear={false} value={dayjsToAppDate(dayjs(sessionDate))} onValueChange={(value) => { const selected = appDateToDayjs(value); if (selected) { setSessionDate(selected.format('YYYY-MM-DD')); setMessage('') } }} /></div>
      <AppSearchBox className="daily-search" value={query} onValueChange={setQuery} onKeyDown={(event) => { if (event.key === 'Enter') setAppliedQuery(query.trim()) }} placeholder="筛选主播，回车应用…" />
      <div className="daily-workbench-summary"><strong>{filledCount}</strong> / {rows.length} 位主播有数据</div>
    </section>
    {message && <div className="notice notice-success">{message}</div>}
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    <AppCard className="daily-workbench-card">
      {loading ? <div className="loading-state">正在读取主播名单…</div> : rows.length === 0 ? <div className="daily-empty">没有匹配的在册主播，请先建立主播档案。</div> : <div className="daily-table-wrap"><table className="daily-table"><thead><tr><th className="daily-anchor-column">主播</th>{columns.map((column) => <th key={column.key}>{column.label}<small>{column.suffix ?? (column.key === 'duration_minutes' ? '分钟' : column.key === 'avg_stay_seconds' ? '秒' : column.key === 'revenue_yuan' ? '元' : '')}</small></th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => { const draft = drafts[row.anchor_id] ?? emptyDraft(); const filled = hasData(draft); return <tr key={row.anchor_id} className={filled ? 'is-filled' : ''}><th scope="row" className="daily-anchor-cell"><button type="button" onClick={() => onOpenAnchor(row.anchor_id)}>{row.nickname}</button><small>{row.platform} · {row.stage}</small></th>{columns.map((column, columnIndex) => { const cellKey = `${row.anchor_id}:${column.key}`; return <td key={column.key}><AppInlineEdit ref={(handle) => { inputRefs.current[cellKey] = handle }} className="daily-inline-edit" value={draft[column.key]} placeholder={column.placeholder} ariaLabel={`${row.nickname} ${column.label}`} selection="all" validate={(value) => validateCell(column, value)} onCommit={(value) => { updateCell(row.anchor_id, column.key, value); window.requestAnimationFrame(() => focusCell(rowIndex + 1, columnIndex)) }} /></td> })}</tr> })}</tbody></table></div>}
    </AppCard>
    <p className="daily-workbench-help">提示：双击单元格或按 Enter 开始编辑，提交后按 Enter 可进入下一位主播；保存时只提交有数据的行。</p>
  </AppPage>
}
