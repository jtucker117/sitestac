// Lead acquisition sources — labels, grouping, and filter helpers for the Leads board.
import type { Lead, LeadSource } from './types'

export type SourceFilter = 'all' | 'relay' | 'grok_google' | 'grok_facebook'

/** Sources that originate inside Relay CRM (live search, manual add, legacy import). */
export const RELAY_SOURCES: LeadSource[] = ['places', 'manual', 'live']

export interface SourceMeta {
  id: LeadSource
  label: string
  short: string
  color: string
  group: 'relay' | 'grok'
}

export const SOURCE_META: Record<LeadSource, SourceMeta> = {
  places: { id: 'places', label: 'Relay · Legacy import', short: 'Relay', color: '#5B4FE9', group: 'relay' },
  manual: { id: 'manual', label: 'Relay · Manual add', short: 'Relay', color: '#5B4FE9', group: 'relay' },
  live: { id: 'live', label: 'Relay · Live search', short: 'Relay', color: '#5B4FE9', group: 'relay' },
  grok_google: { id: 'grok_google', label: 'Grok Bot · Google', short: 'Grok · Google', color: '#2E9BD6', group: 'grok' },
  grok_facebook: { id: 'grok_facebook', label: 'Grok Bot · Facebook', short: 'Grok · Facebook', color: '#1877F2', group: 'grok' },
}

export const SOURCE_FILTERS: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: 'All sources' },
  { id: 'relay', label: 'Relay CRM' },
  { id: 'grok_google', label: 'Grok · Google' },
  { id: 'grok_facebook', label: 'Grok · Facebook' },
]

export const sourceMeta = (source: LeadSource) => SOURCE_META[source] ?? SOURCE_META.manual

export const isRelaySource = (source: LeadSource) => RELAY_SOURCES.includes(source)

export const matchSourceFilter = (lead: Lead, filter: SourceFilter) => {
  if (filter === 'all') return true
  if (filter === 'relay') return isRelaySource(lead.source)
  return lead.source === filter
}

/** Human label for pipeline deal.source when converting a lead. */
export const dealSourceFromLead = (source: LeadSource) => {
  switch (source) {
    case 'grok_google': return 'Grok Bot (Google)'
    case 'grok_facebook': return 'Grok Bot (Facebook)'
    case 'live': return 'Relay · Live search'
    case 'manual': return 'Relay · Manual'
    case 'places': return 'Relay · Import'
    default: return 'Leads board'
  }
}

/** Sort rank: Grok leads surface together, Relay together; within group by created_at desc. */
export const sourceSortRank = (source: LeadSource) => {
  if (source === 'grok_google') return 0
  if (source === 'grok_facebook') return 1
  if (source === 'live') return 2
  if (source === 'manual') return 3
  return 4
}
