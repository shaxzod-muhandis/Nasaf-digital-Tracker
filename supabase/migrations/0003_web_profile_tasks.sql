-- ═══════════════════════════════════════════════════════════════════════
-- Nasaf Digital Tracker — Faza: Web profil + Tasks
-- ═══════════════════════════════════════════════════════════════════════
-- Nima qo'shiladi:
--   1) users jadvaliga profil maydonlari (ism, familiya, tug'ilgan sana,
--      telefon, lavozim) + telegram_user_id (Telegram Login Widget'ni
--      mos akkauntga bog'lash uchun barqaror raqamli identifikator —
--      username o'zgarishi mumkin, lekin bu son o'zgarmaydi).
--   2) tasks jadvali — muayyan xodimga (users YOKI staff) biriktirilgan,
--      muddati bor alohida vazifalar (ROADMAP Faza 2).
--
-- Bu fayl IDEMPOTENT — `npm run db:migrate` uni qayta ishga tushirsa ham
-- xato bermaydi.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── USERS: profil maydonlari ─────────────────────────────────────────
alter table users add column if not exists first_name text;
alter table users add column if not exists last_name  text;
alter table users add column if not exists birth_date date;
alter table users add column if not exists phone      text;

-- "job_title" ataylab "position" deb nomlanmadi — staff.position allaqachon
-- boshqa narsani anglatadi (montajchi/mobilograf/... ishlab chiqarish roli).
-- Bu yerda esa kompaniyadagi lavozim (masalan "SMM Manager") — erkin matn.
alter table users add column if not exists job_title  text;

-- Telegram Login Widget javobida keladigan barqaror raqamli id. username
-- o'zgarishi mumkin, lekin bu qiymat doimiy — shu orqali Mini App va Web
-- akkauntlari bitta users qatoriga bog'lanadi.
alter table users add column if not exists telegram_user_id bigint unique;

-- Login Widget'dan keladigan profil rasmi (ixtiyoriy, bor bo'lsa UI'da ko'rsatiladi)
alter table users add column if not exists avatar_url text;

create index if not exists idx_users_telegram_user_id
  on users(telegram_user_id) where telegram_user_id is not null;

-- ── TASKS — muayyan xodimga biriktirilgan, muddati bor vazifalar ────
-- checks.editor_id/videographer_id bilan bir xil naqsh: bitta vazifa YOKI
-- users (Telegram akkaunti bor xodim) YOKI staff (Telegram'siz xodim) ga
-- biriktirilishi mumkin — ikkalasiga birdan emas (pastdagi check bilan).
create table if not exists tasks (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid references projects(id) on delete set null,
  title             text not null,
  description       text,
  assignee_user_id  uuid references users(id) on delete set null,
  assignee_staff_id uuid references staff(id) on delete set null,
  due_date          date,
  status            text not null default 'todo'
                       check (status in ('todo','in_progress','done','cancelled')),
  created_by        uuid not null references users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz,
  check (assignee_user_id is null or assignee_staff_id is null)
);

create index if not exists idx_tasks_assignee_user
  on tasks(assignee_user_id) where assignee_user_id is not null;
create index if not exists idx_tasks_assignee_staff
  on tasks(assignee_staff_id) where assignee_staff_id is not null;
create index if not exists idx_tasks_project
  on tasks(project_id) where project_id is not null;
create index if not exists idx_tasks_due
  on tasks(due_date) where status not in ('done','cancelled');
