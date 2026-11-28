-- ═══════════════════════════════════════════════════════════════════
-- POST TURI: VIDEO yoki DIZAYN (karusel) — 2026-11-28, egasi
--
-- Post har doim video bo'lmaydi: dizayner ora-orada karusel yoki dizayn
-- post tayyorlaydi va u ham post rejasiga hisoblanadi. Video postda
-- "Video olgan" + "Montaj qildi" so'raladi, dizayn postda esa
-- "Dizayn qildi" (dizayner). Ncoin: dizayner +1, SMM +1 (egasi tanlovi).
--
-- post_kind faqat post (type='k') qatorlarida ma'noli; eski qatorlar
-- NULL — video post deb hisoblanadi. (0041 raqami aqlli-bot shoxida
-- band, shuning uchun 0042.)
-- ═══════════════════════════════════════════════════════════════════

alter table checks add column if not exists post_kind text;
alter table checks drop constraint if exists checks_post_kind_check;
alter table checks add constraint checks_post_kind_check
  check (post_kind is null or post_kind in ('video', 'design'));

alter table checks add column if not exists designer_user_id uuid references users(id) on delete set null;
