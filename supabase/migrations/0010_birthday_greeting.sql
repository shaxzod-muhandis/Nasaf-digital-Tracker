-- ═══════════════════════════════════════════════════════════════════════
-- Tug'ilgan kun tabrigi — xodim o'z tug'ilgan kuni ilovani ochganda bir
-- marta ko'radigan tabrik oynasi. Shu kuni allaqachon ko'rsatilganini
-- bilish uchun sana saqlanadi (har safar qayta ochilishida qayta-qayta
-- chiqib turmasligi uchun).
-- ═══════════════════════════════════════════════════════════════════════

alter table users add column if not exists birthday_ack_date date;
