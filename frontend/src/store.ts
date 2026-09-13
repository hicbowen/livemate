import { create } from 'zustand'

import type { AnchorFilter } from '../bindings/github.com/hicbowen/livemate/internal/domain/models.js'

export type AppView = 'dashboard' | 'daily-data' | 'anchors' | 'todo' | 'data-analysis' | 'reports' | 'data-import' | 'anchor-detail' | 'settings'

interface AppState {
  view: AppView
  selectedAnchorId: number | null
  anchorFilter: AnchorFilter
  setView: (view: AppView) => void
  selectAnchor: (id: number | null) => void
  setAnchorFilter: (filter: Partial<AnchorFilter>) => void
  resetAnchorFilter: () => void
}

const defaultAnchorFilter: AnchorFilter = {
  query: '',
  stage: '',
  status: '',
  attention_level: '',
  tag: '',
  page: 1,
  page_size: 50,
  sort_by: '',
  sort_desc: false,
}

export const useAppStore = create<AppState>((set) => ({
  view: 'dashboard',
  selectedAnchorId: null,
  anchorFilter: defaultAnchorFilter,
  setView: (view) => set({ view }),
  selectAnchor: (selectedAnchorId) => set({ selectedAnchorId, view: selectedAnchorId ? 'anchor-detail' : 'anchors' }),
  setAnchorFilter: (filter) => set((state) => ({ anchorFilter: { ...state.anchorFilter, ...filter, page: filter.page ?? 1 } })),
  resetAnchorFilter: () => set({ anchorFilter: defaultAnchorFilter }),
}))
