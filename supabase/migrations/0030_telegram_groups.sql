-- ═══════════════════════════════════════════════════════════════════
-- TELEGRAM GURUHLARI — botning "qulog'i"
--
-- Shu paytgacha bot faqat xabar YUBORARDI. Endi u guruhlardagi
-- xabarlarni ham eshitadi: dizayner guruhida `/task` orqali vazifa
-- ochiladi, montaj va video guruhlarida esa kim nima tashlagani
-- hisoblanadi.
--
-- Guruh QO'LDA kiritilmaydi: bot guruhga qo'shilgach, undan kelgan
-- birinchi xabarda o'zi ro'yxatdan o'tadi (`kind` bo'sh holda).
-- Admin keyin Boshqaruv bo'limida "bu qaysi guruh" ekanini belgilaydi.
-- Shu sabab chat_id ni qo'lda topib kiritish kerak emas.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists tg_groups (
  -- Supergruppa id'si katta manfiy son bo'ladi (-100...), shuning
  -- uchun bigint.
  chat_id      bigint primary key,
  title        text,
  -- Bo'sh = bot guruhni ko'rdi, lekin admin hali turini belgilamagan.
  kind         text check (kind is null or kind in ('montaj', 'dizayn', 'video')),
  is_forum     boolean not null default false,
  -- Butun guruh bitta loyihaga tegishli bo'lsa (mavzusiz guruhlar uchun).
  project_id   uuid references projects(id) on delete set null,
  -- `/task` kimga biriktirilsin (dizayn guruhi uchun).
  assignee_id  uuid references users(id) on delete set null,
  is_active    boolean not null default true,
  added_at     timestamptz not null default now(),
  last_seen_at timestamptz
);

-- Forum guruhida har mavzu bitta loyiha: shunda xabar qaysi loyiha
-- haqida ekanini bot o'zi biladi, hashtag ham, taxmin ham kerak emas.
create table if not exists tg_topics (
  chat_id    bigint not null references tg_groups(chat_id) on delete cascade,
  thread_id  bigint not null,
  title      text,
  project_id uuid references projects(id) on delete set null,
  seen_at    timestamptz not null default now(),
  primary key (chat_id, thread_id)
);

create table if not exists tg_messages (
  id          bigserial primary key,
  chat_id     bigint not null,
  message_id  bigint not null,
  thread_id   bigint,
  -- Xabar egasi bizning xodimmi: bog'lanmasa ham xabar yo'qolmaydi
  -- (mijoz yoki mehmon yozgan bo'lishi mumkin).
  user_id     uuid references users(id) on delete set null,
  tg_user_id  bigint,
  tg_username text,
  -- text | video | video_note | photo | document | audio | voice | other
  kind        text not null,
  body        text,
  -- Qaysi xabarga javob berilgan — montaj muhokamasini yig'ish uchun.
  reply_to    bigint,
  sent_at     timestamptz not null,
  created_at  timestamptz not null default now(),
  -- Telegram bitta xabarni qayta yuborishi mumkin (javobni kutmasa),
  -- shuning uchun takrorlanmasligi bazada kafolatlanadi.
  unique (chat_id, message_id)
);

create index if not exists idx_tgmsg_chat_time on tg_messages (chat_id, sent_at desc);
create index if not exists idx_tgmsg_user      on tg_messages (user_id, sent_at desc);
-- Video hisobi shu indeksdan o'qiydi.
create index if not exists idx_tgmsg_media     on tg_messages (kind, sent_at desc)
  where kind in ('video', 'video_note', 'document');
create index if not exists idx_tgmsg_reply     on tg_messages (chat_id, reply_to)
  where reply_to is not null;

-- Vazifa guruhdan ochilgan bo'lsa, qaysi xabardan kelganini bilib
-- turamiz: guruhga javob yozish va takroriy ochilishning oldini olish.
alter table tasks add column if not exists tg_chat_id    bigint;
alter table tasks add column if not exists tg_message_id bigint;
create unique index if not exists one_task_per_tg_message
  on tasks (tg_chat_id, tg_message_id)
  where tg_chat_id is not null and tg_message_id is not null;
