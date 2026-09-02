-- ═══════════════════════════════════════════════════════════════════════
-- Telegram bot — foydalanuvchi kirish nazorati (Access Control)
-- ═══════════════════════════════════════════════════════════════════════
-- Avvalgi tizimda `is_active` faqat ikki holatni bilardi: bor/yo'q.
-- TZ endi UCHTA aniq holatni talab qiladi — har biri o'z ma'nosiga ega:
--   active  — botdan foydalanishi mumkin
--   blocked — vaqtincha to'xtatilgan (tizimda qoladi, keyin qaytarilishi
--             mumkin) — "block/unblock"
--   removed — kirish huquqi butunlay olib tashlangan ("remove" — Telegram
--             akkauntning o'ziga hech qanday ta'sir qilmaydi, faqat shu
--             botga kirish huquqi)
--
-- `is_active` ustuni ATAYLAB saqlanadi va shu ustundan avtomatik hisoblab
-- turiladi (access_status='active' bo'lsa true, aks holda false) — chunki
-- kodning boshqa ko'p joylarida (auth, bildirishnomalar, va h.k.) hali
-- ham shu ustunga tayanadi; ularni o'zgartirish shart emas, chunki
-- ikkalasi doim sinxron turadi.
-- ═══════════════════════════════════════════════════════════════════════

alter table users add column if not exists access_status text not null default 'active'
  check (access_status in ('active', 'blocked', 'removed'));
alter table users add column if not exists access_granted_at timestamptz not null default now();
alter table users add column if not exists blocked_at timestamptz;

-- Mavjud is_active=false userlar — eng kam destruktiv taxmin sifatida
-- "blocked" deb belgilanadi (kerak bo'lsa admin keyin alohida "remove"
-- qila oladi; bu ularning tizimdan butunlay o'chib ketishini oldini
-- oladi).
update users set access_status = 'blocked', blocked_at = now()
  where is_active = false and access_status = 'active';
