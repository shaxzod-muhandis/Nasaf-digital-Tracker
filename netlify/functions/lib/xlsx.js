// ═══════════════════════════════════════════════════════════════════════
// MINIMAL XLSX YOZUVCHI
//
// Tabel eksporti uchun haqiqiy Excel fayli kerak: bir nechta varaq,
// qalin sarlavha, ustun kengliklari va holat ranglari (zamena — sariq,
// qilinmagan — qizil). CSV bularning hech birini bera olmaydi.
//
// `exceljs`/`xlsx` kutubxonalari bu ish uchun juda og'ir (serverless
// bundle bir necha megabaytga o'sardi), shuning uchun kerakli qismi shu
// yerda: XLSX — bu ichida bir nechta XML fayli bo'lgan ZIP arxiv.
// Arxiv "stored" (siqilmagan) usulda yoziladi — deflate murakkabligi
// shart emas, fayl hajmi esa bu o'lchamdagi jadval uchun ahamiyatsiz.
//
// Matnlar `inlineStr` sifatida yoziladi, ya'ni alohida sharedStrings
// jadvali kerak emas.
// ═══════════════════════════════════════════════════════════════════════

const zlib = require("zlib");

// ── ZIP ──────────────────────────────────────────────────────────────
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[i] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

// `files`: [{ name, data: Buffer }] → ZIP arxivi (Buffer).
function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const raw = f.data;
    const deflated = zlib.deflateRawSync(raw, { level: 6 });
    // Siqilgani kattaroq chiqsa — siqmasdan yozamiz (kichik XML'larda bo'ladi).
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // kerakli versiya
    local.writeUInt16LE(0, 6); // bayroqlar
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // vaqt
    local.writeUInt16LE(0, 12); // sana
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // yaratgan versiya
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // izoh
    cd.writeUInt16LE(0, 34); // disk
    cd.writeUInt16LE(0, 36); // ichki atributlar
    cd.writeUInt32LE(0, 38); // tashqi atributlar
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, end]);
}

// ── XML ──────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Excel boshqaruv belgilarini qabul qilmaydi (tab/newline'dan boshqa).
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

function colName(i) {
  let s = "";
  i += 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - m) / 26);
  }
  return s;
}

// ── USLUBLAR ─────────────────────────────────────────────────────────
// Ranglar ilovadagi holat ranglari bilan bir xil: sariq — zamena,
// qizil — qilinmagan, yashil — hammasi o'zi.
const FILLS = [
  null, // 0,1 — Excel zahirasi
  null,
  { bg: "FFF1F3F6", fg: "FF0E1726" }, // 2 — sarlavha
  { bg: "FFFBF1E4", fg: "FFA45F08" }, // 3 — zamena (sariq)
  { bg: "FFFDECEC", fg: "FFDC2626" }, // 4 — qilinmagan (qizil)
  { bg: "FFE8F6EC", fg: "FF15803D" }, // 5 — hammasi o'zi (yashil)
];
const STYLE = { PLAIN: 0, HEADER: 1, SUB: 2, MISSING: 3, OWN: 4, BOLD: 5 };

function stylesXml() {
  const patterns = FILLS.map((f, i) =>
    i < 2
      ? `<fill><patternFill patternType="${i === 0 ? "none" : "gray125"}"/></fill>`
      : `<fill><patternFill patternType="solid"><fgColor rgb="${f.bg}"/><bgColor indexed="64"/></patternFill></fill>`,
  ).join("");
  const fontFor = (color, bold) =>
    `<font><sz val="11"/><name val="Calibri"/>${bold ? "<b/>" : ""}${color ? `<color rgb="${color}"/>` : ""}</font>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="6">${fontFor(null, false)}${fontFor("FF0E1726", true)}${fontFor("FFA45F08", true)}${fontFor("FFDC2626", true)}${fontFor("FF15803D", true)}${fontFor(null, true)}</fonts>
<fills count="${FILLS.length}">${patterns}</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

// ── VARAQ ────────────────────────────────────────────────────────────
// `rows`: hujayralar massivi. Hujayra — oddiy qiymat (matn/son) yoki
// `{ v, s }` (s — STYLE dan).
function sheetXml(sheet) {
  const widths = (sheet.widths || [])
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const rows = sheet.rows
    .map((cells, r) => {
      const cs = cells
        .map((cell, c) => {
          const o = cell && typeof cell === "object" && !Array.isArray(cell) ? cell : { v: cell };
          const ref = `${colName(c)}${r + 1}`;
          const s = o.s ? ` s="${o.s}"` : "";
          if (o.v === null || o.v === undefined || o.v === "") return `<c r="${ref}"${s}/>`;
          if (typeof o.v === "number" && Number.isFinite(o.v)) {
            return `<c r="${ref}"${s}><v>${o.v}</v></c>`;
          }
          return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(o.v)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cs}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${widths ? `<cols>${widths}</cols>` : ""}
<sheetData>${rows}</sheetData>
</worksheet>`;
}

// Varaq nomi: Excel 31 belgidan uzun va : \ / ? * [ ] belgilarini
// qabul qilmaydi.
function safeSheetName(name, index) {
  const clean = String(name || `Varaq${index + 1}`).replace(/[:\\/?*[\]]/g, " ").trim();
  return clean.slice(0, 31) || `Varaq${index + 1}`;
}

/**
 * `sheets`: [{ name, widths?: number[], rows: cell[][] }]
 * Qaytaradi: .xlsx fayli (Buffer).
 */
function buildXlsx(sheets) {
  const list = sheets.length ? sheets : [{ name: "Varaq1", rows: [] }];
  const names = list.map((s, i) => safeSheetName(s.name, i));

  const files = [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`,
        "utf8",
      ),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
        "utf8",
      ),
    },
    {
      name: "xl/workbook.xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`,
        "utf8",
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}
<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
        "utf8",
      ),
    },
    { name: "xl/styles.xml", data: Buffer.from(stylesXml(), "utf8") },
    ...list.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(sheetXml(s), "utf8"),
    })),
  ];

  return zip(files);
}

module.exports = { buildXlsx, STYLE };
