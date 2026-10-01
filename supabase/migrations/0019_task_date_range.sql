-- ═══════════════════════════════════════════════════════════════════════
-- Vazifaga ish oynasi: "qaysi kundan qaysi kungacha". Avval faqat
-- `due_date` (muddat) bor edi — xodim ishni qachon boshlashi kerakligi
-- hech qayerda yozilmasdi, faqat qachon tugatishi kerakligi yozilardi.
--
-- `due_date` ataylab o'z ma'nosida qoladi — u oraliqning OXIRI, ya'ni
-- muddat. Kechikish, "necha kun qoldi", saralash, eskalatsiya va devor
-- ekrani — hammasi avvalgidek `due_date` ustida ishlayveradi, bu ustun
-- esa ustiga qo'shiladi. Eski vazifalarda `start_date` bo'sh qoladi va
-- ular avvalgidek faqat muddatli vazifa bo'lib ko'rinaveradi.
-- ═══════════════════════════════════════════════════════════════════════

alter table tasks add column if not exists start_date date;

-- Oraliq teskari bo'lib qolmasin. Ikkalasi ham bo'sh bo'lishi mumkin
-- (backlog'dagi vazifada hali muddat ham yo'q).
alter table tasks drop constraint if exists tasks_start_before_due;
alter table tasks add constraint tasks_start_before_due
  check (start_date is null or due_date is null or start_date <= due_date);

-- Jurnalda muddat o'zgarishi allaqachon yoziladi; boshlanish sanasi
-- uchun ham alohida tur kerak.
alter table task_activity drop constraint if exists task_activity_kind_check;
alter table task_activity add constraint task_activity_kind_check
  check (kind in ('comment', 'created', 'status_change', 'assignment_change',
                  'deadline_change', 'priority_change', 'start_change'));

create index if not exists idx_tasks_start_date
  on tasks(start_date) where status not in ('done', 'cancelled');
