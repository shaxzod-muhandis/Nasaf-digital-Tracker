-- ═══════════════════════════════════════════════════════════════════════
-- Nasaf Digital Tracker — Vazifalar: Taglar + Izoh/Activity tarixi
-- ═══════════════════════════════════════════════════════════════════════
-- Yangi dizayn asosida Vazifalar bo'limi qayta ishlanmoqda:
--   - "tags" / "task_tags" — vazifalarga qo'llaniladigan taglar
--     (Syomka/Post/Reels/Stories/Matn/Dizayn bilan urug'lanadi, "+ Yangi"
--     orqali kengaytiriladi). Rang saqlanmaydi — mavjud brend palitradan
--     frontend'da deterministik tanlanadi.
--   - "task_activity" — izohlar VA tizim tomonidan avtomatik yoziladigan
--     status/mas'ul/muddat/ustuvorlik o'zgarishlari bitta xronologik
--     jadvalda (Vazifa detali'dagi yagona oqim uchun).
--
-- Bu fayl IDEMPOTENT — `npm run db:migrate` uni qayta ishga tushirsa ham
-- xato bermaydi.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into tags (name) values
  ('Syomka'), ('Post'), ('Reels'), ('Stories'), ('Matn'), ('Dizayn')
on conflict (name) do nothing;

create table if not exists task_tags (
  task_id uuid not null references tasks(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

create table if not exists task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  actor_user_id uuid references users(id),
  kind text not null check (kind in
    ('comment', 'created', 'status_change', 'assignment_change',
     'deadline_change', 'priority_change')),
  body text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_activity_task on task_activity(task_id, created_at);
