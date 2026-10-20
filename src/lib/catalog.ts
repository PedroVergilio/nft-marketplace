import type { SearchSchemaInput } from '@tanstack/react-router'
import type { CatalogSearch } from './contracts'

export const defaultSearch: CatalogSearch = { q: '', category: '', sort: 'featured', page: 1, available: false, min: '', max: '' }

export function parseSearch(raw: Partial<Record<keyof CatalogSearch, unknown>> & SearchSchemaInput): CatalogSearch {
  const text = (key: keyof CatalogSearch) => typeof raw[key] === 'string' ? raw[key] as string : ''
  const sort = text('sort')
  const page = Number(raw.page)
  return {
    q: text('q').slice(0, 100), category: text('category'),
    sort: ['featured', 'price-asc', 'price-desc', 'name'].includes(sort) ? sort as CatalogSearch['sort'] : 'featured',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    available: raw.available === true || raw.available === 'true',
    min: /^\d+(\.\d{1,18})?$/.test(text('min')) ? text('min') : '',
    max: /^\d+(\.\d{1,18})?$/.test(text('max')) ? text('max') : '',
  }
}
