-- Target: Supabase PostgreSQL public.field_jobs
-- Loop: 5 — Completed Immutability
-- Status: already applied to shared Supabase on 2026-09-23
-- Does not modify existing table rows during installation
-- Preserves completed lifecycle while allowing evidence corrections

-- Loop 5: completed is terminal for one field_jobs row.
-- Evidence columns remain editable; lifecycle/progress/submission identity do not regress.
create or replace function public.preserve_completed_field_job_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'completed' then
    new.status := 'completed';
    new.current_step := 6;
    new.submitted_at := old.submitted_at;
  end if;

  if new.status = 'completed' then
    new.current_step := 6;
    if old.submitted_at is not null then
      new.submitted_at := old.submitted_at;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_preserve_completed_field_job_lifecycle
  on public.field_jobs;
create trigger trg_preserve_completed_field_job_lifecycle
  before update on public.field_jobs
  for each row
  execute function public.preserve_completed_field_job_lifecycle();

-- Rollback (run only after reviewing completed-row invariants):
-- DROP TRIGGER IF EXISTS trg_preserve_completed_field_job_lifecycle
--   ON public.field_jobs;
-- DROP FUNCTION IF EXISTS
--   public.preserve_completed_field_job_lifecycle();
