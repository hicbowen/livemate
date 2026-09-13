import { AppCard, AppCardHeader } from 'react-desktop-shell'

import type { AnalyticsInsight } from '../../../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import { arrayOrEmpty, formatMetric, formatPercent } from '../../api'

function insightValue(insight: AnalyticsInsight): string {
  if (insight.type === 'inactive') return insight.value === null || insight.value === undefined ? '' : `${formatMetric(insight.value, 0)} 天`
  if (insight.value === null || insight.value === undefined) return ''
  return formatPercent(Math.abs(insight.value))
}

export function AnalyticsInsights({ insights, onOpenAnchor }: { insights: AnalyticsInsight[] | null | undefined; onOpenAnchor: (id: number) => void }) {
  const items = arrayOrEmpty(insights)
  return <AppCard appearance="outlined" padding="regular" className="analytics-panel analytics-insights-panel">
    <AppCardHeader title="重点变化" description="按固定阈值和最低样本量生成，结果只陈述数据变化，不推断原因。" action={<span className="analytics-panel-count">{items.length}</span>} />
    {items.length === 0 ? <div className="analytics-insights-empty">当前周期暂未发现达到规则阈值的重点变化。</div> : <div className="analytics-insights-list">
      {items.slice(0, 8).map((insight) => <button type="button" key={insight.id} className={`analytics-insight-row is-${insight.severity}`} onClick={() => onOpenAnchor(insight.anchor_id)}>
        <span className="analytics-insight-mark" aria-hidden="true" />
        <span className="analytics-insight-main"><strong>{insight.nickname} · {insight.title}</strong><small>{insight.detail}</small></span>
        {insightValue(insight) && <span className="analytics-insight-value">{insightValue(insight)}</span>}
        <span className="analytics-insight-arrow" aria-hidden="true">›</span>
      </button>)}
    </div>}
  </AppCard>
}
