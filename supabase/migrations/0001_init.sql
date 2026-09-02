-- ═══════════════════════════════════════════════════════════════════════
-- Nasaf Digital Tracker — Faza 1: Supabase (Postgres) sxemasi
-- ═══════════════════════════════════════════════════════════════════════
-- Bu fayl JSONBin.io o'rnini bosuvchi asosiy sxema. Supabase SQL Editor'da
-- (yoki `psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql`) orqali
-- bir marta ishga tushiriladi.
--
-- MUHIM: Bu jadvallarga faqat Netlify Function (ishonchli server-tomon,
-- service-role connection string bilan) ulanadi. Shu sababli Row Level
-- Security (RLS) ataylab YOQILMAGAN — avtorizatsiya (kim nimani ko'radi/
-- o'zgartiradi) to'liq Express middleware darajasida (netlify/functions/
-- api.js) amalga oshiriladi, xuddi hozirgi tizimdagidek. Agar kelajakda
-- brauzerdan to'g'ridan-to'g'ri (anon key bilan) ulanish qo'shilsa, RLS'ni
-- albatta yoqish kerak bo'ladi.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto"; -- gen_random_uuid() uchun

-- ── USERS ─────────────────────────────────────────────────────────────
-- Eski tizimdagi SUPER_ADMINS/ALLOWED_USERNAMES qattiq yozilgan ro'yxatlari
-- endi shu jadvalga ko'chadi — yangi xodim qo'shish uchun kod deploy shart
-- emas, admin panel orqali qo'shiladi.
create table if not exists users (
  id               uuid primary key default gen_random_uuid(),
  username         text not null unique,          -- telegram username, kichik harf, @ siz
  full_name        text,
  telegram_chat_id text,                           -- bot xabar yuborish uchun (register-chat orqali to'ldiriladi)
  role             text not null default 'employee'
                     check (role in ('super_admin', 'admin', 'employee')),
  is_active        boolean not null default true,  -- false = kirish taqiqlangan (ALLOWED_USERNAMES'dan chiqarilgan bilan barobar)
  created_at       timestamptz not null default now()
);
create index if not exists idx_users_telegram_chat_id on users(telegram_chat_id) where telegram_chat_id is not null;

-- ── PROJECTS (mijoz/loyihalar) ───────────────────────────────────────
-- Eski tizimda loyiha bitta "oy"ga tegishli edi (clients[] ichida).
-- Endi loyiha mustaqil: o'zining anchor_date'i (davri qachon boshlanishi)
-- va joriy standart maqsadlariga ega. anchor_date = 1-sana bo'lsa —
-- oddiy kalendar-oy loyihasi; boshqa kun bo'lsa — o'sha kundan boshlab
-- oylik davrlar hisoblanadi (5-bo'lim, ROADMAP.md).
create table if not exists projects (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,   -- eski "clientId" (masalan "cocacola") — barqaror kalit
  label          text not null,
  anchor_date    date not null,          -- birinchi davr shu kundan boshlanadi
  posts_target   int  not null default 0 check (posts_target >= 0),   -- yangi davr ochilganda ishlatiladigan standart maqsad
  stories_target int  not null default 0 check (stories_target >= 0),
  is_active      boolean not null default true,   -- false = loyiha arxivlangan, yangi davr ochilmaydi
  created_at     timestamptz not null default now()
);

-- ── PROJECT CYCLES — har loyihaning o'z oylik davri ─────────────────
-- "months" jadvali o'rnini bosadi, lekin GLOBAL emas — har project_id
-- o'zining mustaqil ketma-ket davrlariga ega.
create table if not exists project_cycles (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  cycle_index    int  not null,             -- 1, 2, 3, ... (shu loyiha uchun tartib raqami)
  period_start   date not null,
  period_end     date not null,             -- shu kun ham davrga kiradi (inclusive)
  posts_target   int  not null check (posts_target >= 0),
  stories_target int  not null check (stories_target >= 0),
  status         text not null default 'active' check (status in ('active', 'closed')),
  is_debt        boolean not null default false,   -- closed bo'lganda: barcha post/stories done emasmi
  closed_at      timestamptz,
  created_at     timestamptz not null default now(),
  unique (project_id, cycle_index),
  check (period_end >= period_start)
);
create index if not exists idx_cycles_project_status on project_cycles(project_id, status);
-- Har loyihada bir vaqtning o'zida faqat bitta "active" davr bo'lishi kerak:
create unique index if not exists idx_one_active_cycle_per_project
  on project_cycles(project_id) where status = 'active';

-- ── CHECKS — har bir post/story belgisi ─────────────────────────────
-- Eski tizimdagi kabi "sparse" (faqat bajarilganlar saqlanadi): qator
-- mavjudligi = shu post/story bajarilgan degani. Belgi bekor qilinsa,
-- qator o'chiriladi. Bu legacy checks{} obyekti bilan bevosita mos keladi.
create table if not exists checks (
  cycle_id   uuid not null references project_cycles(id) on delete cascade,
  type       text not null check (type in ('k', 's')),  -- k=post, s=story (legacy nomlanish saqlandi)
  seq_number int  not null check (seq_number >= 1),
  done_at    timestamptz not null default now(),
  done_by    uuid references users(id),
  primary key (cycle_id, type, seq_number)
);

-- ── PERMISSIONS — kim qaysi loyihaga ruxsatli / jamoa a'zosi ────────
create table if not exists permissions (
  user_id    uuid not null references users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index if not exists idx_permissions_project on permissions(project_id);

-- ── NOTIFICATION LOG (ixtiyoriy audit/debug) ────────────────────────
create table if not exists notification_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users(id),
  chat_id    text,
  message    text,
  status     text,        -- 'sent' | 'error'
  error      text,
  created_at timestamptz not null default now()
);
create index if not exists idx_notification_log_created on notification_log(created_at desc);

-- ── APP SETTINGS — kalit/qiymat (masalan oxirgi cycle-rollover vaqti) ─
create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Eslatma: gamifikatsiya/bonus jadvallari (points_ledger, bonuses,
-- mvp_awards, project_compensation) ataylab BU migratsiyada YO'Q —
-- ular ROADMAP.md'dagi Faza 3'da, tegishli funksiyalar qurilayotganda
-- alohida migratsiya (0002_...) sifatida qo'shiladi. Shu bosqichda
-- schema'ni haddan tashqari oldindan shishirmaslik uchun.
-- ═══════════════════════════════════════════════════════════════════════
