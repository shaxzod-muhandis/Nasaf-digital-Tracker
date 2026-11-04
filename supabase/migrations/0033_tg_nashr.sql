-- ═══════════════════════════════════════════════════════════════════
-- TASDIQLANGAN ISHNI MIJOZ GURUHIGA AVTOMATIK YUBORISH
--
-- Shu paytgacha montajchi ichki "Montaj" guruhida tekshiruvdan o'tgan
-- videoni mijoz guruhiga QO'LDA ko'chirardi. Esdan chiqardi va butun
-- tizim shu joyda uzilardi.
--
-- Endi: montaj mavzusidagi videoga reaksiya qo'yilsa, bot uni o'sha
-- loyihaning mijoz guruhidagi kerakli mavzuga ko'chiradi.
--
--   👍  video/fayl → Kontent,  rasm → Dizayn
--   🔥  har qanday tur → Stories
--
-- Manzil IKKI BOSQICHDA topiladi, ikkalasi ham shu migratsiyada
-- qo'shilgan ustunlarga tayanadi:
--   1. Manba mavzusi qaysi loyiha  → tg_topics.project_id
--   2. O'sha loyihaning mijoz guruhi → tg_groups.kind = 'mijoz'
--      va uning kerakli mavzusi      → tg_topics.purpose
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Yangi guruh turi: 'mijoz' ───────────────────────────────────
-- Eski cheklov montaj/dizayn/video bilan chegaralangan edi. Mijoz
-- guruhi — botning YOZADIGAN joyi, eshitadigan joyi emas, shuning
-- uchun alohida tur.
alter table tg_groups drop constraint if exists tg_groups_kind_check;
alter table tg_groups add constraint tg_groups_kind_check
  check (kind is null or kind in ('montaj', 'dizayn', 'video', 'mijoz'));

-- ── 2. Mavzuning vazifasi ──────────────────────────────────────────
-- Mijoz guruhida mavzular LOYIHA bo'yicha emas, MAZMUN turi bo'yicha
-- bo'linadi (Kontent / Stories / Dizayn). `project_id` esa o'z
-- ma'nosida qoladi — montaj guruhida mavzu = loyiha.
alter table tg_topics add column if not exists purpose text
  check (purpose is null or purpose in ('kontent', 'stories', 'dizayn'));

-- Bitta mijoz guruhida bitta vazifa ikki marta belgilanmasin: aks
-- holda bot ikkita "Kontent" mavzusidan qaysi birini tanlashni
-- bilmay qolardi.
create unique index if not exists one_purpose_per_chat
  on tg_topics (chat_id, purpose) where purpose is not null;

-- ── 3. Nashr tarixi ────────────────────────────────────────────────
-- Uch vazifani bajaradi:
--   • takror yuborishning oldini oladi (unique);
--   • "qaytarib olish" uchun manzildagi xabar id'sini saqlaydi;
--   • kim tasdiqlaganini yozib qo'yadi.
create table if not exists tg_publications (
  id             bigserial primary key,
  -- Manba: ichki guruhdagi asl xabar.
  src_chat_id    bigint not null,
  src_message_id bigint not null,
  -- Manzil: mijoz guruhidagi nusxa.
  dst_chat_id    bigint not null,
  dst_thread_id  bigint,
  dst_message_id bigint not null,
  purpose        text   not null,
  project_id     uuid references projects(id) on delete set null,
  approved_by    uuid references users(id) on delete set null,
  -- Qaysi reaksiya yuborishga sabab bo'ldi — tarixda ko'rinib tursin.
  emoji          text,
  created_at     timestamptz not null default now(),
  -- Qaytarib olingan bo'lsa — qachon. Qator o'chirilmaydi: nima
  -- bo'lganini bilish kerak.
  revoked_at     timestamptz,
  revoked_by     uuid references users(id) on delete set null
);

-- Bitta asl xabar bitta manzilga faqat bir marta ketadi. Qaytarib
-- olingach qayta yuborish mumkin bo'lishi uchun `revoked_at is null`
-- sharti bor — ya'ni cheklov faqat KUCHDAGI nashrlarga tegishli.
create unique index if not exists one_live_publication
  on tg_publications (src_chat_id, src_message_id, purpose)
  where revoked_at is null;

create index if not exists idx_tgpub_dst
  on tg_publications (dst_chat_id, dst_message_id);
create index if not exists idx_tgpub_project
  on tg_publications (project_id, created_at desc);

-- 0032 aytib o'tgan edi: Postgres yangi jadvalga RLS'ni O'ZI yoqmaydi,
-- Supabase esa `public` sxemadagi har bir jadvalni PostgREST orqali
-- anon kalit bilan ochadi. Siyosatsiz RLS = hech kimga ruxsat yo'q;
-- ilova `postgres` roli bilan ulangani uchun (rolbypassrls) o'zgarish
-- sezmaydi.
alter table tg_publications enable row level security;
