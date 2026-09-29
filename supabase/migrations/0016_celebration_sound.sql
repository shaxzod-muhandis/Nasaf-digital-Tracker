-- ═══════════════════════════════════════════════════════════════════════
-- Har bir xodimning "tabrik ovozi" — devor ekranida (TV) uning ishi
-- bajarilgani haqida tabrik chiqqanda ijro etiladigan qisqa (5 soniyagacha)
-- audio. Faylning o'zi Vercel Blob'da saqlanadi, bu yerda faqat uning
-- ochiq URL'i yoziladi. Bo'sh bo'lsa — standart "qarsaklar" ovozi ijro
-- etiladi (u audio fayl emas, ekranda Web Audio orqali sintez qilinadi).
-- ═══════════════════════════════════════════════════════════════════════

alter table users add column if not exists celebration_sound_url text;
