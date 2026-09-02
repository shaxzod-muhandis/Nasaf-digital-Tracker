-- ═══════════════════════════════════════════════════════════════════════
-- Loyiha shablonlari — "Yangi loyiha" modalidagi "Shablon sifatida
-- saqlash" / "Shablondan" funksiyasi uchun.
-- ═══════════════════════════════════════════════════════════════════════
-- Faqat hajm konfiguratsiyasini saqlaydi (post/stories soni) — sana va
-- mas'ul har safar loyihaga xos bo'lgani uchun shablonga kirmaydi.

create table if not exists project_templates (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  posts_target   int  not null check (posts_target >= 0),
  stories_target int  not null check (stories_target >= 0),
  created_by     uuid references users(id),
  created_at     timestamptz not null default now()
);
