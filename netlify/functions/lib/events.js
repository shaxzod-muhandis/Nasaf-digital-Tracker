// ═══════════════════════════════════════════════════════════════════════
// KALENDAR — takrorlanishni yoyish va reja shakli
// ═══════════════════════════════════════════════════════════════════════
// Takrorlanuvchi reja bazada BITTA yozuv: `rrule` qoidasi bilan.
// Nusxalar (occurrence) shu yerda, so'rov paytida hisoblanadi — shunda
// "har dushanba" rejasi uchun minglab qator yaratilmaydi va qoidani
// o'zgartirish bitta UPDATE bo'lib qoladi.
//
// VAQT. Bazada hammasi UTC. Lekin takrorlanishni UTC'da hisoblab
// bo'lmaydi: "har kuni 10:00" degani Toshkent vaqti bilan 10:00
// bo'lishi kerak. O'zbekistonda yozgi vaqt yo'q — smena doimo UTC+5,
// shuning uchun +5 soatga surib "mahalliy" vaqtda hisoblash va keyin
// qaytarish AYNAN to'g'ri natija beradi (DST bo'lgan mamlakatda bu
// usul ishlamas edi).
// ═══════════════════════════════════════════════════════════════════════

const TZ_OFFSET_MS = 5 * 60 * 60 * 1000; // Asia/Tashkent, UTC+5

// Qo'llab-quvvatlanadigan qoidalar (TZ 6-bo'lim, «Takrorlanish»):
//   FREQ=DAILY                       — har kuni
//   FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR — har ish kuni
//   FREQ=WEEKLY                      — har hafta (boshlanish kuni)
//   FREQ=MONTHLY                     — har oy (boshlanish sanasi)
// Qo'shimcha: COUNT=N — necha marta takrorlanadi.
const RRULE_PRESETS = {
  daily: "FREQ=DAILY",
  weekday: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
};
const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function parseRrule(rrule) {
  const out = {};
  String(rrule || "")
    .split(";")
    .forEach((part) => {
      const [k, v] = part.split("=");
      if (k && v) out[k.trim().toUpperCase()] = v.trim().toUpperCase();
    });
  return out;
}

// Qoida tanishmi? Tanimagan qoidani YOYMAYMIZ — bitta nusxa qaytadi.
// Shunday qilib noma'lum RRULE reja butunlay yo'qolib ketishiga olib
// kelmaydi (eng yomoni — takrorlanmaydi).
function isSupportedRrule(rrule) {
  const r = parseRrule(rrule);
  return ["DAILY", "WEEKLY", "MONTHLY"].includes(r.FREQ);
}

// "Mahalliy" (Toshkent) vaqtdagi Date — hisob-kitob uchun. Qaytarilgan
// obyektning UTC maydonlari aslida Toshkent vaqtini ko'rsatadi.
function toLocal(d) {
  return new Date(d.getTime() + TZ_OFFSET_MS);
}
function fromLocal(d) {
  return new Date(d.getTime() - TZ_OFFSET_MS);
}

// Reja seriyasining [from, to] oralig'iga tushadigan boshlanish
// vaqtlari. `limit` — cheksiz qoidada ham so'rov cheklangan bo'lsin.
function expandOccurrences(ev, from, to, limit = 400) {
  const start = new Date(ev.start_at);
  const davomiylik = new Date(ev.end_at).getTime() - start.getTime();
  if (!ev.rrule || !isSupportedRrule(ev.rrule)) {
    // Takrorlanmaydi: oralig'iga tushsa — bitta nusxa.
    return start.getTime() < to.getTime() && start.getTime() + davomiylik > from.getTime()
      ? [new Date(start)]
      : [];
  }

  const r = parseRrule(ev.rrule);
  const count = r.COUNT ? Number(r.COUNT) : null;
  const until = ev.rrule_until ? new Date(ev.rrule_until) : null;
  // Haftalik qoidada BYDAY bo'lmasa — boshlanish kunining o'zi.
  const kunlar =
    r.FREQ === "WEEKLY"
      ? (r.BYDAY ? r.BYDAY.split(",") : [WEEKDAY_CODES[toLocal(start).getUTCDay()]])
          .map((c) => WEEKDAY_CODES.indexOf(c))
          .filter((i) => i >= 0)
      : [];

  const lStart = toLocal(start);
  const soat = lStart.getUTCHours();
  const daq = lStart.getUTCMinutes();
  const out = [];
  let n = 0; // nechanchi takrorlanish (COUNT uchun)

  // Hisob boshlanish sanasidan yuritiladi: COUNT va "har oy 31-kun"
  // kabi holatlar to'g'ri chiqishi uchun oradagi nusxalar ham
  // sanaladi, garchi ular [from, to] ga tushmasa ham.
  const kursor = new Date(Date.UTC(lStart.getUTCFullYear(), lStart.getUTCMonth(), lStart.getUTCDate()));
  const oyKun = lStart.getUTCDate();
  const chegara = new Date(toLocal(to).getTime());
  // Qancha qadam tashlashga ruxsat — cheksiz siklga tushib qolmaslik uchun.
  let qadam = 0;
  const maxQadam = 4000;

  while (kursor.getTime() <= chegara.getTime() && qadam++ < maxQadam) {
    let mos = false;
    if (r.FREQ === "DAILY") mos = true;
    else if (r.FREQ === "WEEKLY") mos = kunlar.includes(kursor.getUTCDay());
    else if (r.FREQ === "MONTHLY") mos = kursor.getUTCDate() === oyKun;

    if (mos) {
      const lBoshlanish = new Date(
        Date.UTC(kursor.getUTCFullYear(), kursor.getUTCMonth(), kursor.getUTCDate(), soat, daq),
      );
      const utc = fromLocal(lBoshlanish);
      if (utc.getTime() >= start.getTime()) {
        n++;
        if (count && n > count) break;
        if (until && utc.getTime() > until.getTime()) break;
        if (utc.getTime() < to.getTime() && utc.getTime() + davomiylik > from.getTime()) {
          out.push(utc);
          if (out.length >= limit) break;
        }
      }
    }
    // Oylik qoidada kundan kunga yurish 31 kunlik oy uchun ham to'g'ri
    // ishlaydi: mos kelmagan kunlar shunchaki o'tkazib yuboriladi
    // (fevralda 31-kun yo'q — o'sha oy tushib qoladi, kutilgan xulq).
    kursor.setUTCDate(kursor.getUTCDate() + 1);
  }
  return out;
}

// Bitta nusxani API javobi shakliga keltiradi (TZ 12-bo'lim).
function shapeOccurrence(ev, occStart, { participants, owner, project, canEdit, exception }) {
  const davomiylik = new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime();
  let start = occStart;
  let end = new Date(occStart.getTime() + davomiylik);
  let title = ev.title;
  let place = ev.place;
  let note = ev.note;
  // Bitta nusxa alohida o'zgartirilgan bo'lsa — o'sha qiymatlar ustun.
  if (exception && exception.override_json) {
    const o = exception.override_json;
    if (o.title) title = o.title;
    if (o.place !== undefined) place = o.place;
    if (o.note !== undefined) note = o.note;
    if (o.start_at) start = new Date(o.start_at);
    if (o.end_at) end = new Date(o.end_at);
    else if (o.start_at) end = new Date(start.getTime() + davomiylik);
  }
  return {
    id: ev.id,
    occurrence_start: occStart.toISOString(),
    title,
    start: start.toISOString(),
    end: end.toISOString(),
    all_day: ev.all_day,
    is_team: ev.is_team,
    recurring: !!ev.rrule,
    owner,
    participants,
    project,
    place: place || null,
    note: note || null,
    remind_before: ev.remind_before,
    can_edit: canEdit,
  };
}

// Reja egasi/ishtirokchisi uchun rang. `users.color` bo'sh bo'lsa
// username'dan barqaror rang olinadi — frontenddagi `personColor`
// bilan bir xil palitra, shunda kalendar boshqa sahifalar bilan
// bir xil ko'rinadi.
const FALLBACK_COLORS = [
  "#2f7ab9", "#7c3aed", "#0f766e", "#b45309", "#be123c",
  "#1d4ed8", "#4d7c0f", "#9333ea", "#0369a1", "#c2410c",
];
function userColor(row) {
  if (row && row.color) return row.color;
  const key = String((row && row.username) || "");
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

function userBrief(row) {
  if (!row) return null;
  const name = row.first_name
    ? `${row.first_name} ${row.last_name || ""}`.trim()
    : row.full_name || row.username;
  return { id: row.id, username: row.username, name, color: userColor(row) };
}

module.exports = {
  TZ_OFFSET_MS,
  RRULE_PRESETS,
  parseRrule,
  isSupportedRrule,
  expandOccurrences,
  shapeOccurrence,
  userColor,
  userBrief,
  toLocal,
  fromLocal,
};
