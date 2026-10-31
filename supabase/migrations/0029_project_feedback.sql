-- ═══════════════════════════════════════════════════════════════════
-- MIJOZ FIKRI — har oy, har loyiha uchun bitta baho
--
-- Biznes egasi oy yakunida bizning ishimizga baho beradi: to'rtta
-- emotsiya va ixtiyoriy izoh. Maqsad — norozilikni shartnoma tugaganda
-- emas, o'sha oyda bilish (LTV).
--
-- Fikrni XODIM emas, mijozning O'ZI qoldiradi: har loyiha-oy uchun
-- maxsus havola ochiladi va mijozga yuboriladi. Shuning uchun `token`
-- shu yerda, yozuvning o'zida turadi — havola bitta loyihaning bitta
-- oyini ochadi, boshqa hech narsani.
--
-- Bitta loyiha + bitta oy = bitta yozuv (unique). Yozuv havola
-- so'ralganda yaratiladi, `rating` esa mijoz belgilaganda to'ladi:
-- ya'ni "so'ralgan, lekin javob yo'q" holati ham ko'rinib turadi.
-- ═══════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

create table if not exists project_feedback (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id)       on delete cascade,
  -- Davr keyin o'chirilsa ham fikr yo'qolmasin: oy `period_month` da
  -- alohida saqlanadi va hisobot o'shanga tayanadi.
  cycle_id     uuid          references project_cycles(id) on delete set null,
  period_month text not null check (period_month ~ '^\d{4}-\d{2}$'),
  -- Havola: /fikr/<token>. Faqat harf va raqam — qo'lda ko'chirish oson.
  token        text not null unique check (token ~ '^[a-z0-9]{10,32}$'),
  -- 1 = juda norozi, 4 = mamnun. Mijoz belgilamaguncha null.
  rating       smallint check (rating between 1 and 4),
  note         text check (note is null or length(note) <= 500),
  asked_by     uuid          references users(id)          on delete set null,
  asked_at     timestamptz not null default now(),
  filled_at    timestamptz
);

create unique index if not exists one_feedback_per_project_month
  on project_feedback (project_id, period_month);

create index if not exists idx_feedback_project on project_feedback (project_id);
-- Boshqaruv bo'limi oy kesimida o'qiydi.
create index if not exists idx_feedback_month   on project_feedback (period_month);

-- Baho bor bo'lsa to'ldirilgan vaqti ham bo'lishi shart va aksincha —
-- "bahosiz lekin to'ldirilgan" yozuv hisobotni buzadi.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'feedback_filled_consistent') then
    alter table project_feedback add constraint feedback_filled_consistent
      check ((rating is null) = (filled_at is null));
  end if;
end $$;
