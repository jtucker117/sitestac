import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'
import Screen from '../components/Screen'
import Icon from '../components/Icon'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { Lead, LeadStatus } from '../lib/types'
import { US_STATES } from '../lib/catalog'
import {
  SOURCE_FILTERS, SOURCE_META, dealSourceFromLead, matchSourceFilter, sourceMeta, sourceSortRank,
  type SourceFilter,
} from '../lib/leadSources'

// Shared outreach board — ports the standalone SiteStac lead tool into Relay.
// Search • coordinate map • per-lead outreach stages • notes • CSV export • manual add.
// Data lives in the `leads` table (supabase/004_leads.sql), shared across the team.

// Concrete hex (not CSS vars) so Leaflet's SVG pins can use the same colors as the chips.
const STATUS: { id: LeadStatus; label: string; color: string }[] = [
  { id: 'new', label: 'New', color: '#8A8A90' },
  { id: 'contacted', label: 'Contacted', color: '#2E9BD6' },
  { id: 'followup', label: 'Follow-up', color: '#7C5CFF' },
  { id: 'interested', label: 'Interested', color: '#5B4FE9' },
  { id: 'won', label: 'Won', color: '#2C7A50' },
  { id: 'lost', label: 'Lost', color: '#C0392B' },
  { id: 'unfit', label: 'Unfit', color: '#9A9AA0' },
]
const statusMeta = (id: LeadStatus) => STATUS.find((s) => s.id === id) ?? STATUS[0]
// Where the map sits before it has pins to fit: the Magnolia / Woodlands service area.
const HOME_VIEW = { center: { lat: 30.19, lng: -95.62 }, zoom: 11 }
const todayISO = () => new Date().toISOString().slice(0, 10)

type SortKey = 'prospect' | 'reviews' | 'rating' | 'name' | 'area' | 'contacted' | 'newest' | 'source'
const num = (v: number | null | undefined) => (v == null ? -1 : v)

// How sellable a lead is, worst site first. `none` (no website at all) is the surest bet;
// `modern` is someone who already has what we'd be selling. Anything we haven't classified
// sits between the two — worth a look, but behind everything we've confirmed.
const VERDICT_RANK: Record<string, number> = { none: 0, social: 1, builder: 2, stale: 3, unknown: 4, modern: 5 }
export const prospectRank = (l: Lead) => {
  if (l.site_verdict) return VERDICT_RANK[l.site_verdict] ?? 4
  // Rows saved before site checks existed: fall back to what the URL alone tells us.
  if (!l.website || !l.website.trim()) return VERDICT_RANK.none
  return VERDICT_RANK.unknown
}

const SORTS: Record<SortKey, { label: string; cmp: (a: Lead, b: Lead) => number }> = {
  // Default view: the businesses most likely to say yes, busiest first within each tier.
  prospect: {
    label: 'Best prospects (no website first)',
    cmp: (a, b) => prospectRank(a) - prospectRank(b) || num(b.reviews) - num(a.reviews),
  },
  reviews: { label: 'Most reviews', cmp: (a, b) => num(b.reviews) - num(a.reviews) },
  rating: { label: 'Highest rating', cmp: (a, b) => num(b.rating) - num(a.rating) || num(b.reviews) - num(a.reviews) },
  name: { label: 'Name (A–Z)', cmp: (a, b) => a.name.localeCompare(b.name) },
  area: { label: 'Area', cmp: (a, b) => (a.area ?? '').localeCompare(b.area ?? '') || a.name.localeCompare(b.name) },
  contacted: { label: 'Recently contacted', cmp: (a, b) => (b.contacted_on ?? '').localeCompare(a.contacted_on ?? '') },
  newest: { label: 'Newest first', cmp: (a, b) => b.created_at.localeCompare(a.created_at) },
  source: {
    label: 'Source (Grok first)',
    cmp: (a, b) => sourceSortRank(a.source) - sourceSortRank(b.source) || b.created_at.localeCompare(a.created_at),
  },
}

export default function Leads() {
  const { profile } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [area, setArea] = useState<string>('all')
  // Default to "New" so the board shows only leads you haven't reached out to yet;
  // worked leads stay accessible via the status chips.
  const [status, setStatus] = useState<LeadStatus | 'all'>('new')
  const [cat, setCat] = useState<string>('all')
  // Board-side state filter. Separate from `searchState` — that fences what live search
  // fetches, this narrows what you're looking at, including leads saved before the fence.
  const [stateFilter, setStateFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [sort, setSort] = useState<SortKey>('prospect')
  const [open, setOpen] = useState<Lead | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [liveMsg, setLiveMsg] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  // After a live search, scope the board to exactly the leads it returned so they're
  // all visible regardless of the current text/area/status filters.
  const [liveResultIds, setLiveResultIds] = useState<string[] | null>(null)
  const [liveQuery, setLiveQuery] = useState('')
  // The whole point of the board: only surface businesses we can actually sell a site to.
  const [onlyProspects, setOnlyProspects] = useState(true)
  // Fence live search to one state. Persisted — Jordan works Texas, and re-picking it
  // every session is the kind of thing that quietly poisons a lead board.
  const [searchState, setSearchState] = useState<string>(() => localStorage.getItem('relay.searchState') ?? 'TX')
  useEffect(() => { localStorage.setItem('relay.searchState', searchState) }, [searchState])
  const [liveNote, setLiveNote] = useState<string | null>(null)
  // Bulk selection. Held as ids so it survives re-sorts and re-filters.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  // Leave the live-search result view and return to normal filtering.
  const clearLive = useCallback(() => { setLiveResultIds(null); setLiveMsg(null) }, [])

  const load = useCallback(() => {
    supabase.from('leads').select('*').order('reviews', { ascending: false, nullsFirst: false })
      .then(({ data, error }) => {
        if (error) setErr(error.message)
        else { setLeads((data as Lead[]) ?? []); setErr(null) }
        setLoading(false)
      })
  }, [])
  useEffect(() => { load() }, [load])

  // ---- One filter model, so every number on screen means the same thing ----
  //
  // `base` is what we're filtering: the pinned results after a live search, otherwise the
  // whole board. Each filter is a predicate, and every count is computed over base with
  // all the OTHER filters applied. That's what makes the numbers honest — the count on an
  // option is exactly how many rows you get if you pick it. Previously the Area count was
  // "all leads in Magnolia" while the list showed a live-search slice, and the status chips
  // read 0 while 40 rows sat below them.
  const base = useMemo(() => {
    if (!liveResultIds) return leads
    const set = new Set(liveResultIds)
    return leads.filter((l) => set.has(l.id))
  }, [leads, liveResultIds])

  // After a live search the box holds the QUERY ("ac repair in 77354"), not a board filter —
  // matching it against lead names would blank the very results we just fetched.
  const text = liveResultIds ? '' : q.trim().toLowerCase()
  const matchText = useCallback((l: Lead) => !text ||
    [l.name, l.category, l.address, l.phone].some((v) => (v ?? '').toLowerCase().includes(text)), [text])
  const matchArea = useCallback((l: Lead) => area === 'all' || l.area === area, [area])
  const matchCat = useCallback((l: Lead) => cat === 'all' || l.category === cat, [cat])
  const matchStatus = useCallback((l: Lead) => status === 'all' || l.status === status, [status])
  const matchState = useCallback((l: Lead) => stateFilter === 'all' || l.state === stateFilter, [stateFilter])
  const matchSource = useCallback((l: Lead) => matchSourceFilter(l, sourceFilter), [sourceFilter])

  const filtered = useMemo(
    () => base.filter((l) => matchText(l) && matchState(l) && matchSource(l) && matchArea(l) && matchCat(l) && matchStatus(l))
      .sort(SORTS[sort].cmp),
    [base, matchText, matchState, matchSource, matchArea, matchCat, matchStatus, sort],
  )

  // Facet counts: every filter counted against the others, never against the raw board.
  const tally = (rows: Lead[], key: (l: Lead) => string | null) => {
    const c = new Map<string, number>()
    for (const l of rows) { const k = key(l); if (k) c.set(k, (c.get(k) ?? 0) + 1) }
    return c
  }
  const states = useMemo(() => {
    const c = tally(base.filter((l) => matchText(l) && matchSource(l) && matchArea(l) && matchCat(l) && matchStatus(l)), (l) => l.state)
    return [...c.entries()].map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [base, matchText, matchSource, matchArea, matchCat, matchStatus])
  const areas = useMemo(() => {
    const c = tally(base.filter((l) => matchText(l) && matchState(l) && matchSource(l) && matchCat(l) && matchStatus(l)), (l) => l.area)
    return [...c.entries()].map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [base, matchText, matchState, matchSource, matchCat, matchStatus])
  const cats = useMemo(() => {
    const c = tally(base.filter((l) => matchText(l) && matchState(l) && matchSource(l) && matchArea(l) && matchStatus(l)), (l) => l.category)
    return [...c.entries()].map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [base, matchText, matchState, matchSource, matchArea, matchStatus])
  const statusPool = useMemo(
    () => base.filter((l) => matchText(l) && matchState(l) && matchSource(l) && matchArea(l) && matchCat(l)),
    [base, matchText, matchState, matchSource, matchArea, matchCat],
  )
  const sourceCounts = useMemo(() => {
    const pool = base.filter((l) => matchText(l) && matchState(l) && matchArea(l) && matchCat(l) && matchStatus(l))
    const c: Record<SourceFilter, number> = { all: pool.length, relay: 0, grok_google: 0, grok_facebook: 0 }
    for (const l of pool) {
      if (matchSourceFilter(l, 'relay')) c.relay++
      if (l.source === 'grok_google') c.grok_google++
      if (l.source === 'grok_facebook') c.grok_facebook++
    }
    return c
  }, [base, matchText, matchState, matchArea, matchCat, matchStatus])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const l of statusPool) c[l.status] = (c[l.status] ?? 0) + 1
    return c
  }, [statusPool])

  // Keep the open lead on the map even if the current filter would hide it, so changing
  // its status recolors its dot in place rather than making the pin disappear.
  const mapLeads = useMemo(() => {
    if (open && !filtered.some((l) => l.id === open.id)) return [...filtered, open]
    return filtered
  }, [filtered, open])

  // Persist an outreach change and reflect it locally without a full reload.
  async function patch(id: string, fields: Partial<Lead>) {
    const { error } = await supabase.from('leads').update(fields).eq('id', id)
    if (error) { setErr(error.message); return false }
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...fields } : l)))
    setOpen((o) => (o && o.id === id ? { ...o, ...fields } : o))
    return true
  }

  async function remove(id: string) {
    const { error } = await supabase.from('leads').delete().eq('id', id)
    if (error) { setErr(error.message); return }
    setLeads((prev) => prev.filter((l) => l.id !== id))
    setOpen(null)
  }

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // Delete every selected lead in one request. Destructive and not undoable, so it
  // confirms with the count first.
  async function deleteSelected() {
    const ids = [...selected]
    if (!ids.length) return
    const msg = ids.length === 1
      ? 'Delete this lead? This cannot be undone.'
      : `Delete these ${ids.length} leads? This cannot be undone.`
    if (!window.confirm(msg)) return
    setBulkBusy(true)
    const { error } = await supabase.from('leads').delete().in('id', ids)
    setBulkBusy(false)
    if (error) { setErr(error.message); return }
    const gone = new Set(ids)
    setLeads((prev) => prev.filter((l) => !gone.has(l.id)))
    setLiveResultIds((prev) => (prev ? prev.filter((id) => !gone.has(id)) : prev))
    setSelected(new Set())
    setOpen((o) => (o && gone.has(o.id) ? null : o))
  }

  // Bulk status change — marking a batch 'unfit' is how you clear chaff without losing
  // the record that you already looked at them.
  async function markSelected(next: LeadStatus) {
    const ids = [...selected]
    if (!ids.length) return
    setBulkBusy(true)
    const { error } = await supabase.from('leads').update({ status: next }).in('id', ids)
    setBulkBusy(false)
    if (error) { setErr(error.message); return }
    const hit = new Set(ids)
    setLeads((prev) => prev.map((l) => (hit.has(l.id) ? { ...l, status: next } : l)))
    setSelected(new Set())
  }

  // Turn leads into pipeline deals. Everything the search already learned about the
  // business — its old site, socials and trade — rides along, so the builder doesn't
  // have to go find it again. Leads already converted are skipped, not duplicated.
  async function convertToPipeline(rows: Lead[]) {
    if (!profile?.org_id) { setErr('No workspace found.'); return }
    const fresh = rows.filter((l) => !l.deal_id)
    const already = rows.length - fresh.length
    if (!fresh.length) {
      setLiveMsg(already ? 'Already in the pipeline.' : 'Nothing to convert.')
      return
    }
    setBulkBusy(true)
    const payload = fresh.map((l) => ({
      org_id: profile.org_id,
      company: l.name,
      name: l.category ? `${l.category} website` : 'New website',
      contact: '', email: '',
      phone: l.phone,
      website: l.website,
      socials: (l.socials ?? []).map((s) => s.url).join('\n') || null,
      industry: l.category,
      package_id: 'one', addons: [], stage: 'lead',
      source: dealSourceFromLead(l.source),
      // Carry the address and outreach notes over as the starting brief context.
      notes: [l.address, l.notes].filter(Boolean).join('\n'),
      brief: null,
    }))
    const { data, error } = await supabase.from('deals').insert(payload).select('id')
    if (error) { setBulkBusy(false); setErr(error.message); return }

    // Link each lead to its new deal so the board can show it and we never double-convert.
    const ids = (data as { id: string }[] | null) ?? []
    await Promise.all(fresh.map((l, i) => ids[i]
      ? supabase.from('leads').update({ deal_id: ids[i].id, status: 'interested' }).eq('id', l.id)
      : Promise.resolve()))
    const linked = new Map(fresh.map((l, i) => [l.id, ids[i]?.id ?? null]))
    setLeads((prev) => prev.map((l) => (linked.has(l.id)
      ? { ...l, deal_id: linked.get(l.id) ?? null, status: 'interested' as LeadStatus }
      : l)))
    setOpen((o) => (o && linked.has(o.id) ? { ...o, deal_id: linked.get(o.id) ?? null, status: 'interested' } : o))
    setSelected(new Set())
    setBulkBusy(false)
    setLiveMsg(`Added ${fresh.length} to the pipeline${already ? ` (${already} already there)` : ''}. Open Pipeline to work them.`)
  }

  function exportCsv() {
    const cols: (keyof Lead)[] = ['name', 'category', 'area', 'state', 'phone', 'address', 'zip',
      'rating', 'reviews', 'site_verdict', 'site_reason', 'website', 'status', 'contacted_on', 'notes', 'source', 'lat', 'lng']
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = [cols.join(','), ...filtered.map((l) => cols.map((c) => esc(l[c])).join(','))]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relay-leads-${todayISO()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Calls the `lead-search` edge function (holds the Anthropic key server-side).
  // Until that function is deployed, fail gracefully — manual add still works.
  async function liveSearch() {
    const query = q.trim()
    if (!query) { setLiveMsg('Type what to search for (e.g. "roofers in Conroe") then hit Live search.'); return }
    setSearching(true); setLiveMsg(null); setLiveResultIds(null); setLiveNote(null)
    try {
      const { data, error } = await supabase.functions.invoke('lead-search', {
        body: { query, onlyProspects, industry: cat === 'all' ? null : cat, state: searchState },
      })
      if (error) throw error
      const res = data as { leads?: Lead[]; scanned?: number; prospects?: number; area?: string | null; withSocials?: number; outOfState?: number; state?: string; build?: string } | null
      const found = res?.leads ?? []
      // De-dupe by id before upsert (Postgres rejects the same id twice in one upsert).
      const byId = new Map(found.filter((f) => f?.id).map((f) => [f.id, { ...f, source: 'live' as const }]))
      const rows = [...byId.values()]
      if (!rows.length) {
        setLiveMsg(res?.scanned
          ? `Checked ${res.scanned} businesses${res.area ? ` in ${res.area}` : ''} — every one already has a decent site. Turn off “Only no-site & outdated” to see them.`
          : `Live search found no businesses${res?.area ? ` in ${res.area}` : ''}. Check the state is set to ${searchState}, or try a specific trade, e.g. “roofers in Conroe”.`)
        return
      }

      const { data: saved, error: upErr } = await supabase
        .from('leads').upsert(rows, { onConflict: 'id' }).select('id')
      if (upErr) throw upErr

      const ids = (saved as { id: string }[] | null)?.map((r) => r.id) ?? rows.map((r) => r.id)
      await load()
      // Drop any leftover filters — a stale Area/Industry/status from the last session
      // would silently hide the results we just paid Google for.
      setArea('all'); setCat('all'); setStatus('all'); setStateFilter('all'); setSourceFilter('all')
      setLiveResultIds(ids)   // pin the board to just these results
      setLiveQuery(query)
      setLiveMsg(null)
      const bits = [`scanned ${res?.scanned ?? rows.length} businesses${res?.area ? ` in ${res.area}` : ''}`]
      if (res?.withSocials) bits.push(`${res.withSocials} with social profiles`)
      if (res?.outOfState) bits.push(`${res.outOfState} dropped outside ${res.state ?? searchState}`)
      // Surfaces which build of the edge function answered — the only way to tell a stale
      // deploy from a code bug without digging through Supabase logs.
      if (res?.build) bits.push(`engine ${res.build}`)
      setLiveNote(bits.join(' · '))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Live search failed.'
      setLiveMsg(`Live search failed: ${msg}`)
    } finally {
      setSearching(false)
    }
  }

  return (
    <Screen
      title="Leads"
      subtitle="Shared outreach pool"
      actions={
        <>
          <div style={searchWrap}>
            <span style={{ color: 'var(--ink-muted)', display: 'flex' }}><Icon name="search" size={16} /></span>
            <input value={q} onChange={(e) => { setQ(e.target.value); clearLive() }} placeholder="Search name, category, address…" style={searchInput} />
          </div>
          <select
            value={searchState}
            onChange={(e) => setSearchState(e.target.value)}
            style={stateSelect}
            title="Live search only returns businesses in this state"
          >
            {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.code}</option>)}
          </select>
          <button
            onClick={() => setOnlyProspects((v) => !v)}
            style={{ ...ghostBtn, ...(onlyProspects ? prospectOn : null) }}
            title="Only return businesses with no website, a social page, a builder page, or a stale site"
          >
            {onlyProspects ? '◉' : '○'} No-site & outdated only
          </button>
          <button onClick={liveSearch} disabled={searching} style={ghostBtn} title="Find new businesses via web search">
            🔍 {searching ? 'Searching…' : 'Live search'}
          </button>
          <button onClick={exportCsv} className="icon-btn" aria-label="Export CSV" title="Export filtered leads to CSV">
            <Icon name="dashboard" size={18} />
          </button>
          <button onClick={() => setShowAdd(true)} style={addBtn}>＋ Add lead</button>
        </>
      }
    >
      {open && (
        <OutreachDrawer
          lead={open}
          onClose={() => setOpen(null)}
          onPatch={patch}
          onRemove={remove}
          onConvert={(l) => convertToPipeline([l])}
          converting={bulkBusy}
        />
      )}
      {showAdd && <AddLead onClose={() => setShowAdd(false)} onCreated={load} />}

      {liveResultIds && (
        <div style={noticeBox}>
          <span style={{ flex: 1 }}>
            Showing <b>{liveResultIds.length}</b> lead{liveResultIds.length !== 1 ? 's' : ''} from your search{liveQuery ? ` for “${liveQuery}”` : ''}. These are saved to your board.
            {liveNote && <span style={{ color: 'var(--ink-muted)' }}> ({liveNote})</span>}
          </span>
          <button onClick={clearLive} style={noticeClose}>Show all leads</button>
        </div>
      )}
      {liveMsg && (
        <div style={noticeBox}>
          <span style={{ flex: 1 }}>{liveMsg}</span>
          <button onClick={() => setLiveMsg(null)} style={noticeClose}>Dismiss</button>
        </div>
      )}

      {/* Source — where did this lead come from? */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-muted)', marginRight: 2 }}>Source</span>
        {SOURCE_FILTERS.map((s) => (
          <Chip
            key={s.id}
            active={sourceFilter === s.id}
            onClick={() => { setSourceFilter(s.id); clearLive() }}
            dot={s.id === 'relay' ? SOURCE_META.live.color : s.id === 'grok_google' ? SOURCE_META.grok_google.color : s.id === 'grok_facebook' ? SOURCE_META.grok_facebook.color : undefined}
          >
            {s.label}{sourceCounts[s.id] ? ` ${sourceCounts[s.id]}` : ''}
          </Chip>
        ))}
      </div>

      {/* Location + industry + sort */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <label style={selectWrap}>
          <span style={{ color: 'var(--ink-muted)' }}>State</span>
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} style={select}>
            <option value="all">All states ({statusPool.length})</option>
            {states.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}
          </select>
        </label>
        <label style={selectWrap}>
          <span style={{ color: 'var(--ink-muted)' }}>Area</span>
          <select value={area} onChange={(e) => { setArea(e.target.value); clearLive() }} style={select}>
            <option value="all">All areas ({statusPool.length})</option>
            {areas.map((a) => <option key={a.name} value={a.name}>{a.name} ({a.count})</option>)}
          </select>
        </label>
        <label style={selectWrap}>
          <span style={{ color: 'var(--ink-muted)' }}>Industry</span>
          <select value={cat} onChange={(e) => { setCat(e.target.value); clearLive() }} style={select}>
            <option value="all">All industries ({statusPool.length})</option>
            {cats.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
          </select>
        </label>
        <label style={selectWrap}>
          <span style={{ color: 'var(--ink-muted)' }}>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={select}>
            {(Object.keys(SORTS) as SortKey[]).map((k) => <option key={k} value={k}>{SORTS[k].label}</option>)}
          </select>
        </label>
      </div>

      {/* Status */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <Chip active={status === 'all'} onClick={() => setStatus('all')}>All ({statusPool.length})</Chip>
        {STATUS.map((s) => (
          <Chip key={s.id} active={status === s.id && !liveResultIds} onClick={() => { setStatus(s.id); clearLive() }} dot={s.color}>
            {s.label}{counts[s.id] ? ` ${counts[s.id]}` : ''}
          </Chip>
        ))}
      </div>

      {/* Bulk actions — only present once something is picked, so it never adds noise. */}
      {selected.size > 0 && (
        <div style={bulkBar}>
          <b>{selected.size} selected</b>
          <button onClick={() => setSelected(new Set(filtered.map((l) => l.id)))} style={bulkGhost}>
            Select all {filtered.length}
          </button>
          <button onClick={() => setSelected(new Set())} style={bulkGhost}>Clear</button>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => convertToPipeline(filtered.filter((l) => selected.has(l.id)))}
            disabled={bulkBusy}
            style={bulkPrimary}
          >
            → Add to pipeline
          </button>
          <button onClick={() => markSelected('unfit')} disabled={bulkBusy} style={bulkGhost}>Mark unfit</button>
          <button onClick={deleteSelected} disabled={bulkBusy} style={bulkDanger}>
            {bulkBusy ? 'Working…' : `Delete ${selected.size}`}
          </button>
        </div>
      )}

      {loading && <p style={{ color: 'var(--ink-soft)' }}>Loading leads…</p>}
      {err && <div style={errorBox}><b>Something went wrong.</b> {err}</div>}

      {!loading && !err && (
        <>
          <LeadMap leads={mapLeads} onPick={setOpen} />

          <div style={grid}>
            {filtered.map((l) => {
              const m = statusMeta(l.status)
              return (
                <div
                  key={l.id}
                  className="deal-card"
                  style={{ ...card, ...(selected.has(l.id) ? cardSelected : null) }}
                  onClick={() => setOpen(l)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }}
                      onClick={(e) => e.stopPropagation()}   // ticking a box must not open the drawer
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(l.id)}
                        onChange={() => toggleSelect(l.id)}
                        style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
                        aria-label={`Select ${l.name}`}
                      />
                      <b style={{ fontSize: 14.5, lineHeight: 1.25 }}>{l.name}</b>
                    </label>
                    <span style={{ ...pill, color: m.color, background: 'color-mix(in srgb, ' + m.color + ' 14%, transparent)' }}>{m.label}</span>
                  </div>
                  {l.category && <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 3 }}>{l.category}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {l.area && <span style={metaChip}>{l.area}</span>}
                    {l.rating != null && <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }} className="num">★ {l.rating} · {l.reviews ?? 0}</span>}
                    <VerdictBadge lead={l} />
                    <SourceBadge source={l.source} />
                    {l.deal_id && <span style={pipelineBadge}>In pipeline</span>}
                    {(l.socials ?? []).length > 0 && (
                      <span style={metaChip} title={(l.socials ?? []).map((s) => s.url).join('\n')}>
                        {(l.socials ?? []).map((s) => SOCIAL_ICON[s.platform] ?? '🔗').join(' ')}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 12.5, color: 'var(--ink-muted)' }}>
                    <span>{l.phone ?? 'No phone'}</span>
                    {l.contacted_on && <span className="num">contacted {l.contacted_on}</span>}
                  </div>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <p style={{ color: 'var(--ink-soft)', gridColumn: '1 / -1' }}>No leads match these filters.</p>
            )}
          </div>
        </>
      )}
    </Screen>
  )
}

// ---- Real map: Google Maps with status-colored, clickable pins ----
type MapState = 'loading' | 'ready' | 'nokey' | 'error'
function LeadMap({ leads, onPick }: { leads: Lead[]; onPick: (l: Lead) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])
  const lastFitRef = useRef('') // only re-fit when the SET of pins changes, not on a recolor
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick // always call the latest handler without re-running effects
  const [state, setState] = useState<MapState>('loading')

  const pts = leads.filter((l) => l.lat != null && l.lng != null)

  // Load the Google Maps SDK and create the map once.
  useEffect(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!key) { setState('nokey'); return }
    let cancelled = false
    new Loader({ apiKey: key, version: 'weekly' })
      .importLibrary('maps')
      .then(() => {
        if (cancelled || !el.current) return
        mapRef.current = new google.maps.Map(el.current, {
          center: HOME_VIEW.center,
          zoom: HOME_VIEW.zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        })
        setState('ready')
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [])

  // Redraw pins whenever the filtered/sorted leads change.
  useEffect(() => {
    const map = mapRef.current
    if (state !== 'ready' || !map) return
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []
    const bounds = new google.maps.LatLngBounds()
    for (const p of pts) {
      const meta = statusMeta(p.status)
      const position = { lat: p.lat as number, lng: p.lng as number }
      const marker = new google.maps.Marker({
        position, map, title: `${p.name} — ${meta.label}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE, scale: 7,
          fillColor: meta.color, fillOpacity: 0.95, strokeColor: '#fff', strokeWeight: 1.5,
        },
      })
      marker.addListener('click', () => onPickRef.current(p))
      markersRef.current.push(marker)
      bounds.extend(position)
    }
    // Only re-fit the viewport when the SET of pins changes — not when a pin just
    // recolors (status change) — so the dot visibly changes color without the map jumping.
    const sig = pts.map((p) => p.id).join(',')
    if (sig !== lastFitRef.current) {
      if (pts.length) {
        map.fitBounds(bounds, 40)
        if (pts.length === 1) map.setZoom(13)
      } else {
        // Nothing to show. Snap back to the home area rather than keeping the previous
        // filter's viewport — a leftover nationwide view reads as "results from everywhere"
        // when the real answer is "these leads have no coordinates".
        map.setCenter(HOME_VIEW.center)
        map.setZoom(HOME_VIEW.zoom)
      }
      lastFitRef.current = sig
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, state])

  if (state === 'nokey' || state === 'error') {
    return (
      <div style={mapWrap}>
        <div style={mapNotice}>
          {state === 'nokey'
            ? 'Map needs a Google Maps API key (VITE_GOOGLE_MAPS_API_KEY). The list below works without it.'
            : "Couldn't load Google Maps — check the API key's referrer restrictions and that billing is enabled."}
        </div>
      </div>
    )
  }
  return (
    <div style={mapWrap}>
      <div ref={el} style={{ height: 380, width: '100%', background: 'var(--rail)' }} />
      {state === 'ready' && (
        <div style={mappedBadge}>
          {pts.length === 0 && leads.length > 0
            ? `No map coordinates for ${leads.length === 1 ? 'this lead' : 'these leads'}`
            : `${pts.length} of ${leads.length} mapped`}
        </div>
      )}
    </div>
  )
}

// ---- Outreach slide-over ----
function OutreachDrawer({ lead, onClose, onPatch, onRemove, onConvert, converting }: {
  lead: Lead
  onClose: () => void
  onPatch: (id: string, f: Partial<Lead>) => Promise<boolean>
  onRemove: (id: string) => void
  onConvert: (lead: Lead) => void
  converting: boolean
}) {
  const [notes, setNotes] = useState(lead.notes ?? '')
  const [contacted, setContacted] = useState(lead.contacted_on ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = notes !== (lead.notes ?? '') || contacted !== (lead.contacted_on ?? '')

  async function setStatus(s: LeadStatus) {
    // First outreach touch → stamp today's date if none set yet.
    const stamp = s !== 'new' && !contacted ? todayISO() : contacted
    if (stamp !== contacted) setContacted(stamp)
    await onPatch(lead.id, { status: s, contacted_on: stamp || null })
  }
  async function save() {
    setSaving(true)
    await onPatch(lead.id, { notes, contacted_on: contacted || null })
    setSaving(false)
  }

  return (
    <div style={scrim} onClick={onClose}>
      <aside style={drawer} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 19, margin: 0 }}>{lead.name}</h2>
            <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 2 }}>
              {[lead.category, lead.area].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button onClick={onClose} style={xBtn} aria-label="Close">✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {lead.rating != null && <span style={factChip} className="num">★ {lead.rating} · {lead.reviews ?? 0} reviews</span>}
          <span style={factChip}>{lead.web_status}</span>
          <span style={factChip}>{sourceMeta(lead.source).label}</span>
        </div>

        <dl style={{ margin: '18px 0 0', display: 'grid', gap: 10 }}>
          <Field label="Phone">
            {lead.phone ? <a href={`tel:${lead.phone}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{lead.phone}</a> : <span style={{ color: 'var(--ink-muted)' }}>—</span>}
          </Field>
          <Field label="Address">{[lead.address, lead.zip].filter(Boolean).join(' ') || '—'}</Field>
          <Field label="Website">
            {lead.website
              ? <a href={lead.website} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', wordBreak: 'break-all' }}>{lead.website.replace(/^https?:\/\//, '')}</a>
              : <span style={{ color: 'var(--green)', fontWeight: 600 }}>None — strong prospect</span>}
            {lead.site_reason && (
              <div style={{ color: 'var(--ink-muted)', fontSize: 12.5, marginTop: 2 }}>{lead.site_reason}</div>
            )}
          </Field>
          {(lead.socials ?? []).length > 0 && (
            <Field label="Social">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                {(lead.socials ?? []).map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                    {SOCIAL_ICON[s.platform] ?? '🔗'} {s.platform} ↗
                  </a>
                ))}
              </div>
            </Field>
          )}
          {lead.place_id && (
            <Field label="Google">
              <a href={`https://www.google.com/maps/place/?q=place_id:${lead.place_id}`} target="_blank" rel="noreferrer"
                style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                View on Google{lead.reviews ? ` · ${lead.reviews} reviews` : ''} ↗
              </a>
            </Field>
          )}
        </dl>

        <div style={{ marginTop: 22 }}>
          <div style={labelText}>Outreach stage</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {STATUS.map((s) => {
              const on = lead.status === s.id
              return (
                <button key={s.id} onClick={() => setStatus(s.id)}
                  style={{
                    ...stageBtn,
                    color: on ? '#fff' : s.color,
                    background: on ? s.color : 'transparent',
                    borderColor: on ? s.color : 'var(--line)',
                  }}>
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={labelText}>Contacted on</div>
          <input type="date" value={contacted} onChange={(e) => setContacted(e.target.value)} style={input} />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelText}>Notes</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5}
            placeholder="Call notes, who you spoke to, next step…" style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
          <button onClick={save} disabled={!dirty || saving} style={{ ...addBtn, opacity: !dirty || saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {lead.deal_id
            ? <span style={{ ...pipelineBadge, padding: '7px 12px' }}>✓ In pipeline</span>
            : (
              <button onClick={() => onConvert(lead)} disabled={converting} style={convertBtn}>
                {converting ? 'Adding…' : '→ Add to pipeline'}
              </button>
            )}
          <span style={{ flex: 1 }} />
          <button onClick={() => { if (confirm(`Remove ${lead.name} from the lead pool?`)) onRemove(lead.id) }}
            style={dangerBtn}>Delete lead</button>
        </div>
      </aside>
    </div>
  )
}

// ---- Manual add ----
function AddLead({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({ name: '', category: '', area: 'Magnolia', phone: '', address: '', zip: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  async function submit() {
    if (!f.name.trim()) { setErr('Name is required.'); return }
    setSaving(true); setErr(null)
    const { error } = await supabase.from('leads').insert({
      id: crypto.randomUUID(),
      name: f.name.trim(),
      category: f.category.trim() || null,
      area: f.area.trim() || null,
      phone: f.phone.trim() || null,
      address: f.address.trim() || null,
      zip: f.zip.trim() || null,
      source: 'manual',
      status: 'new',
      web_status: 'likely',
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onCreated(); onClose()
  }

  return (
    <div style={scrim} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 18, margin: '0 0 14px' }}>Add lead</h2>
        {err && <div style={{ ...errorBox, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: 'grid', gap: 10 }}>
          <input autoFocus value={f.name} onChange={set('name')} placeholder="Business name *" style={input} />
          <input value={f.category} onChange={set('category')} placeholder="Category (e.g. Roofing)" style={input} />
          <div style={{ display: 'flex', gap: 10 }}>
            <input value={f.area} onChange={set('area')} placeholder="Area" style={{ ...input, flex: 1 }} />
            <input value={f.zip} onChange={set('zip')} placeholder="ZIP" style={{ ...input, width: 110 }} />
          </div>
          <input value={f.phone} onChange={set('phone')} placeholder="Phone" style={input} />
          <input value={f.address} onChange={set('address')} placeholder="Address" style={input} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button onClick={submit} disabled={saving} style={addBtn}>{saving ? 'Adding…' : 'Add lead'}</button>
        </div>
      </div>
    </div>
  )
}

// ---- Small presentational helpers ----
function Chip({ active, onClick, children, dot }: { active: boolean; onClick: () => void; children: React.ReactNode; dot?: string }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999,
      fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'),
      background: active ? 'var(--accent-light-2)' : 'var(--panel)',
      color: active ? 'var(--accent)' : 'var(--ink-soft)',
    }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />}
      {children}
    </button>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 13.5 }}>
      <dt style={{ width: 74, color: 'var(--ink-muted)', flexShrink: 0 }}>{label}</dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
  )
}

const searchWrap: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 36,
  border: '1px solid var(--line)', borderRadius: 10, background: 'var(--panel)', width: 260,
}
const searchInput: React.CSSProperties = {
  border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, width: '100%', fontFamily: 'inherit',
}
const addBtn: React.CSSProperties = {
  padding: '9px 16px', border: 'none', borderRadius: 10, background: 'var(--accent)',
  color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const ghostBtn: React.CSSProperties = {
  padding: '8px 14px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--panel)',
  color: 'var(--ink-soft)', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', fontSize: 13,
}
const dangerBtn: React.CSSProperties = {
  padding: '9px 14px', border: '1px solid var(--line)', borderRadius: 10, background: 'transparent',
  color: '#C0392B', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
}
const selectWrap: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5,
}
const select: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--panel)',
  fontSize: 12.5, fontFamily: 'inherit', color: 'var(--ink)', cursor: 'pointer', outline: 'none',
}
const grid: React.CSSProperties = {
  display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(258px, 1fr))', marginTop: 16,
}
const card: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--line-2)', borderRadius: 12, padding: 14,
  boxShadow: '0 1px 2px rgba(20,20,25,0.04)',
}
const pill: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 7, whiteSpace: 'nowrap', flexShrink: 0,
}
export const SOCIAL_ICON: Record<string, string> = {
  facebook: 'ⓕ', instagram: '◎', youtube: '▶', tiktok: '♪', linkedin: 'in', x: '𝕏', yelp: 'ⓨ',
}
// How each verdict reads on a card. Green = go get them; grey = already has a site.
const VERDICT_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  none: { label: 'No website', color: 'var(--green)', bg: 'var(--green-bg)' },
  social: { label: 'Social page only', color: '#8A5A00', bg: '#FDF3E0' },
  builder: { label: 'Builder page', color: '#8A5A00', bg: '#FDF3E0' },
  stale: { label: 'Outdated site', color: '#A03A2B', bg: '#FCEDEA' },
  modern: { label: 'Has a site', color: 'var(--ink-muted)', bg: 'var(--rail)' },
}
// The reason lives in the tooltip so the card stays scannable — hover tells you WHY
// we called a site outdated ("Copyright still says 2016") instead of asking for trust.
function SourceBadge({ source }: { source: Lead['source'] }) {
  const m = sourceMeta(source)
  return (
    <span style={{ ...metaChip, color: m.color, borderColor: `color-mix(in srgb, ${m.color} 30%, var(--line-3))` }} title={m.label}>
      {m.short}
    </span>
  )
}

function VerdictBadge({ lead }: { lead: Lead }) {
  const key = lead.site_verdict ?? (!lead.website?.trim() ? 'none' : null)
  if (!key) return null
  const v = VERDICT_STYLE[key]
  if (!v) return null
  if (key === 'modern') return null   // not a prospect; no need to shout about it
  return (
    <span style={{ ...noSiteBadge, color: v.color, background: v.bg }} title={lead.site_reason ?? v.label}>
      {v.label}
    </span>
  )
}

const metaChip: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 500, color: 'var(--ink-soft)', background: 'var(--rail)',
  border: '1px solid var(--line-3)', padding: '2px 8px', borderRadius: 6,
}
const noSiteBadge: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--green)', background: 'var(--green-bg)',
  padding: '2px 8px', borderRadius: 6,
}
// Live-search toggle in its "on" state.
const prospectOn: React.CSSProperties = {
  borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 600,
}
const bulkBar: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12,
  padding: '10px 14px', borderRadius: 11, background: 'var(--accent-light)',
  border: '1px solid #DBD3FF', fontSize: 13.5,
}
const bulkGhost: React.CSSProperties = {
  padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--panel)',
  color: 'var(--ink)', fontWeight: 500, fontSize: 13, cursor: 'pointer',
}
const bulkPrimary: React.CSSProperties = {
  padding: '6px 14px', border: 'none', borderRadius: 8, background: 'var(--accent)',
  color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
}
const bulkDanger: React.CSSProperties = {
  padding: '6px 14px', border: 'none', borderRadius: 8, background: '#C0392B',
  color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
}
const convertBtn: React.CSSProperties = {
  padding: '8px 14px', border: 'none', borderRadius: 9, background: 'var(--accent)',
  color: '#fff', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
}
const pipelineBadge: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-light)',
  padding: '2px 8px', borderRadius: 6,
}
const cardSelected: React.CSSProperties = {
  borderColor: 'var(--accent)', boxShadow: '0 0 0 2px var(--accent-light)',
}
const stateSelect: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13,
  background: 'var(--panel)', color: 'var(--ink)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
}
const mapWrap: React.CSSProperties = {
  position: 'relative', background: 'var(--rail)', border: '1px solid var(--line-2)',
  borderRadius: 14, marginBottom: 16, overflow: 'hidden',
}
const mappedBadge: React.CSSProperties = {
  position: 'absolute', bottom: 10, right: 12, zIndex: 500, pointerEvents: 'none',
  fontSize: 11, fontWeight: 500, color: 'var(--ink-soft)', background: 'rgba(251,251,250,0.9)',
  border: '1px solid var(--line-2)', borderRadius: 7, padding: '2px 8px',
}
const mapNotice: React.CSSProperties = {
  display: 'grid', placeItems: 'center', textAlign: 'center', height: 120, padding: 20,
  color: 'var(--ink-soft)', fontSize: 13, background: 'var(--rail)',
}
const errorBox: React.CSSProperties = {
  background: 'var(--amber-bg)', border: '1px solid var(--amber-2)', color: 'var(--amber)',
  borderRadius: 12, padding: 14, maxWidth: 560,
}
const noticeBox: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, background: 'var(--accent-light-2)',
  border: '1px solid var(--accent-light)', color: 'var(--ink-2)', borderRadius: 12,
  padding: '10px 14px', marginBottom: 14, fontSize: 13.5,
}
const noticeClose: React.CSSProperties = {
  border: 'none', background: 'transparent', color: 'var(--accent)', fontWeight: 600,
  cursor: 'pointer', fontSize: 12.5, flexShrink: 0,
}
const scrim: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(20,20,25,0.32)', zIndex: 50,
  display: 'flex', justifyContent: 'flex-end',
}
const drawer: React.CSSProperties = {
  width: 440, maxWidth: '92vw', height: '100%', background: 'var(--panel)',
  borderLeft: '1px solid var(--line)', padding: 24, overflowY: 'auto',
}
const modal: React.CSSProperties = {
  margin: 'auto', width: 440, maxWidth: '92vw', background: 'var(--panel)',
  border: '1px solid var(--line)', borderRadius: 16, padding: 22, alignSelf: 'center',
  boxShadow: '0 24px 60px -20px rgba(20,20,25,0.4)',
}
const xBtn: React.CSSProperties = {
  border: '1px solid var(--line)', background: 'var(--panel)', borderRadius: 8, width: 30, height: 30,
  cursor: 'pointer', color: 'var(--ink-soft)', flexShrink: 0,
}
const factChip: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)', background: 'var(--rail)',
  border: '1px solid var(--line-3)', padding: '3px 9px', borderRadius: 7,
}
const labelText: React.CSSProperties = {
  fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-muted)', marginBottom: 7,
}
const stageBtn: React.CSSProperties = {
  padding: '6px 11px', borderRadius: 8, border: '1px solid', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
const input: React.CSSProperties = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 9,
  background: 'var(--panel)', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', color: 'var(--ink)',
}
