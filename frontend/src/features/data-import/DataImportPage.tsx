import { useEffect, useMemo, useState } from 'react'
import { AppButton, AppCard, AppPage } from 'react-desktop-shell'
import { ArrowUploadRegular } from '@fluentui/react-icons'

import type {
  Anchor,
  DailySessionInput,
} from '../../../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import { arrayOrEmpty, errorMessage, formatMetric, formatYuan, Service, toBase64 } from '../../api'

type ImportFieldKey = 'anchor' | 'date' | 'duration_minutes' | 'views' | 'avg_online' | 'avg_stay_seconds' | 'followers_gained' | 'revenue_cents'

type ImportMapping = Record<ImportFieldKey, string>

type ParsedTable = {
  delimiter: string
  sheetName?: string
  headers: string[]
  rows: string[][]
}

type PreviewRow = {
  rowNumber: number
  raw: string[]
  anchorText: string
  date: string
  anchor?: Anchor
  input?: DailySessionInput
  error?: string
}

const fieldDefinitions: Array<{ key: ImportFieldKey; label: string; aliases: string[]; required?: boolean }> = [
  { key: 'anchor', label: '主播', aliases: ['主播', '主播昵称', '昵称', '主播名称', '账号', '主播账号'], required: true },
  { key: 'date', label: '日期', aliases: ['日期', '直播日期', '场次日期', '开播日期'], required: true },
  { key: 'duration_minutes', label: '直播时长（分钟）', aliases: ['直播时长', '时长', '直播分钟', '时长分钟', '直播时长分钟'] },
  { key: 'views', label: '场观', aliases: ['场观', '观看人次', '观看人数', '直播间场观', '观众'] },
  { key: 'avg_online', label: '平均在线', aliases: ['平均在线', '平均在线人数', '均在线', '平均同时在线'] },
  { key: 'avg_stay_seconds', label: '平均停留（秒）', aliases: ['停留', '平均停留', '平均停留时长', '停留时长', '平均停留秒数'] },
  { key: 'followers_gained', label: '新增粉丝', aliases: ['新增粉丝', '涨粉', '新增', '粉丝增长', '新增关注'] },
  { key: 'revenue_cents', label: '流水（元）', aliases: ['流水', '音浪金额', '收入', '成交金额', '流水金额', '流水元'] },
]

const emptyMapping: ImportMapping = {
  anchor: '',
  date: '',
  duration_minutes: '',
  views: '',
  avg_online: '',
  avg_stay_seconds: '',
  followers_gained: '',
  revenue_cents: '',
}

function compact(value: string): string {
	return value.trim().toLowerCase().replace(/[\s_\-（）()【】\[\]]/g, '')
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (!quoted && character === delimiter) {
      row.push(cell)
      cell = ''
      continue
    }
    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += character
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    if (row.some((value) => value.trim() !== '')) rows.push(row)
  }
  return rows
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const candidates = [',', '\t', ';']
  return candidates.reduce((best, candidate) => {
    const count = firstLine.split(candidate).length - 1
    const bestCount = firstLine.split(best).length - 1
    return count > bestCount ? candidate : best
  }, ',')
}

function normalizeHeader(value: string): string {
  return compact(value.replace(/^\uFEFF/, ''))
}

function autoMapping(headers: string[]): ImportMapping {
  const mapping = { ...emptyMapping }
  const used = new Set<string>()
  for (const definition of fieldDefinitions) {
    const aliases = definition.aliases.map(compact)
    const index = headers.findIndex((header) => {
      const normalized = normalizeHeader(header)
      return !used.has(header) && aliases.some((alias) => normalized === alias || normalized.includes(alias))
    })
		if (index >= 0) {
			mapping[definition.key] = String(index)
			used.add(headers[index])
    }
  }
  return mapping
}

function decodeFile(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('gb18030').decode(buffer).replace(/^\uFEFF/, '')
  }
}

function normalizeDate(value: string): string | null {
  const text = value.trim()
  if (!text) return null
  const datePrefix = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/)
  if (datePrefix) return `${datePrefix[1]}-${datePrefix[2].padStart(2, '0')}-${datePrefix[3].padStart(2, '0')}`
  const compactDate = text.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compactDate) return `${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`
  const serial = Number(text)
  if (Number.isFinite(serial) && serial >= 20000 && serial <= 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000)
    return date.toISOString().slice(0, 10)
  }
  return null
}

function parseNumber(value: string, allowDecimal = false): number | null {
  const text = value.trim().replace(/[,，\s]/g, '')
  if (!text) return null
  const suffixMultiplier = text.endsWith('万') ? 10000 : text.endsWith('千') ? 1000 : 1
  const normalized = text.replace(/万|千|人|秒|s|sec|分钟|分|小时|时|元|￥|¥/gi, '')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null
  const result = parsed * suffixMultiplier
  return allowDecimal ? result : Math.round(result)
}

function parseDuration(value: string): number | null {
  const text = value.trim()
  if (!text) return null
  const clock = text.match(/^(\d+):([0-5]?\d)$/)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  const parts = text.match(/(?:(\d+(?:\.\d+)?)\s*小时)?\s*(?:(\d+(?:\.\d+)?)\s*分)?/)
  if (parts && (parts[1] || parts[2])) return Math.round(Number(parts[1] ?? 0) * 60 + Number(parts[2] ?? 0))
  return parseNumber(text)
}

function parseRevenue(value: string): number | null {
  const text = value.trim()
  if (!text) return null
  const directCents = /分$|cents?$/i.test(text)
  const number = parseNumber(text, true)
  if (number === null) return null
  return Math.round(directCents ? number : number * 100)
}

function anchorMatches(anchors: Anchor[], value: string): Anchor[] {
  const key = compact(value)
  if (!key) return []
  return anchors.filter((anchor) => [anchor.nickname, anchor.name, anchor.account_name, anchor.platform_uid].some((candidate) => compact(candidate) === key))
}

function cellFor(row: string[], mapping: ImportMapping, key: ImportFieldKey): string {
  const column = mapping[key]
  if (!column) return ''
  const index = Number(column)
  return row[index] ?? ''
}

function formatChangeCount(total: number, created: number, updated: number, skipped: number): string {
  const parts = [`已导入 ${total} 行`]
  if (created > 0) parts.push(`新增 ${created} 场`)
  if (updated > 0) parts.push(`更新 ${updated} 场`)
  if (skipped > 0) parts.push(`跳过 ${skipped} 行异常数据`)
  return `${parts.join('，')}。`
}

export function DataImportPage({ onBack }: { onBack: () => void }) {
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const [loadingAnchors, setLoadingAnchors] = useState(true)
  const [anchorError, setAnchorError] = useState('')
  const [fileName, setFileName] = useState('')
  const [table, setTable] = useState<ParsedTable | null>(null)
  const [mapping, setMapping] = useState<ImportMapping>(emptyMapping)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let alive = true
    const filter = { query: '', stage: '', status: '', attention_level: '', tag: '', page: 1, page_size: 200, sort_by: 'nickname', sort_desc: false }
    const loadAnchors = async () => {
      try {
        const first = await Service.ListAnchors(filter)
        const pages = [arrayOrEmpty(first.items)]
        const totalPages = first.page?.total_pages ?? 1
        if (totalPages > 1) {
          const rest = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => Service.ListAnchors({ ...filter, page: index + 2 })))
          pages.push(...rest.map((page) => arrayOrEmpty(page.items)))
        }
        if (alive) setAnchors(pages.flat())
      } catch (reason) {
        if (alive) setAnchorError(errorMessage(reason))
      } finally {
        if (alive) setLoadingAnchors(false)
      }
    }
    void loadAnchors()
    return () => { alive = false }
  }, [])

  const previewRows = useMemo<PreviewRow[]>(() => {
    if (!table) return []
    const requiredFields = fieldDefinitions.filter(({ required }) => required)
    const missing = requiredFields.filter(({ key }) => !mapping[key])
    if (missing.length > 0) return []
    const seen = new Set<string>()
    return table.rows.map((raw, index) => {
      const rowNumber = index + 2
      const anchorText = cellFor(raw, mapping, 'anchor').trim()
      const date = normalizeDate(cellFor(raw, mapping, 'date'))
      const matches = anchorMatches(anchors, anchorText)
      if (!anchorText) return { rowNumber, raw, anchorText, date: date ?? '', error: '主播为空' }
      if (!date) return { rowNumber, raw, anchorText, date: '', error: '日期无法识别，请使用 YYYY-MM-DD' }
      if (matches.length === 0) return { rowNumber, raw, anchorText, date, error: '未匹配到在册主播' }
      if (matches.length > 1) return { rowNumber, raw, anchorText, date, error: '匹配到多个同名主播，请先整理昵称' }
      const anchor = matches[0]
      const input: DailySessionInput = {
        anchor_id: anchor.id,
        duration_minutes: mapping.duration_minutes ? parseDuration(cellFor(raw, mapping, 'duration_minutes')) : null,
        views: mapping.views ? parseNumber(cellFor(raw, mapping, 'views')) : null,
        avg_online: mapping.avg_online ? parseNumber(cellFor(raw, mapping, 'avg_online')) : null,
        avg_stay_seconds: mapping.avg_stay_seconds ? parseNumber(cellFor(raw, mapping, 'avg_stay_seconds')) : null,
        followers_gained: mapping.followers_gained ? parseNumber(cellFor(raw, mapping, 'followers_gained')) : null,
        revenue_cents: mapping.revenue_cents ? parseRevenue(cellFor(raw, mapping, 'revenue_cents')) : null,
      }
      const hasValue = Object.entries(input).some(([key, value]) => key !== 'anchor_id' && value !== null)
      if (!hasValue) return { rowNumber, raw, anchorText, date, anchor, error: '没有可导入的数据' }
      const key = `${anchor.id}:${date}`
      if (seen.has(key)) return { rowNumber, raw, anchorText, date, anchor, error: '同一主播同一天重复出现' }
      seen.add(key)
		const numberFields: Array<['duration_minutes' | 'views' | 'avg_online' | 'avg_stay_seconds' | 'followers_gained' | 'revenue_cents', string]> = [
        ['duration_minutes', '直播时长'],
        ['views', '场观'],
        ['avg_online', '平均在线'],
        ['avg_stay_seconds', '平均停留'],
        ['followers_gained', '新增粉丝'],
        ['revenue_cents', '流水'],
      ]
      for (const [field, label] of numberFields) {
		if (mapping[field] && cellFor(raw, mapping, field).trim() && input[field] === null) {
          return { rowNumber, raw, anchorText, date, anchor, error: `${label}不是有效数字` }
        }
      }
      if (input.duration_minutes !== null && input.duration_minutes < 0) return { rowNumber, raw, anchorText, date, anchor, error: '直播时长不能为负数' }
      if (input.views !== null && input.views < 0) return { rowNumber, raw, anchorText, date, anchor, error: '场观不能为负数' }
      if (input.avg_online !== null && input.avg_online < 0) return { rowNumber, raw, anchorText, date, anchor, error: '平均在线不能为负数' }
      if (input.avg_stay_seconds !== null && input.avg_stay_seconds < 0) return { rowNumber, raw, anchorText, date, anchor, error: '平均停留不能为负数' }
      if (input.revenue_cents !== null && input.revenue_cents < 0) return { rowNumber, raw, anchorText, date, anchor, error: '流水不能为负数' }
      return { rowNumber, raw, anchorText, date, anchor, input }
    })
  }, [anchors, mapping, table])

  const missingMapping = fieldDefinitions.filter(({ required, key }) => required && !mapping[key]).map(({ label }) => label)
  const validRows = previewRows.filter((row) => !row.error && row.input && row.date) as Array<PreviewRow & { input: DailySessionInput; date: string }>
  const errorRows = previewRows.filter((row) => row.error)
  const importable = Boolean(table && missingMapping.length === 0 && validRows.length > 0 && !loadingAnchors)

  const readFile = async (file: File) => {
    setError('')
    setMessage('')
    setFileName(file.name)
    try {
      const buffer = await file.arrayBuffer()
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        const imported = await Service.ParseImportFile(file.name, toBase64(buffer))
        const headers = arrayOrEmpty(imported.headers).map((header, index) => header.trim() || `未命名列 ${index + 1}`)
        const rows = arrayOrEmpty(imported.rows).map((row) => headers.map((_, index) => row?.[index] ?? ''))
        if (headers.length === 0 || rows.length === 0) throw new Error('Excel 第一张工作表没有可识别的数据行。')
        setTable({ delimiter: 'xlsx', sheetName: imported.sheet_name, headers, rows })
        setMapping(autoMapping(headers))
        return
      }
      const text = decodeFile(buffer)
      const delimiter = detectDelimiter(text)
      const rows = parseDelimited(text, delimiter)
      if (rows.length < 2 || rows[0].length === 0) throw new Error('文件没有可识别的表头和数据行。')
      const headers = rows[0].map((header, index) => header.trim() || `未命名列 ${index + 1}`)
      setTable({ delimiter, headers, rows: rows.slice(1).map((row) => headers.map((_, index) => row[index] ?? '')) })
      setMapping(autoMapping(headers.map((header) => header.trim())))
    } catch (reason) {
      setTable(null)
      setMapping(emptyMapping)
      setError(errorMessage(reason))
    }
  }

  const updateMapping = (key: ImportFieldKey, value: string) => {
    setMapping((current) => ({ ...current, [key]: value }))
    setMessage('')
  }

  const importRows = async () => {
    if (!importable) return
    if (!window.confirm(`确认导入 ${validRows.length} 行数据${errorRows.length > 0 ? `，并跳过 ${errorRows.length} 行异常数据` : ''}？同一主播同一天已有数据时会更新已映射指标，其他详细字段会保留。`)) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const grouped = new Map<string, DailySessionInput[]>()
      validRows.forEach((row) => {
        const rows = grouped.get(row.date) ?? []
        rows.push(row.input)
        grouped.set(row.date, rows)
      })
      let total = 0
      let created = 0
      let updated = 0
      const batches: Array<{ session_date: string; source: string; rows: DailySessionInput[] }> = []
      for (const [date, rows] of grouped) {
        if (rows.length > 500) throw new Error(`${date} 超过单日 500 行限制，请拆分文件后再导入。`)
        batches.push({ session_date: date, source: '文件导入', rows })
      }
      const result = await Service.ImportDailyData({ source: '文件导入', batches })
      total = result.saved_count
      created = result.created_count
      updated = result.updated_count
      setMessage(formatChangeCount(total, created, updated, errorRows.length))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  return <AppPage title="数据导入" description="先预览、映射和校验，再把 CSV / TSV / XLSX 数据写入直播场次。" actions={<><AppButton appearance="subtle" onClick={onBack}>返回每日数据</AppButton><label className="button-like"><ArrowUploadRegular aria-hidden="true" fontSize={16} /><span>选择 CSV / Excel</span><input type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void readFile(file); event.currentTarget.value = '' }} /></label><AppButton appearance="primary" icon={<ArrowUploadRegular aria-hidden="true" fontSize={16} />} onClick={() => void importRows()} loading={busy} disabled={!importable}>确认导入</AppButton></>}>
    {anchorError && <div className="notice notice-error">主播名单读取失败：{anchorError}</div>}
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {message && <div className="notice notice-success">{message}</div>}
    {!table ? <AppCard className="import-empty"><div className="import-empty-icon"><ArrowUploadRegular aria-hidden="true" fontSize={24} /></div><h2>选择平台导出的文件</h2><p>支持 UTF-8 / GB18030 编码的 CSV、TSV，以及标准 XLSX；文件第一行作为表头，日期和主播列是必需映射。</p></AppCard> : <>
      <section className="content-section import-file-summary"><div><strong>{fileName}</strong><span>{table.rows.length} 行 · {table.headers.length} 列 · {table.delimiter === 'xlsx' ? `工作表：${table.sheetName || '第一张工作表'}` : `分隔符：${table.delimiter === '\t' ? 'Tab' : table.delimiter}`}</span></div><span>{loadingAnchors ? '正在读取主播名单…' : `在册主播 ${anchors.length} 位`}</span></section>
      <AppCard className="import-mapping-card"><div className="section-heading"><div><h2>字段映射</h2><p>系统会按常见平台字段自动匹配，你可以逐项调整。</p></div><span className={missingMapping.length > 0 ? 'mapping-state is-warning' : 'mapping-state'}>{missingMapping.length > 0 ? `缺少：${missingMapping.join('、')}` : '必需字段已完成'}</span></div><div className="import-mapping-grid">{fieldDefinitions.map((field) => <label key={field.key} className="import-mapping-field"><span>{field.label}{field.required ? ' *' : ''}</span><select className="import-select" value={mapping[field.key]} onChange={(event) => updateMapping(field.key, event.target.value)}><option value="">不导入</option>{table.headers.map((header, index) => <option key={`${header}-${index}`} value={String(index)}>{header || `未命名列 ${index + 1}`}</option>)}</select></label>)}</div></AppCard>
      <AppCard className="import-preview-card"><div className="section-heading"><div><h2>数据预览</h2><p>通过校验的行会被导入；异常行会显示原因并在确认时跳过。</p></div><div className="import-preview-count"><strong>{validRows.length}</strong> / {previewRows.length} 行可导入</div></div>{missingMapping.length > 0 ? <div className="import-help">请先完成：{missingMapping.join('、')}。</div> : previewRows.length === 0 ? <div className="import-help">文件中没有数据行。</div> : <div className="import-preview-table-wrap"><table className="import-preview-table"><thead><tr><th>行</th><th>主播</th><th>日期</th><th>时长</th><th>场观</th><th>平均在线</th><th>停留</th><th>新增粉丝</th><th>流水</th><th>校验</th></tr></thead><tbody>{previewRows.slice(0, 100).map((row) => <tr key={row.rowNumber} className={row.error ? 'is-invalid' : 'is-valid'}><td>{row.rowNumber}</td><td>{row.anchorText || '—'}</td><td>{row.date || '—'}</td><td>{formatMetric(row.input?.duration_minutes, 0)}</td><td>{formatMetric(row.input?.views, 0)}</td><td>{formatMetric(row.input?.avg_online, 0)}</td><td>{formatMetric(row.input?.avg_stay_seconds, 0)}{row.input?.avg_stay_seconds === null || row.input?.avg_stay_seconds === undefined ? '' : ' 秒'}</td><td>{formatMetric(row.input?.followers_gained, 0)}</td><td>{formatYuan(row.input?.revenue_cents)}</td><td>{row.error ? <span className="import-error-text">{row.error}</span> : <span className="import-ok-text">通过</span>}</td></tr>)}</tbody></table>{previewRows.length > 100 && <p className="import-help">仅展示前 100 行，导入会处理全部 {previewRows.length} 行。</p>}</div>}</AppCard>
    </>}
  </AppPage>
}
