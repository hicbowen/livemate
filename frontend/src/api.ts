import * as Service from '../bindings/github.com/hicbowen/livemate/internal/application/service.js'

export { Service }

export function arrayOrEmpty<T>(value: T[] | null | undefined): T[] {
  return value ?? []
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return typeof error === 'string' ? error : '操作失败，请稍后重试。'
}

export function optionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') {
    return null
  }
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : null
}

export function optionalInteger(value: string): number | null {
  const number = optionalNumber(value)
  return number === null ? null : Math.round(number)
}

export function formatYuan(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) {
    return '—'
  }
  return `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatMetric(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  return value.toLocaleString('zh-CN', { maximumFractionDigits: digits })
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  return `${(value * 100).toFixed(1)}%`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '暂无记录'
  }
  return value.length >= 10 ? value.slice(0, 10) : value
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '暂无记录'
  }
  return value.replace('T', ' ').slice(0, 16)
}

export function toBase64(bytes: ArrayBuffer): string {
  const values = new Uint8Array(bytes)
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < values.length; offset += chunkSize) {
    binary += String.fromCharCode(...values.subarray(offset, Math.min(offset + chunkSize, values.length)))
  }
  return btoa(binary)
}
