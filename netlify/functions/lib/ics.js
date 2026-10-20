// ═══════════════════════════════════════════════════════════════════════
// ICS (iCalendar, RFC 5545) — kalendar obunasi uchun
// ═══════════════════════════════════════════════════════════════════════
// Xodim bu havolani Google Calendar yoki Apple Calendar'ga bir marta
// qo'shadi va trackerdagi rejalari o'sha yerda ko'rinib turadi.
//
// TAKRORLANUVCHI rejalar bu yerda RRULE sifatida emas, NUSXALARGA
// YOYILGAN holda beriladi. Sabab: bizdagi istisnolar (bitta nusxani
// o'zgartirish/bekor qilish) EXDATE va RECURRENCE-ID orqali
// ko'chirilganda turli kalendar dasturlari turlicha talqin qiladi.
// Yoyib berish — hamma joyda bir xil ko'rinadigan, zerikarli, lekin
// ishonchli yo'l. Buning evaziga oyna cheklangan (pastdagi
// `WINDOW_BACK/FORWARD`).
// ═══════════════════════════════════════════════════════════════════════

const WINDOW_BACK_DAYS = 31;
const WINDOW_FORWARD_DAYS = 180;

// RFC 5545 5.1: matndagi \ ; , va yangi qator ekranlanadi.
function esc(v) {
  return String(v == null ? "" : v)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545 3.1: qator 75 OKTETdan oshmasligi kerak. O'zbekcha matnda
// ko'p belgi ikki baytli, shuning uchun uzunlik belgilarda emas,
// baytlarda o'lchanadi — aks holda uzun nomlar buzilib ketardi.
function fold(line) {
  const buf = Buffer.from(line, "utf8");
  if (buf.length <= 75) return line;
  const parts = [];
  let start = 0;
  let limit = 75;
  while (start < buf.length) {
    let end = Math.min(start + limit, buf.length);
    // Ko'p baytli belgining o'rtasidan kesmaymiz.
    while (end > start && end < buf.length && (buf[end] & 0xc0) === 0x80) end--;
    parts.push(buf.slice(start, end).toString("utf8"));
    start = end;
    limit = 74; // davomi bitta bo'sh joy bilan boshlanadi
  }
  return parts.join("\r\n ");
}

function stamp(d) {
  return new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function dayStamp(d) {
  return new Date(d).toISOString().slice(0, 10).replace(/-/g, "");
}

// Eslatma vaqti — reja boshlanishidan necha daqiqa oldin.
function alarm(minutes, title) {
  if (minutes == null) return [];
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `TRIGGER:-PT${Math.max(0, Math.round(minutes))}M`,
    `DESCRIPTION:${esc(title)}`,
    "END:VALARM",
  ];
}

// Bitta nusxa → VEVENT
function vevent(ev, occStart, occEnd, { link, domain }) {
  const uid = `${ev.id}-${stamp(occStart)}@${domain}`;
  const rows = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp(ev.updated_at || new Date())}`];
  if (ev.all_day) {
    // Butun kunlik rejada tugash sanasi KEYINGI kun bo'ladi (RFC 5545
    // bo'yicha chegaradan tashqari), aks holda kalendar bir kunni
    // kam ko'rsatadi.
    rows.push(`DTSTART;VALUE=DATE:${dayStamp(occStart)}`);
    rows.push(`DTEND;VALUE=DATE:${dayStamp(occEnd)}`);
  } else {
    rows.push(`DTSTART:${stamp(occStart)}`);
    rows.push(`DTEND:${stamp(occEnd)}`);
  }
  rows.push(`SUMMARY:${esc(ev.title)}`);
  if (ev.place) rows.push(`LOCATION:${esc(ev.place)}`);

  // Izoh va havola. Havola alohida URL maydonida ham beriladi —
  // Apple Calendar uni bosiladigan qilib ko'rsatadi; Google esa
  // izohdagi havolani ko'rsatadi, shuning uchun ikkalasida ham bor.
  const desc = [ev.note || "", link ? `Trackerda ochish: ${link}` : ""].filter(Boolean).join("\n\n");
  if (desc) rows.push(`DESCRIPTION:${esc(desc)}`);
  if (link) rows.push(`URL:${link}`);
  rows.push("STATUS:CONFIRMED");
  rows.push(...alarm(ev.remind_before, ev.title));
  rows.push("END:VEVENT");
  return rows;
}

// `items` — {ev, start, end} ro'yxati (nusxalarga yoyilgan holda).
function buildCalendar(items, { name, domain, linkFor }) {
  const rows = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Nasaf Digital//Tracker//UZ`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    "X-WR-TIMEZONE:Asia/Tashkent",
    // Dasturlarga "tez-tez yangilab tur" degan maslahat. Apple buni
    // hisobga oladi; Google e'tiborsiz qoldiradi va o'z jadvalida
    // (bir necha soatda bir marta) yangilaydi.
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];
  items.forEach(({ ev, start, end }) => {
    rows.push(...vevent(ev, start, end, { link: linkFor(ev), domain }));
  });
  rows.push("END:VCALENDAR");
  return rows.map(fold).join("\r\n") + "\r\n";
}

module.exports = { buildCalendar, WINDOW_BACK_DAYS, WINDOW_FORWARD_DAYS };
