-- ═══════════════════════════════════════════════════════════════════════
-- Ncoin "yangi" belgisi — xodim Profilida balans kartasi ustida, hali
-- ko'rmagan (ishlab topgan) Ncoin tranzaksiyasi bo'lsa, qizil nuqta
-- chiqadi. "Ncoin tarixi"ni ochganda shu vaqt yozib qo'yiladi, shundan
-- keyingi tranzaksiyalargacha nuqta ko'rinmaydi.
-- ═══════════════════════════════════════════════════════════════════════

alter table users add column if not exists ncoin_seen_at timestamptz;
