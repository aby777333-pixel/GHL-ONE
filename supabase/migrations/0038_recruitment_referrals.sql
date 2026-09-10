-- 0038 — Recruitment: record who made a referral.
--
-- `candidates.source` could already say 'referral', but there was nowhere to put the referrer, so
-- the record knew a referral had happened and not who to thank, follow up with, or pay. Additive:
-- one nullable column, no backfill, no policy change (`cand_write` is column-agnostic).

alter table public.candidates
  add column if not exists referred_by uuid references public.profiles(id) on delete set null;

comment on column public.candidates.referred_by is
  'Who referred this candidate. Only meaningful when source = ''referral''; null otherwise.';

-- Answering "which of my referrals are still in play" should not scan the table.
create index if not exists candidates_referred_by_idx
  on public.candidates (referred_by)
  where referred_by is not null;
