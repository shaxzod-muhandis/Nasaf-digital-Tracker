-- ═══════════════════════════════════════════════════════════════════════
-- KALENDAR OBUNASI (ICS feed)
--
-- Xodim trackerdagi rejalarini o'z telefonidagi kalendarda (Google
-- Calendar, Apple Calendar) ko'rishi uchun har kimga maxfiy havola
-- beriladi: /api/kalendar/<token>.ics
--
-- Token — PAROLNING o'rnini bosadi: havolaga ega bo'lgan har kim shu
-- xodimning rejalarini o'qiy oladi. Shuning uchun u tasodifiy uuid va
-- faqat xodimning o'ziga ko'rsatiladi; oshkor bo'lsa yangisini
-- yaratish kifoya (ustun yangilanadi, eski havola o'lik bo'ladi).
--
-- Ataylab `null` bo'lishi mumkin: token faqat xodim «kalendarga
-- ulash» tugmasini bosganda yaratiladi — hech kim ishlatmasa, hech
-- qanday ochiq havola ham mavjud bo'lmaydi.
-- ═══════════════════════════════════════════════════════════════════════

alter table users add column if not exists calendar_token uuid;

create unique index if not exists idx_users_calendar_token
  on users(calendar_token) where calendar_token is not null;

-- ── Xodim pochtasi ──────────────────────────────────────────────────
-- Shaxsiy kalendarga ulanish uchun so'raladi. Ataylab `null` bo'lishi
-- mumkin: profil to'liqligi tekshiruviga (PROFILE_REQUIRED_FIELDS)
-- QO'SHILMAYDI — aks holda pochtasini kiritmagan har bir xodim
-- ilovaga kira olmay qolardi.
alter table users add column if not exists email text;

-- Bir pochta ikki xodimda bo'lmasin (bo'shlari hisobga olinmaydi).
create unique index if not exists idx_users_email
  on users(lower(email)) where email is not null;
