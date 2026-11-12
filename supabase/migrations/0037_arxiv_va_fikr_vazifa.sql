-- ═══════════════════════════════════════════════════════════════════
-- LOYIHA ARXIVI SANASI va MIJOZ FIKRIDAN VAZIFA (D20, D24; 2026-11-12)
--
-- 1. projects.archived_at — Boshqaruv → Loyihalar → «Arxiv» ro'yxatida
--    «Arxivlangan · 12-okt» yozuvi uchun. Avval arxivlash faqat
--    `is_active = false` qo'yardi va qachon arxivlangani noma'lum edi.
--    Eski arxivlanganlar uchun sana bo'sh qoladi (taxmin qilinmaydi).
--
-- 2. tasks.feedback_id — norozi mijoz bahosidan ochilgan vazifa shu
--    javobga bog'lanadi. Mijoz fikri panelida vazifa holati ko'rinadi,
--    ya'ni «norozi mijoz bilan nima qilindi» degan savolga javob bor.
--    Fikr o'chirilsa vazifa qoladi (set null).
-- ═══════════════════════════════════════════════════════════════════

alter table projects add column if not exists archived_at timestamptz;

alter table tasks add column if not exists feedback_id uuid
  references project_feedback(id) on delete set null;

create index if not exists idx_tasks_feedback on tasks (feedback_id) where feedback_id is not null;
