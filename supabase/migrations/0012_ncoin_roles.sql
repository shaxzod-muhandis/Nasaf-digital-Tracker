-- ═══════════════════════════════════════════════════════════════════════
-- Ncoin — rol-asosli mukofot. Endi "kim video oldi / kim montaj
-- qildi" loyihaga biriktirilgan USERlardan tanlanadi (avvalgi
-- staff-based editor_id/videographer_id — staff'lar tizimga
-- kirmagani uchun Ncoin/bildirishnoma ololmasdi). Shu bilan birga
-- loyiha-ichidagi rol (SMM menejer va h.k.) permissions'ga qo'shiladi.
-- ═══════════════════════════════════════════════════════════════════════

-- permissions: loyiha-ichidagi rol — bitta (xodim, loyiha) juftligi
-- uchun bitta rol. staff.position bilan bir xil so'zlar ishlatiladi.
alter table permissions add column if not exists role text;

alter table permissions drop constraint if exists permissions_role_check;
alter table permissions add constraint permissions_role_check
  check (role is null or role in ('montajchi', 'mobilograf', 'smm', 'dizayner', 'kopirayter', 'boshqa'));

create index if not exists idx_permissions_project_role
  on permissions(project_id, role) where role is not null;

-- checks: user-based video/montaj tanlovi + stories turi. ESKI
-- staff-based editor_id/videographer_id ustunlariga TEGILMAYDI —
-- tarixiy ma'lumot saqlanadi, bular YANGI, parallel ustunlar.
alter table checks add column if not exists editor_user_id uuid references users(id) on delete set null;
alter table checks add column if not exists videographer_user_id uuid references users(id) on delete set null;
alter table checks add column if not exists story_kind text;

alter table checks drop constraint if exists checks_story_kind_check;
alter table checks add constraint checks_story_kind_check
  check (story_kind is null or story_kind in ('info', 'atmospheric'));

-- story_kind faqat stories (type='s') qatorlarda mantiqiy.
alter table checks drop constraint if exists checks_story_kind_only_for_stories;
alter table checks add constraint checks_story_kind_only_for_stories
  check (type = 's' or story_kind is null);

create index if not exists checks_editor_user_idx on checks (editor_user_id) where editor_user_id is not null;
create index if not exists checks_videographer_user_idx on checks (videographer_user_id) where videographer_user_id is not null;
