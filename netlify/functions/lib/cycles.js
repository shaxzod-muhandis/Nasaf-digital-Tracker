// ═══════════════════════════════════════════════════════════════════════
// Loyiha davri (cycle) mexanizmi — ROADMAP.md 5-bo'lim
// ═══════════════════════════════════════════════════════════════════════
// Har loyiha o'zining anchor_date'idan boshlab ketma-ket oylik davrlarga
// bo'linadi. Bu modul: joriy davrni topish/yaratish (avtomatik rollover),
// davr yopilganda "qarz" (is_debt) hisoblash, va davr statistikasini
// hisoblash uchun javobgar.
//
// DIZAYN QARORI: rollover CRON'ga to'liq bog'liq emas — har safar loyiha
// o'qilganda (`ensureCurrentCycle`) lazily tekshiriladi va kerak bo'lsa
// yangi davr ochiladi. Bu eski tizimning "har doim ishlaydi, hatto cron
// bir marta ishlamay qolsa ham" falsafasini davom ettiradi. Alohida
// /api/cycles/rollover endpoint esa PROAKTIV tarzda (kimdir ilovani
// ochishini kutmasdan) barcha loyihalarni yangilab, bildirishnoma
// yuborish uchun ishlatiladi (masalan kunlik cron orqali).
// ═══════════════════════════════════════════════════════════════════════

const { cycleBounds, todayTashkent, addMonthsClamped } = require("./dates");

async function getActiveCycle(db, projectId) {
  const r = await db.query(
    `select * from project_cycles where project_id = $1 and status = 'active' limit 1`,
    [projectId],
  );
  return r.rows[0] || null;
}

async function getCycleById(db, cycleId) {
  const r = await db.query(`select * from project_cycles where id = $1`, [cycleId]);
  return r.rows[0] || null;
}

async function countDoneChecks(db, cycleId) {
  const r = await db.query(
    `select
       count(*) filter (where type = 'k') as done_k,
       count(*) filter (where type = 's') as done_s
     from checks where cycle_id = $1`,
    [cycleId],
  );
  return {
    doneK: parseInt(r.rows[0].done_k, 10),
    doneS: parseInt(r.rows[0].done_s, 10),
  };
}

async function closeCycle(db, cycleId) {
  const cycle = await getCycleById(db, cycleId);
  if (!cycle || cycle.status === "closed") return cycle;
  const { doneK, doneS } = await countDoneChecks(db, cycleId);
  const isDebt = doneK < cycle.posts_target || doneS < cycle.stories_target;
  const r = await db.query(
    `update project_cycles set status = 'closed', is_debt = $2, closed_at = now()
     where id = $1 returning *`,
    [cycleId, isDebt],
  );
  return r.rows[0];
}

// Yopilgan davrda checkbox orqaga qaytarilib bosilganda (qarz to'lash),
// is_debt qayta hisoblanadi.
async function recomputeDebtIfClosed(db, cycleId) {
  const cycle = await getCycleById(db, cycleId);
  if (!cycle || cycle.status !== "closed") return cycle;
  const { doneK, doneS } = await countDoneChecks(db, cycleId);
  const isDebt = doneK < cycle.posts_target || doneS < cycle.stories_target;
  if (isDebt === cycle.is_debt) return cycle;
  const r = await db.query(
    `update project_cycles set is_debt = $2 where id = $1 returning *`,
    [cycleId, isDebt],
  );
  return r.rows[0];
}

async function createNextCycle(db, project, cycleIndex) {
  const { periodStart, periodEnd } = cycleBounds(project.anchor_date_str, cycleIndex);
  try {
    const r = await db.query(
      `insert into project_cycles
         (project_id, cycle_index, period_start, period_end, posts_target, stories_target)
       values ($1,$2,$3,$4,$5,$6)
       returning *`,
      [
        project.id,
        cycleIndex,
        periodStart,
        periodEnd,
        project.posts_target,
        project.stories_target,
      ],
    );
    return r.rows[0];
  } catch (e) {
    // Bir vaqtda ikkita so'rov rollover qilmoqchi bo'lsa (race) — unique
    // constraint (project_id,cycle_index) urilib, ikkinchisi shu yerga
    // tushadi. Bunda allaqachon yaratilgan qatorni qaytaramiz.
    if (e.code === "23505") {
      const existing = await db.query(
        `select * from project_cycles where project_id=$1 and cycle_index=$2`,
        [project.id, cycleIndex],
      );
      if (existing.rows[0]) return existing.rows[0];
    }
    throw e;
  }
}

// Loyihaning joriy (active) davrini qaytaradi — kerak bo'lsa avtomatik
// ravishda eskirgan davrlarni yopib, yangilarini ochib chiqadi.
// `project` qatorida .anchor_date maydoni Postgres'dan Date obyekti
// sifatida kelishi mumkin — shu sababli anchor_date_str (YYYY-MM-DD)
// tayyorlab beriladi.
//
// MUHIM QOIDA: agar davr muddati o'tgan, LEKIN maqsad (post/stories)
// hali to'liq bajarilmagan bo'lsa — YANGI DAVR OCHILMAYDI. Loyiha shu
// (allaqachon muddati o'tgan) davrda "osilib" qoladi — Tracker/loyihalar
// ro'yxatida muddati o'tgan/qarzli deb ko'rinaveradi — toki jamoa
// maqsadga to'liq yetguncha. Faqat maqsad bajarilgandan KEYIN keyingi
// oy ochiladi.
async function ensureCurrentCycle(db, project) {
  let anchorStr =
    typeof project.anchor_date === "string"
      ? project.anchor_date
      : project.anchor_date.toISOString().slice(0, 10);

  const today = todayTashkent();
  let cycle = await getActiveCycle(db, project.id);
  const closedNow = [];

  // AVTOMATIK TUZATISH: "qarz yopilmaguncha keyingi oy ochilmaydi" qoidasi
  // kuchga kirishidan OLDIN ba'zi loyihalarda yangi oy xato ravishda
  // (oldingi oy qarzi hali turgan holda) ochib yuborilgan bo'lishi mumkin.
  // Shuni shu yerda avtomatik "orqaga qaytaramiz": agar joriy (active)
  // davrda hali BIRON-BIR belgi yo'q bo'lsa (demak hech qanday haqiqiy
  // ish yo'qolmaydi) va undan bevosita oldingi davr yopilgan-va-qarzli
  // bo'lsa — bo'sh davr o'chiriladi, oldingi (qarzli) davr o'z asl
  // sanalari bilan qayta faollashtiriladi. Ketma-ket bir nechta bo'sh/
  // qarzli oy bo'lsa, eng ESKI qarzli oyga yetguncha orqaga qaytaveradi.
  while (cycle && cycle.cycle_index > 1) {
    const { doneK, doneS } = await countDoneChecks(db, cycle.id);
    if (doneK > 0 || doneS > 0) break; // haqiqiy ish bor — tegilmaydi
    const prevR = await db.query(
      `select * from project_cycles where project_id = $1 and cycle_index = $2`,
      [project.id, cycle.cycle_index - 1],
    );
    const prev = prevR.rows[0];
    if (!prev || prev.status !== "closed" || !prev.is_debt) break;
    await db.withTransaction(async (client) => {
      await client.query(`delete from project_cycles where id = $1`, [cycle.id]);
      await client.query(`update project_cycles set status='active', is_debt=false, closed_at=null where id = $1`, [
        prev.id,
      ]);
    });
    cycle = prev;
  }

  // Xavfsizlik uchun cheklov — nazariy jihatdan cheksiz sikl bo'lmasligi kerak,
  // lekin abadiy sikl (masalan noto'g'ri ma'lumot) tizimni osmaslik uchun.
  let guard = 0;
  while ((!cycle || cycle.period_end < today) && guard < 600) {
    guard++;
    if (!cycle) {
      // Loyihaning ENG BIRINCHI davri — "kech qolish" tushunchasi hali
      // yo'q, har doimgidek loyihaning o'z anchor_date'i asosida
      // yaratiladi (u allaqachon o'tib ketgan bo'lsa ham — keyingi
      // tekshiruvda "tugallanmagan" sifatida shu yerda to'xtaydi).
      cycle = await createNextCycle(db, { ...project, anchor_date_str: anchorStr }, 1);
      continue;
    }
    const { doneK, doneS } = await countDoneChecks(db, cycle.id);
    const isComplete = doneK >= cycle.posts_target && doneS >= cycle.stories_target;
    if (!isComplete) {
      // Qarz hali yopilmagan — shu davrda to'xtaymiz, yangisi ochilmaydi.
      break;
    }
    const closed = await closeCycle(db, cycle.id); // shu yerda is_debt har doim false bo'ladi (maqsad yetgan)
    closedNow.push(closed);

    const nextIndex = cycle.cycle_index + 1;
    // Jadval bo'yicha keyingi davr ham allaqachon "o'tib ketgan" bo'lsa —
    // demak jamoa uzoq vaqt (qarz sababli to'xtatilgan) orqada qolgan
    // edi. Eski (endi ma'nosiz) jadvalni davom ettirish o'rniga, BUGUNGI
    // kundan "toza" davr boshlanadi — aks holda jamoa hech qachon
    // haqiqiy joriy oyga yeta olmasdi.
    const candidate = cycleBounds(anchorStr, nextIndex);
    if (candidate.periodEnd < today) {
      anchorStr = addMonthsClamped(today, -(nextIndex - 1));
      await db.query(`update projects set anchor_date = $1 where id = $2`, [anchorStr, project.id]);
    }
    cycle = await createNextCycle(db, { ...project, anchor_date_str: anchorStr }, nextIndex);
  }

  return { cycle, closedNow };
}

// Bir loyiha uchun to'liq holat: joriy davr + hisob-kitoblar + qarz
// (agar bo'lsa, UI'da ko'rsatish uchun).
//
// ensureCurrentCycle() endi muddati o'tgan-lekin-tugallanmagan davrni
// YOPMAYDI (yangi qoida) — shuning uchun qarzning ASOSIY manbai endi
// aynan shu QAYTARILGAN joriy `cycle`ning o'zi (muddati o'tgan +
// maqsadga yetilmagan). Yopilgan-va-qarzli davrlar (masalan loyiha
// arxivlanganda majburan yopilgan, yoki shu o'zgarishdan oldingi eski
// ma'lumotlar) — ikkinchi darajali holat sifatida hamon tekshiriladi.
async function getProjectCycleSummary(db, project) {
  const { cycle, closedNow } = await ensureCurrentCycle(db, project);
  const { doneK, doneS } = await countDoneChecks(db, cycle.id);

  const today = todayTashkent();
  let outstandingDebt = null;
  if (cycle.period_end < today && (doneK < cycle.posts_target || doneS < cycle.stories_target)) {
    outstandingDebt = {
      cycleId: cycle.id,
      cycleIndex: cycle.cycle_index,
      periodStart: cycle.period_start,
      periodEnd: cycle.period_end,
      remainingPosts: cycle.posts_target - doneK,
      remainingStories: cycle.stories_target - doneS,
    };
  } else {
    const debtR = await db.query(
      `select id, cycle_index, period_start, period_end, posts_target, stories_target
       from project_cycles
       where project_id = $1 and status = 'closed' and is_debt = true
       order by cycle_index desc limit 1`,
      [project.id],
    );
    if (debtR.rows[0]) {
      const debtCycle = debtR.rows[0];
      const { doneK: dK, doneS: dS } = await countDoneChecks(db, debtCycle.id);
      const remK = debtCycle.posts_target - dK;
      const remS = debtCycle.stories_target - dS;
      if (remK > 0 || remS > 0) {
        outstandingDebt = {
          cycleId: debtCycle.id,
          cycleIndex: debtCycle.cycle_index,
          periodStart: debtCycle.period_start,
          periodEnd: debtCycle.period_end,
          remainingPosts: remK,
          remainingStories: remS,
        };
      }
    }
  }

  return {
    cycle,
    doneK,
    doneS,
    closedNow, // shu chaqiriqda yopib, yangi ochilgan davrlar (bildirishnoma uchun)
    outstandingDebt,
  };
}

module.exports = {
  getActiveCycle,
  getCycleById,
  countDoneChecks,
  closeCycle,
  recomputeDebtIfClosed,
  ensureCurrentCycle,
  getProjectCycleSummary,
};
