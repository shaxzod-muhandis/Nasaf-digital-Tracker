-- ═══════════════════════════════════════════════════════════════════
-- BILDIRISHNOMALAR MARKAZI (desktop dizayn D29, 2026-11-12)
--
-- MUAMMO. Ilova ichida bildirishnoma yo'q edi — hamma narsa faqat
-- Telegram xabari bo'lib ketardi. Telegram xabari o'qilgach yo'qolib
-- ketadi, «nima bo'lgan edi» degan savolga javob yo'q edi. Desktopdagi
-- qo'ng'iroq esa ilovadagi ma'lumotdan taxmin qilardi va «o'qildi»
-- holati faqat bitta brauzerda saqlanardi.
--
-- YECHIM. Telegram xabarini yuboradigan backend yordamchilari
-- (lib/notify.js, evNotify, e'lon) shu jadvalga ham yozadi — bitta
-- hodisa ikki kanalga ketadi. `read_at` serverda, shuning uchun telefon
-- va kompyuterda bir xil.
--
-- SAQLASH. 90 kun, keyin /api/cron-daily o'chiradi (o'qilmaganlar ham).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  -- vazifa | ncoin | kalendar | qarz | davr | ruxsat | elon | nshop | fikr
  type         text not null,
  title        text not null,
  body         text,
  -- Nimaga tegishli: task | event | project | purchase | feedback | ...
  entity_type  text,
  entity_id    text,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  tg_message_id bigint
);

create index if not exists idx_notifications_user_created
  on notifications (user_id, created_at desc);
create index if not exists idx_notifications_user_unread
  on notifications (user_id) where read_at is null;

-- 0032 dagi qoida: har yangi jadvalda RLS (siyosatsiz — anon/authenticated
-- to'siladi, server `postgres` roli bilan chetlab o'tadi).
alter table notifications enable row level security;
