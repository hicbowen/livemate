import { useEffect, useMemo, useState } from 'react'
import { AppCard, AppPage } from 'react-desktop-shell'
import dayjs from 'dayjs'

import type {
  AnchorFilter,
  AnchorPeriodReport,
  AnchorListItem,
  OperationsReport,
  ReportQuery,
} from '../../../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import { arrayOrEmpty, errorMessage, Service } from '../../api'
import { AnchorReportView } from './AnchorReportView'
import { OperationsReportView } from './OperationsReportView'
import { ReportToolbar, type ReportRange, type ReportType } from './ReportToolbar'
import { buildReportText } from './reportText'
import './reports.css'

const anchorListRequest: AnchorFilter = {
  query: '', stage: '', status: '', attention_level: '', tag: '', page: 1, page_size: 200, sort_by: 'nickname', sort_desc: false,
}

function localDate(): string {
  return dayjs().format('YYYY-MM-DD')
}

function rangeStart(endDate: string, days: number): string {
  return dayjs(endDate).subtract(days - 1, 'day').format('YYYY-MM-DD')
}

function escapeHTML(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function downloadText(fileName: string, content: string, mimeType: string) {
  const link = document.createElement('a')
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function htmlDocument(title: string, text: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHTML(title)}</title><style>body{margin:0;background:#f6f8fb;color:#253342;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}main{max-width:820px;margin:40px auto;padding:42px 52px;background:#fff;box-shadow:0 1px 8px rgba(30,50,60,.08)}h1{margin:0 0 28px;color:#0f766e;font-size:22px}pre{white-space:pre-wrap;font:14px/1.85 inherit}</style></head><body><main><h1>${escapeHTML(title)}</h1><pre>${escapeHTML(text)}</pre></main></body></html>`
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('复制失败，请手动选择报告文本。')
}

export function ReportsPage({ onOpenAnchor }: { onOpenAnchor: (id: number, tab?: 'issues' | 'plans' | 'goals', targetId?: number) => void }) {
  const today = localDate()
  const [type, setType] = useState<ReportType>('operations_period')
  const [range, setRange] = useState<ReportRange>('7')
  const [startDate, setStartDate] = useState(() => rangeStart(today, 7))
  const [endDate, setEndDate] = useState(today)
  const [anchors, setAnchors] = useState<AnchorListItem[]>([])
  const [selectedAnchorID, setSelectedAnchorID] = useState<number | null>(null)
  const [operationsReport, setOperationsReport] = useState<OperationsReport | null>(null)
  const [anchorReport, setAnchorReport] = useState<AnchorPeriodReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let alive = true
    Service.ListAnchors(anchorListRequest).then((result) => {
      if (!alive) return
      const items = arrayOrEmpty(result.items)
      setAnchors(items)
      setSelectedAnchorID((current) => current ?? items[0]?.id ?? null)
    }).catch((reason) => {
      if (alive) setError(errorMessage(reason))
    })
    return () => { alive = false }
  }, [])

  const reportQuery = useMemo<ReportQuery>(() => ({
    type,
    start_date: startDate,
    end_date: endDate,
    anchor_id: type === 'anchor_period' ? selectedAnchorID : null,
  }), [endDate, selectedAnchorID, startDate, type])
  const currentReport = type === 'operations_period' ? operationsReport : anchorReport
  const reportText = currentReport ? buildReportText(currentReport) : ''

  const clearPreview = () => {
    setOperationsReport(null)
    setAnchorReport(null)
    setMessage('')
  }

  const chooseRange = (value: ReportRange) => {
    setRange(value)
    if (value !== 'custom') {
      setEndDate(today)
      setStartDate(rangeStart(today, Number(value)))
    }
    clearPreview()
  }

  const generate = async () => {
    setError('')
    setMessage('')
    if (!startDate || !endDate || startDate > endDate) {
      setError('时间范围无效：开始日期不能晚于结束日期。')
      return
    }
    if (type === 'anchor_period' && selectedAnchorID === null) {
      setError('主播阶段报告必须先选择主播。')
      return
    }
    setLoading(true)
    try {
      if (type === 'operations_period') {
        setOperationsReport(await Service.GetOperationsReport(reportQuery))
        setAnchorReport(null)
      } else {
        setAnchorReport(await Service.GetAnchorPeriodReport(reportQuery))
        setOperationsReport(null)
      }
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  const exportBaseName = type === 'anchor_period' && anchorReport ? `主播阶段报告_${anchorReport.anchor.nickname}_${startDate}_${endDate}` : `运营报告_${startDate}_${endDate}`
  const copyReport = async () => {
    if (!reportText) return
    try {
      await copyText(reportText)
      setMessage('报告文本已复制。')
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  return <AppPage title="报告" description="把统一 Analytics 统计与运营闭环记录整理成可复制、可导出的周期文档。">
    <ReportToolbar type={type} range={range} startDate={startDate} endDate={endDate} anchors={anchors} selectedAnchorID={selectedAnchorID} loading={loading} onTypeChange={(value) => { setType(value); clearPreview(); setError('') }} onRangeChange={chooseRange} onStartDateChange={(value) => { setStartDate(value); clearPreview() }} onEndDateChange={(value) => { setEndDate(value); clearPreview() }} onAnchorChange={(value) => { setSelectedAnchorID(value); clearPreview() }} onGenerate={() => void generate()} />
    {error && <div className="notice notice-error report-error" role="alert">{error}</div>}
    {message && <div className="notice notice-success report-message" role="status">{message}</div>}
    {currentReport ? <>
      <div className="report-preview-actions"><span>报告预览</span><div><button type="button" onClick={() => void copyReport()}>复制报告</button><button type="button" onClick={() => downloadText(`${exportBaseName}.md`, reportText, 'text/markdown;charset=utf-8')}>导出 Markdown</button><button type="button" onClick={() => downloadText(`${exportBaseName}.html`, htmlDocument(type === 'anchor_period' ? '主播阶段报告' : '运营周期报告', reportText), 'text/html;charset=utf-8')}>导出 HTML</button></div></div>
      {type === 'operations_period' && operationsReport ? <OperationsReportView report={operationsReport} onOpenAnchor={onOpenAnchor} /> : anchorReport ? <AnchorReportView report={anchorReport} onOpenAnchor={onOpenAnchor} /> : null}
    </> : <AppCard appearance="outlined" padding="regular" className="report-empty-card"><div><strong>报告预览会显示在这里</strong><span>选择周期后点击“生成报告”。内容全部来自真实直播数据、复盘、问题、方案和目标记录。</span></div></AppCard>}
  </AppPage>
}
