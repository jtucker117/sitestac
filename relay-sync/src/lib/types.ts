// Domain types — mirror the Supabase schema (snake_case columns kept as-is).

export type Role = 'Owner' | 'Admin' | 'Salesperson' | 'Builder'
export type Stage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won'
export type PackageId = 'one' | 'three' | 'multi'

// Outreach lead pool (shared team prospecting board — see supabase/004_leads.sql).
export type LeadStatus = 'new' | 'contacted' | 'followup' | 'interested' | 'won' | 'lost' | 'unfit'
export type LeadSource = 'places' | 'manual' | 'live' | 'grok_google' | 'grok_facebook'

// none = no website at all (best prospect) … modern = has a current site (not a prospect).
export type SiteVerdict = 'none' | 'social' | 'builder' | 'stale' | 'modern'
export interface SocialLink { platform: string; url: string }

export interface Lead {
  id: string
  place_id: string | null
  name: string
  category: string | null
  area: string | null
  phone: string | null
  address: string | null
  zip: string | null
  rating: number | null
  reviews: number | null
  web_status: 'confirmed' | 'likely' | 'maybe'
  website: string | null
  state: string | null
  // Why this business is (or isn't) a prospect — set by the lead-search function after it
  // actually fetches their homepage. See supabase/012_leads_site_quality.sql.
  site_verdict: SiteVerdict | null
  site_reason: string | null
  socials: SocialLink[] | null
  // Set once this lead has been converted into a pipeline deal (migration 014).
  deal_id: string | null
  lat: number | null
  lng: number | null
  source: LeadSource
  status: LeadStatus
  contacted_on: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Profile {
  user_id: string
  org_id: string | null
  name: string
  email: string
  role: Role
  pending: boolean
}

export interface Brief {
  website?: string
  social?: string
  industry?: string
  timeline?: string
  pages?: string[]
  tones?: string[]
  content?: string[]
  colors?: string[]
  fonts?: string[]
  logo?: string | null
  refs?: string[]
  notes?: string
  gbp?: string
  valueProp?: string
  cta?: string
  location?: string
}

export interface Deal {
  id: string
  org_id: string
  company: string
  name: string
  contact: string
  email: string
  phone?: string | null
  website?: string | null
  socials?: string | null
  industry?: string | null
  package_id: PackageId
  addons: string[]
  stage: Stage
  source: string
  notes: string
  brief: Brief | null
  created_at: string
  updated_at: string
}

export interface Comment {
  id: string
  deal_id: string
  author: string
  initials: string
  text: string
  created_at: string
}

export interface Attachment {
  id: string
  deal_id: string
  type: 'link' | 'image'
  url: string
  label?: string | null
  name?: string | null
}

export interface Activity {
  id: string
  title: string
  deal: string
  type: 'call' | 'email' | 'meeting' | 'task'
  bucket: 'today' | 'tomorrow' | 'week'
  done: boolean
}

export interface Pin {
  id: string
  preview_slug: string
  x: number
  y: number
  text: string
  reply?: string | null
  replied_by?: string | null
  replied_at?: string | null
  resolved: boolean
}

export interface Preview {
  slug: string
  deal_id: string | null
  company: string
  contact: string
  client_email: string
  package_name: string
  tier_name: string
  status: 'review' | 'approved' | 'changes'
  active: boolean
  build_status?: 'building' | 'shipped' | null
  published_at: string
  expiry: string
  decided_at?: string | null
  updated_at: string
}

export interface InvoiceLine {
  id: string
  invoice_id: string
  descr: string
  amount: number
  recurring: boolean
  custom: boolean
  sort: number
}

export interface Invoice {
  id: string
  deal_id: string
  number: string
  status: 'draft' | 'sent' | 'paid'
  deposit_pct: number
  tax_pct: number
  notes: string
  client_name: string
  client_company: string
  client_email: string
  auto_bill: boolean
  bill_day?: number | null
  created_at: string
  sent_at?: string | null
  paid_at?: string | null
}
