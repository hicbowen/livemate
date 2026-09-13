import { AppDataTable, AppDataView, type AppDataTableColumn } from 'react-desktop-shell/data'
import { AppPersona } from 'react-desktop-shell'

import type { AnchorAnalyticsRow } from '../../../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import { arrayOrEmpty, formatMetric, formatPercent, formatYuan } from '../../api'

function changeCell(rate: number | null | undefined) {
  if (rate === null || rate === undefined) return <span className="analytics-table-muted">—</span>
  const positive = rate >= 0
  return <span className={`analytics-table-change ${positive ? 'is-positive' : 'is-negative'}`}>{positive ? '↑' : '↓'} {formatPercent(Math.abs(rate))}</span>
}

export function AnchorComparisonTable({ anchors, onOpenAnchor }: { anchors: AnchorAnalyticsRow[] | null | undefined; onOpenAnchor: (id: number) => void }) {
  const rows = arrayOrEmpty(anchors)
  const columns: AppDataTableColumn<AnchorAnalyticsRow>[] = [
    {
      id: 'nickname',
      accessorKey: 'nickname',
      header: '主播',
      size: 190,
      cell: ({ row }) => <AppPersona size="small" name={row.original.nickname} secondaryText={`${row.original.stage} · ${row.original.platform}${row.original.category ? ` · ${row.original.category}` : ''}`} avatar={{ initials: row.original.nickname.slice(0, 1), size: 'small' }} />,
    },
    { accessorKey: 'session_count', header: '场次', size: 70, cell: ({ getValue }) => formatMetric(getValue() as number, 0) },
    { accessorKey: 'duration_minutes', header: '时长', size: 95, cell: ({ getValue }) => { const value = getValue() as number | null; return value === null ? '—' : `${formatMetric(value, 0)} 分钟` } },
    { accessorKey: 'views', header: '场观', size: 100, cell: ({ getValue }) => formatMetric(getValue() as number | null, 0) },
    { accessorKey: 'avg_online', header: '平均在线', size: 100, cell: ({ getValue }) => formatMetric(getValue() as number | null, 1) },
    { accessorKey: 'avg_stay_seconds', header: '平均停留', size: 100, cell: ({ getValue }) => { const value = getValue() as number | null; return value === null ? '—' : `${formatMetric(value, 1)} 秒` } },
    { accessorKey: 'followers_gained', header: '新增粉丝', size: 100, cell: ({ getValue }) => formatMetric(getValue() as number | null, 0) },
    { accessorKey: 'revenue_cents', header: '流水', size: 115, cell: ({ getValue }) => formatYuan(getValue() as number | null) },
    { accessorKey: 'revenue_change_rate', header: '流水环比', size: 105, cell: ({ getValue }) => changeCell(getValue() as number | null) },
  ]
  return <AppDataView height="auto" className="analytics-table-view">
    <AppDataTable
      data={rows}
      columns={columns}
      controls={{ search: true, clearAll: true }}
      globalFilterFn={(row, _columnId, filterValue) => {
        const query = String(filterValue ?? '').trim().toLocaleLowerCase()
        if (!query) return true
        const item = row.original
        return [item.nickname, item.stage, item.platform, item.category].some((value) => String(value ?? '').toLocaleLowerCase().includes(query))
      }}
      defaultSorting={[{ id: 'revenue_cents', desc: true }]}
      density="compact"
      stickyHeader
      stickyColumns={['nickname']}
      pagination={false}
      emptyContent={<div className="analytics-table-empty">当前周期暂无主播直播记录。</div>}
      getRowId={(item) => String(item.anchor_id)}
      onRowClick={(row) => onOpenAnchor(row.original.anchor_id)}
    />
  </AppDataView>
}
