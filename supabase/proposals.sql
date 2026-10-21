-- Proposal intake for the Future FG portal.
-- Additive only: two new tables, nothing existing is touched.
-- Safe to run more than once. Run in the Supabase SQL Editor.

create table if not exists public.ffg_proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  status text not null default 'new'
    check (status in ('new','underwriting','approved','accepted','on_book','declined')),

  -- where it came from
  source text not null default 'email',
  email_message_id text unique,
  email_subject text,
  email_from text,
  email_received_at timestamptz,
  raw_text text,
  dcf_quote_id uuid,
  dealer_id uuid,
  created_by text,

  -- who sent it (acceptance goes back to them)
  rep_name text,
  rep_email text,

  -- the customer
  company_name text,
  company_number text,
  customer_email text,
  customer_id uuid,

  -- the deal as quoted
  product_type text check (product_type in ('hp','fl','loan')),
  asset_description text,
  asset_condition text,
  supplier_name text,
  supplier_number text,
  cash_price numeric,
  vat numeric,
  deposit numeric,
  commission numeric,
  commission_pct numeric,
  financed numeric,
  term_months integer,
  quoted_rate_pct numeric,
  quoted_monthly numeric,
  extras jsonb not null default '{}'::jsonb,

  -- checks and underwriting
  checks jsonb,
  checks_at timestamptz,
  uw_decision text check (uw_decision in ('approve','refer','decline')),
  uw_notes text,
  uw_by text,
  uw_at timestamptz,

  -- the rate we agree
  agreed_rate_pct numeric,
  agreed_term_months integer,
  agreed_deposit numeric,
  agreed_commission numeric,
  agreed_financed numeric,
  agreed_monthly numeric,
  agreed_total_repayable numeric,
  agreed_by text,
  agreed_at timestamptz,

  -- the acceptance we send back
  acceptance_to text,
  acceptance_subject text,
  acceptance_body text,
  acceptance_sent_at timestamptz,
  acceptance_sent_by text,
  acceptance_provider_id text,

  decline_reason text,
  declined_at timestamptz,

  -- once it is on the book
  agreement_id uuid,
  agreement_number text,
  booked_at timestamptz,
  booked_by text
);

create index if not exists ffg_proposals_status_idx on public.ffg_proposals (status, created_at desc);
create index if not exists ffg_proposals_company_number_idx on public.ffg_proposals (company_number);
-- One proposal per DCF quote, whether it arrived by email or by the Send to FFG button.
create unique index if not exists ffg_proposals_dcf_quote_uidx on public.ffg_proposals (dcf_quote_id) where dcf_quote_id is not null;

create table if not exists public.ffg_proposal_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.ffg_proposals(id) on delete cascade,
  created_at timestamptz not null default now(),
  actor text,
  kind text not null,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists ffg_proposal_events_proposal_idx on public.ffg_proposal_events (proposal_id, created_at);

-- Same as the other tables: row level security on, no policies. The portal
-- reaches these through the service role from its admin API routes only.
alter table public.ffg_proposals enable row level security;
alter table public.ffg_proposal_events enable row level security;
