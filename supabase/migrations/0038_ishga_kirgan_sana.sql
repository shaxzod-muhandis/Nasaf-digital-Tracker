-- ═══════════════════════════════════════════════════════════════════
-- ISHGA KIRGAN SANA (D16, 2026-11-12)
--
-- Profil'dagi «Jamoada 1 yil 3 oydan beri» avval `users.created_at`
-- dan hisoblanardi — bu xodim botga birinchi kirgan kun, ishga kirgan
-- kun emas (bot jamoadan ancha keyin ishga tushgan). Endi admin
-- Xodimlar bo'limida haqiqiy sanani kiritadi; bo'sh bo'lsa avvalgidek
-- `created_at` ishlatiladi.
-- ═══════════════════════════════════════════════════════════════════

alter table users add column if not exists hire_date date;
