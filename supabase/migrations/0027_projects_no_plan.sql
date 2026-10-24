-- ═══════════════════════════════════════════════════════════════════════
-- KONTENT REJASIZ LOYIHALAR
-- ═══════════════════════════════════════════════════════════════════════
-- Hozirgacha har bir loyiha MAJBURIY ravishda oylik kontent rejasi
-- (N post, M stories) bilan yaratilardi va shu zahoti birinchi davr
-- ochilardi. Lekin agentlikda bunday bo'lmagan doimiy mijozlar ham
-- bor: faqat video, faqat dizayn, yoki boshqa turdagi ish. Ular uchun
-- avval soxta raqam kiritishdan boshqa yo'l yo'q edi — o'sha soxta
-- raqam esa keyin "bajarilmagan reja" va "qarz" bo'lib hisobotlarga
-- kirib ketardi.
--
-- `has_plan = false` loyihada:
--   • davr (project_cycles) umuman ochilmaydi;
--   • post/stories belgilash ekrani ko'rsatilmaydi;
--   • Bugun sahifasidagi bajarilish foizi va qarz hisobiga kirmaydi.
-- Qolgan hamma narsa bir xil: jamoa, SMM (mas'ul), rang, vazifalar,
-- filtrlar.
--
-- Standart qiymat `true` — mavjud loyihalarning hammasi rejali, ya'ni
-- ularga bu migratsiya hech qanday ta'sir qilmaydi.
-- ═══════════════════════════════════════════════════════════════════════

alter table projects add column if not exists has_plan boolean not null default true;

-- Rejasiz loyihada maqsad raqamlari ma'nosiz — ular noldan boshqa
-- bo'lib qolsa, keyin reja qayta yoqilganda kutilmagan davr ochilardi.
alter table projects drop constraint if exists projects_no_plan_zero_targets;
alter table projects add constraint projects_no_plan_zero_targets
  check (has_plan or (posts_target = 0 and stories_target = 0));
