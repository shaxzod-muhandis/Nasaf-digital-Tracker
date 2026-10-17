-- ═══════════════════════════════════════════════════════════════════════
-- UMUMIY KALENDAR («Nasaf Tracker · Umumiy kalendar» TZ v1.0, 11-bo'lim)
--
-- Jamoaning barcha rejalari — syomka, uchrashuv, montaj, yig'ilish —
-- bitta kalendarda. Har reja bitta EGAsiga tegishli (blok rangi
-- shundan olinadi) va bir nechta ishtirokchisi bo'lishi mumkin.
--
-- Takrorlanuvchi rejalar NUSXA sifatida saqlanmaydi: bazada bitta
-- yozuv va RRULE qoidasi turadi, nusxalar ko'rsatish paytida
-- hisoblanadi. Shuning uchun "har dushanba" rejasini bir marta
-- tahrirlash yetarli, minglab qator yaratilmaydi. Bitta nusxani
-- alohida o'zgartirish kerak bo'lsa — `event_exceptions`.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Xodim rangi ────────────────────────────────────────────────────
-- Blok rangi shu yerdan olinadi. Ilgari rang faqat frontendda,
-- username'dan hisoblanardi (`personColor`) — kalendar uchun bu
-- yetarli emas: rang barqaror bo'lishi va admin uni o'zgartira olishi
-- kerak. Bo'sh bo'lsa frontend eski usulga qaytadi, shuning uchun
-- `null` ham to'g'ri qiymat.
alter table users add column if not exists color text;

create table if not exists events (
  id            uuid primary key default gen_random_uuid(),
  title         varchar(120) not null,
  start_at      timestamptz  not null,
  end_at        timestamptz  not null,
  all_day       boolean      not null default false,
  -- RFC 5545 qoidasi, masalan FREQ=WEEKLY;BYDAY=MO. Bo'sh — takrorlanmaydi.
  rrule         text,
  rrule_until   timestamptz,
  -- «Hammasi» uchun reja — faqat admin yarata oladi.
  is_team       boolean      not null default false,
  owner_id      uuid         not null references users(id) on delete cascade,
  project_id    uuid         references projects(id) on delete set null,
  place         varchar(200),
  note          text,
  -- Eslatma necha daqiqa oldin yuborilsin. null — eslatma yo'q.
  remind_before int,
  created_by    uuid         not null references users(id) on delete cascade,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),
  -- Soft delete: o'chirilgan rejaga eski havola ochilsa, "bu reja
  -- o'chirilgan" deb aytish uchun yozuv qoladi.
  deleted_at    timestamptz,
  constraint events_end_after_start check (end_at > start_at)
);

-- Davr bo'yicha so'rov (GET /api/events?from=&to=) eng ko'p
-- ishlatiladigan so'rov — o'chirilganlari indeksda umuman bo'lmasin.
create index if not exists idx_events_range on events(start_at, end_at) where deleted_at is null;
create index if not exists idx_events_owner on events(owner_id) where deleted_at is null;
-- Takrorlanuvchilar davr so'roviga `start_at` bo'yicha tushmaydi
-- (seriya oldin boshlangan bo'lishi mumkin), shuning uchun ular
-- alohida olinadi.
create index if not exists idx_events_rrule on events(rrule) where rrule is not null and deleted_at is null;

create table if not exists event_participants (
  event_id uuid not null references events(id) on delete cascade,
  user_id  uuid not null references users(id) on delete cascade,
  -- 'going' — qatnashadi, 'declined' — o'zini chiqargan.
  status   text not null default 'going' check (status in ('going', 'declined')),
  primary key (event_id, user_id)
);

create index if not exists idx_event_participants_user on event_participants(user_id);

-- Takrorlanuvchi rejaning BITTA nusxasi: bekor qilingan yoki
-- o'zgartirilgan. `original_start` — nusxa qaysi takrorlanishga
-- tegishli ekanini aniqlaydi.
create table if not exists event_exceptions (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid        not null references events(id) on delete cascade,
  original_start timestamptz not null,
  is_cancelled   boolean     not null default false,
  -- Faqat o'zgargan maydonlar: {"title": "...", "start_at": "...", ...}
  override_json  jsonb,
  unique (event_id, original_start)
);

-- Eslatmalar navbati. Har bir ishtirokchi va har bir TAKRORLANISH
-- uchun alohida qator — shunda bitta eslatma ikki marta yuborilmaydi
-- (`sent_at` belgilanadi) va seriyaning har bir nusxasi o'z vaqtida
-- keladi.
create table if not exists event_reminders (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid        not null references events(id) on delete cascade,
  user_id          uuid        not null references users(id) on delete cascade,
  occurrence_start timestamptz not null,
  send_at          timestamptz not null,
  sent_at          timestamptz,
  unique (event_id, user_id, occurrence_start)
);

-- Navbatni tekshiradigan so'rov: "vaqti kelgan va hali yuborilmagan".
create index if not exists idx_event_reminders_due on event_reminders(send_at) where sent_at is null;
