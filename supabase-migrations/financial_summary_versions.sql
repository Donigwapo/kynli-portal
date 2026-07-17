-- Financial summary version history for import review workflow

create table if not exists public.financial_summary_versions (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null,
  tenant_slug text not null,
  financial_period_id uuid null,
  version_number integer not null,
  summary text not null,
  change_source text not null,
  change_note text null,
  created_by_user_id text null,
  created_by_role text null,
  restored_from_version_id uuid null,
  created_at timestamptz not null default now(),

  constraint uq_financial_summary_versions_import_version unique (import_id, version_number),
  constraint ck_financial_summary_versions_source check (change_source in (
    'initial_extraction',
    'manual_edit',
    'ai_revision',
    'restored_version',
    'final_approved'
  )),
  constraint fk_financial_summary_versions_import
    foreign key (import_id) references public.financial_import_jobs(import_id) on delete cascade,
  constraint fk_financial_summary_versions_restored_from
    foreign key (restored_from_version_id) references public.financial_summary_versions(id) on delete set null
);

create index if not exists idx_financial_summary_versions_import_created_desc
  on public.financial_summary_versions (import_id, created_at desc);

create index if not exists idx_financial_summary_versions_import_version_desc
  on public.financial_summary_versions (import_id, version_number desc);
