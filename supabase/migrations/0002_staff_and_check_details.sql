-- ═══════════════════════════════════════════════════════════════════════
-- Nasaf Digital Tracker — Faza 2: Xodimlar (staff) va check tafsilotlari
-- ═══════════════════════════════════════════════════════════════════════
-- Nima qo'shiladi:
--   1) staff  — montajchi / mobilograf / SMM manager va h.k. ro'yxati.
--      Bu users jadvalidan MUSTAQIL: video oluvchi odam Telegram'ga
--      kirmasa ham bu yerda bo'ladi (admin qo'lda kiritadi).
--   2) checks — har bir bajarilgan post uchun: kim montaj qildi, kim
--      video oldi va ish qaysi kunga tegishli (work_date).
--
-- work_date — kalendar uchun asosiy maydon. done_at "qachon belgilandi"ni
-- yozadi, work_date esa "ish qaysi kuni bajarildi"ni. Kecha chiqqan postni
-- bugun belgilasa, work_date kechagi kun bo'lib qoladi.
--
-- Bu fayl IDEMPOTENT — `npm run db:migrate` uni qayta ishga tushirsa ham
-- xato bermaydi (migrate.js barcha .sql fayllarni har safar qo'llaydi).
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── STAFF ─────────────────────────────────────────────────────────────
create table if not exists staff (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  position   text not null default 'boshqa',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists staff_active_position_idx
  on staff (is_active, position);

-- Bir xil ism ikki marta kiritilmasin (faqat faol yozuvlar orasida)
create unique index if not exists staff_name_position_uniq
  on staff (lower(full_name), position)
  where is_active;

-- ── CHECKS: kim bajardi + qaysi kun ───────────────────────────────────
alter table checks
  add column if not exists editor_id uuid references staff(id) on delete set null;

alter table checks
  add column if not exists videographer_id uuid references staff(id) on delete set null;

alter table checks
  add column if not exists work_date date;

-- Eski yozuvlarda work_date bo'sh — done_at (Toshkent vaqti) dan to'ldiramiz
update checks
   set work_date = ((done_at at time zone 'UTC') at time zone 'Asia/Tashkent')::date
 where work_date is null;

-- Tabel (oylik hisobot) so'rovlari uchun
create index if not exists checks_work_date_idx      on checks (work_date);
create index if not exists checks_editor_idx         on checks (editor_id)       where editor_id is not null;
create index if not exists checks_videographer_idx   on checks (videographer_id) where videographer_id is not null;
