-- ═══════════════════════════════════════════════════════════════════════
-- Vazifa ichidagi checklist (tekshiruv ro'yxati) — vazifa detali
-- sahifasidagi "Sinf xonalari · 4 ta" kabi band-band belgilanadigan
-- ro'yxat uchun.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists task_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  text       text not null,
  done       boolean not null default false,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_checklist_task on task_checklist_items(task_id, position);
