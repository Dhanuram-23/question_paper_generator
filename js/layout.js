// Page & text settings shared by the on-screen preview, the PDF (print) and the Word file.

const KEY = "qpg.layout.v1";

// sizes in mm (portrait)
export const PAPER_SIZES = {
  A4: { w: 210, h: 297, label: "A4 (210 × 297 mm)" },
  Letter: { w: 215.9, h: 279.4, label: "Letter (8.5 × 11 in)" },
  Legal: { w: 215.9, h: 355.6, label: "Legal (8.5 × 14 in)" },
  A3: { w: 297, h: 420, label: "A3 (297 × 420 mm)" },
  A5: { w: 148, h: 210, label: "A5 (148 × 210 mm)" },
  B5: { w: 176, h: 250, label: "B5 (176 × 250 mm)" },
};

export const FONTS = [
  "Arial", "Times New Roman", "Calibri", "Cambria", "Georgia", "Book Antiqua", "Garamond",
  "Verdana", "Tahoma", "Century Gothic", "Bookman Old Style", "Noto Sans", "Noto Serif", "Noto Sans Tamil", "Latha",
];

export const DEFAULT_LAYOUT = {
  // page
  paper: "A4",
  orientation: "portrait",
  marginTop: 15, marginBottom: 15, marginLeft: 15, marginRight: 15,   // mm
  columns: 1,            // 1 or 2 – every column is its own page with its own header & footer
  columnGap: 12,         // mm
  columnLine: false,     // line between the columns
  // header
  headerOn: "first",     // first | every   (show the school header on the first column only, or on every column/page)
  topNote: "",           // e.g. "Reg. No. ____________"
  topNoteAlign: "right",
  headerAlign: "center", // school + exam name
  infoStyle: "spread",   // spread | line | stacked   (Subject, Class, Date, Time, Marks)
  infoAlign: "center",   // used by "line" and "stacked"
  infoSize: 11,          // pt
  infoBold: true,
  headerLine: true,
  // footer
  footerText: "",        // {page} {pages} are replaced, e.g. "Page {page} of {pages}"
  footerAlign: "center",
  footerSize: 9,         // pt
  footerLine: false,
  // font
  font: "Arial",
  fontSize: 11,
  schoolSize: 14,
  examSize: 12,
  headingSize: 11,
  textColor: "#000000",
  boldSchool: true,
  boldHeadings: true,
  boldNumbers: false,
  // alignment & spacing
  partTitleAlign: "center",
  headingAlign: "left",  // left | center
  textAlign: "left",     // left | justify
  lineSpacing: 1.15,
  questionGap: 4,        // pt
  partGap: 10,           // pt
  optionsPerRow: "auto",
  placesPerRow: "auto",
};

export function loadLayout() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* ignore */ }
  // v7 had a "page numbers" tick box
  if (saved.pageNumbers && !saved.footerText) saved.footerText = "Page {page} of {pages}";
  delete saved.pageNumbers;
  return { ...DEFAULT_LAYOUT, ...saved };
}
export function saveLayout(l) { localStorage.setItem(KEY, JSON.stringify(l)); }

/** Page size in mm, after orientation. */
export function pageMm(l) {
  const s = PAPER_SIZES[l.paper] || PAPER_SIZES.A4;
  return l.orientation === "landscape" ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
}

/** Width of one column's text area, in mm. */
export function columnWidthMm(l) {
  const cols = Math.max(1, Number(l.columns) || 1);
  return (pageMm(l).w - l.marginLeft - l.marginRight - (cols - 1) * l.columnGap) / cols;
}

/** How many items per row for options / map places, from the real column width (same on screen, PDF and Word). */
export function perRow(setting, texts, L, indentEm = 3) {
  if (setting && setting !== "auto") return Number(setting);
  const emMm = (Number(L.fontSize) || 11) * 0.3528;
  const usable = columnWidthMm(L) - indentEm * emMm;
  const longest = Math.max(...texts.map((t) => String(t).length), 1) + 4;   // + "a) " and a little space
  const charMm = emMm * 0.52;                                               // average character width
  for (const n of [4, 2]) if (longest * charMm * n <= usable) return n;
  return 1;
}

/** "Page {page} of {pages}" -> "Page 2 of 4" */
export const footerFor = (l, page, pages) =>
  String(l.footerText || "").replace(/\{page\}/gi, page).replace(/\{pages\}/gi, pages);

/** The Subject / Class / Date / Time / Marks items, in order. */
export function infoItems(header) {
  return [
    ["Subject", header.subject, "h.subject"],
    ["Class", header.cls, "h.cls"],
    header.date ? ["Date", header.date, "h.date"] : null,
    ["Time", header.time, "h.time"],
    ["Marks", header.marks, "h.marks"],
  ].filter(Boolean);
}
/** Rows for the "spread" style: Subject … Marks / Class … (Date) … Time */
export function spreadRows(items) {
  const by = Object.fromEntries(items.map((i) => [i[0], i]));
  return [[by.Subject, by.Marks], [by.Class, by.Date, by.Time].filter(Boolean)];
}

const cssFont = (f) => `"${f}", "Noto Sans Tamil", Arial, sans-serif`;

/** Apply settings to the preview (CSS variables) and to printing (@page). */
export function applyLayoutToPage(l, paperEl) {
  const { w, h } = pageMm(l);
  const s = paperEl.style;
  const set = (k, v) => s.setProperty(k, v);
  set("--pw", `${w}mm`); set("--ph", `${h}mm`);
  set("--mt", `${l.marginTop}mm`); set("--mb", `${l.marginBottom}mm`);
  set("--ml", `${l.marginLeft}mm`); set("--mr", `${l.marginRight}mm`);
  set("--cgap", `${l.columnGap}mm`);
  set("--font", cssFont(l.font));
  set("--fs", `${l.fontSize}pt`); set("--fs-school", `${l.schoolSize}pt`); set("--fs-exam", `${l.examSize}pt`);
  set("--fs-head", `${l.headingSize}pt`); set("--fs-info", `${l.infoSize}pt`); set("--fs-foot", `${l.footerSize}pt`);
  set("--lh", String(l.lineSpacing));
  set("--qgap", `${l.questionGap}pt`); set("--pgap", `${l.partGap}pt`);
  set("--h-align", l.headerAlign); set("--pt-align", l.partTitleAlign); set("--t-align", l.textAlign);
  set("--info-align", l.infoAlign); set("--note-align", l.topNoteAlign); set("--foot-align", l.footerAlign);
  set("--color", l.textColor);
  set("--w-school", l.boldSchool ? "700" : "400"); set("--w-head", l.boldHeadings ? "700" : "400");
  set("--w-num", l.boldNumbers ? "700" : "400"); set("--w-info", l.infoBold ? "700" : "400");
  set("--hline", l.headerLine ? "2px solid #000" : "none");
  set("--fline", l.footerLine ? "1px solid #000" : "none");
  paperEl.classList.toggle("head-center", l.headingAlign === "center");

  let tag = document.getElementById("page-style");
  if (!tag) { tag = document.createElement("style"); tag.id = "page-style"; document.head.appendChild(tag); }
  // each .sheet is exactly one printed page, so the printer margin is 0
  tag.textContent = `@media print { @page { size: ${w}mm ${h}mm; margin: 0; } }`;
}
