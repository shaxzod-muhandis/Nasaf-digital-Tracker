-- ═══════════════════════════════════════════════════════════════════════
-- Tabrik ovozi endi TO'LIQ qo'shiq bo'lishi mumkin — xodim uning
-- ichidan 10 soniyalik parchani o'zi tanlaydi. Bu yerda o'sha
-- parchaning boshlanish nuqtasi (soniyada) saqlanadi; faylning o'zi
-- kesilmaydi (serverda audio qayta ishlash kutubxonasi yo'q), devor
-- ekrani shu nuqtadan boshlab 10 soniya ijro etadi.
-- ═══════════════════════════════════════════════════════════════════════

alter table users add column if not exists celebration_sound_start real not null default 0;
