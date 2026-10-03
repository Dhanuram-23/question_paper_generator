// Builds a Word (.docx) file from the (edited) paper, the page & text settings and the page plan.
// `D` is the docx library (window.docx in the browser, the npm package in tests).
//
// 1 column : a normal flowing Word document (header on the first page or on every page, footer with page numbers).
// 2 columns: every printed page is a 2-column table; each column is its own page with its own
//            header and footer, using exactly the same page breaks as the screen / PDF.
import { subLabel, romanItem, blockList } from "./render.js?v=8";
import { DEFAULT_LAYOUT, pageMm, perRow, infoItems, spreadRows, footerFor } from "./layout.js?v=8";

const LET = "abcdefgh";
const TW = 56.6929;              // twips per mm
const IND = 450;                 // hanging indent, twips

export function buildDocx(D, paper, header, layoutIn = {}, pageInfo = null) {
  const L = { ...DEFAULT_LAYOUT, ...layoutIn };
  const { Document, Paragraph, TextRun, AlignmentType, TabStopType, BorderStyle, PageOrientation, Footer, Header, PageNumber,
    Table, TableRow, TableCell, WidthType, HeightRule, TableLayoutType, VerticalAlign } = D;
  const { w, h } = pageMm(L);
  const cols = Math.max(1, Number(L.columns) || 1);
  const pageW = (w - L.marginLeft - L.marginRight) * TW;
  const gapW = cols > 1 ? L.columnGap * TW : 0;
  const colW = Math.floor((pageW - gapW * (cols - 1)) / cols);

  const size = Math.round(L.fontSize * 2);
  const color = (L.textColor || "#000000").replace("#", "");
  const run = (text, o = {}) => new TextRun({ text: String(text ?? ""), font: L.font, size, color, ...o });
  const lineRule = { line: Math.max(200, Math.round((240 * L.lineSpacing) / 1.15)) };
  const P = (children, o = {}) => new Paragraph({ children, ...o, spacing: { after: 0, ...lineRule, ...(o.spacing || {}) } });
  const align = (a) => ({ left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED }[a] || AlignmentType.LEFT);
  const textAlign = align(L.textAlign);
  const gap = Math.round(L.questionGap * 20);
  const numRun = (t) => run(t, { bold: L.boldNumbers });

  // ---------- header paragraphs (width W) ----------
  const headerBlock = (W) => {
    const out = [];
    const infoSize = Math.round(L.infoSize * 2);
    const ir = (t) => run(t, { bold: L.infoBold, size: infoSize });
    if (L.topNote) out.push(P([run(L.topNote, { size: infoSize })], { alignment: align(L.topNoteAlign), spacing: { after: 40 } }));
    out.push(P([run(header.school, { bold: L.boldSchool, size: Math.round(L.schoolSize * 2) })], { alignment: align(L.headerAlign) }));
    out.push(P([run(header.exam, { bold: true, size: Math.round(L.examSize * 2) })], { alignment: align(L.headerAlign), spacing: { after: 60 } }));
    const specs = [];
    if (L.infoStyle === "line") {
      specs.push({ kids: [ir(infoItems(header).map(([k, v]) => `${k}: ${v ?? ""}`).join("     "))], alignment: align(L.infoAlign) });
    } else if (L.infoStyle === "stacked") {
      infoItems(header).forEach(([k, v]) => specs.push({ kids: [ir(`${k}: ${v ?? ""}`)], alignment: align(L.infoAlign) }));
    } else {
      spreadRows(infoItems(header)).forEach((row) => {
        const kids = [];
        row.forEach(([k, v], i) => { if (i) kids.push(run("\t")); kids.push(ir(`${k}: ${v ?? ""}`)); });
        specs.push({ kids, tabStops: row.length === 3
          ? [{ type: TabStopType.CENTER, position: Math.round(W / 2) }, { type: TabStopType.RIGHT, position: Math.round(W) }]
          : [{ type: TabStopType.RIGHT, position: Math.round(W) }] });
      });
    }
    specs.forEach((s, i) => {
      const last = i === specs.length - 1;
      out.push(P(s.kids, {
        alignment: s.alignment, tabStops: s.tabStops,
        spacing: { after: last ? 160 : 0 },
        border: last && L.headerLine ? { bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000", space: 4 } } : undefined,
      }));
    });
    return out;
  };

  // ---------- question paragraphs (width W) ----------
  const hang = (label, text, level = 0, pre = null, bold = false, after = 0) => {
    if (pre) return P([numRun(pre), run("\t"), run(label), run("\t"), run(text, { bold })], {
      alignment: textAlign, spacing: { after },
      indent: { left: IND * (level + 1), hanging: IND * (level + 1) },
      tabStops: [{ type: TabStopType.LEFT, position: IND * level }, { type: TabStopType.LEFT, position: IND * (level + 1) }],
    });
    return P([/^\d+\.$/.test(label) ? numRun(label) : run(label), run("\t"), run(text, { bold })], {
      alignment: textAlign, spacing: { after },
      indent: { left: IND * (level + 1), hanging: IND }, tabStops: [{ type: TabStopType.LEFT, position: IND * (level + 1) }],
    });
  };
  const rows = (labels, level, per, after, W) => {
    const step = Math.floor((W - IND * level) / per);
    const lines = [];
    for (let i = 0; i < labels.length; i += per) {
      const kids = [];
      labels.slice(i, i + per).forEach((t, j) => { if (j) kids.push(run("\t")); kids.push(run(t)); });
      const lastRow = i + per >= labels.length;
      lines.push(P(kids, { indent: { left: IND * level }, spacing: { after: lastRow ? after : 0 },
        tabStops: Array.from({ length: per - 1 }, (_, k) => ({ type: TabStopType.LEFT, position: IND * level + step * (k + 1) })) }));
    }
    return lines;
  };
  const body = (b, label, level, W, pre = null, after = gap) => {
    const res = [];
    if (b.kind === "single") {
      const hasOpts = b.options?.length;
      res.push(hang(label, b.text, level, pre, false, hasOpts ? 0 : after));
      if (hasOpts) res.push(...rows(b.options.map((o, k) => `${LET[k]}) ${o}`), level + 1, perRow(L.optionsPerRow, b.options, L), after, W));
    } else if (b.kind === "map") {
      res.push(hang(label, b.heading, level, pre));
      res.push(...rows(b.places.map((q, k) => `${k + 1}. ${q.text}`), level + 1, perRow(L.placesPerRow, b.places.map((q) => `${q.text}  `), L), after, W));
    } else if (b.kind === "group") {
      const single = b.subs.length === 1;
      if (pre && !single) res.push(P([numRun(pre)]));
      b.subs.forEach((s, si) => {
        if (single) res.push(hang(label, s.heading, level, pre));
        else res.push(si === 0 ? P([/^\d+\.$/.test(label) ? numRun(label) : run(label), run("\t"), run(`${subLabel(si)} `), run(s.heading, { bold: true })], {
          indent: { left: IND * (level + 1), hanging: IND }, tabStops: [{ type: TabStopType.LEFT, position: IND * (level + 1) }] })
          : P([run(`${subLabel(si)} `), run(s.heading, { bold: true })], { indent: { left: IND * (level + 1) } }));
        s.items.forEach((q, k) => {
          const lastItem = si === b.subs.length - 1 && k === s.items.length - 1;
          res.push(hang(single ? romanItem(k) : `${k + 1}.`, q.text, level + (single ? 1 : 2), null, false, lastItem ? after : 0));
        });
      });
    }
    return res;
  };

  const headSize = Math.round(L.headingSize * 2);
  const blockParas = (blk, W, firstInPanel) => {
    const part = paper.parts[blk.pi];
    const out = [];
    if (blk.lead) {
      const before = firstInPanel ? 0 : Math.round(L.partGap * 20);
      if (part.title) out.push(P([run(part.title, { bold: L.boldHeadings, size: headSize })], { alignment: align(L.partTitleAlign), spacing: { before }, keepNext: true }));
      const hb = { bold: L.boldHeadings, size: headSize };
      const sp = { before: part.title ? 40 : before, after: 80 };
      out.push(L.headingAlign === "center"
        ? P([run(part.headingText, hb), run("  "), run(part.marksText, hb)], { alignment: AlignmentType.CENTER, spacing: sp, keepNext: true })
        : P([run(part.headingText, hb), run("\t"), run(part.marksText, hb)], { tabStops: [{ type: TabStopType.RIGHT, position: Math.round(W) }], spacing: sp, keepNext: true }));
    }
    if (blk.ii >= 0) {
      const it = part.items[blk.ii];
      if (it.alts.length === 2) {
        out.push(...body(it.alts[0], "a)", 1, W, `${it.no}.`, 0));
        out.push(P([run("(OR)", { bold: true })], { alignment: AlignmentType.CENTER }));
        out.push(...body(it.alts[1], "b)", 1, W));
      } else {
        out.push(...body(it.alts[0], `${it.no}.`, 0, W));
      }
    }
    return out;
  };

  const footSize = Math.round(L.footerSize * 2);
  const pageProps = (extra = {}) => {
    const portrait = { w: Math.min(w, h), h: Math.max(w, h) };   // docx swaps for landscape itself
    return {
      page: {
        size: { width: Math.round(portrait.w * TW), height: Math.round(portrait.h * TW),
          orientation: L.orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
        margin: { top: Math.round(L.marginTop * TW), bottom: Math.round(L.marginBottom * TW),
          left: Math.round(L.marginLeft * TW), right: Math.round(L.marginRight * TW), header: 300, footer: Math.round(Math.max(4, L.marginBottom / 2 - 2) * TW) },
      },
      ...extra,
    };
  };
  const docOptions = (sections) => new Document({
    creator: "Question Paper Generator",
    title: `${header.subject} – ${header.exam}`,
    styles: { default: { document: { run: { font: L.font, size } } } },
    sections,
  });
  const blocks = blockList(paper);
  const hasFooter = !!String(L.footerText || "").trim();

  // =============== 1 column: normal flowing Word document ===============
  if (cols === 1) {
    const children = [];
    if (L.headerOn !== "every") children.push(...headerBlock(colW));
    blocks.forEach((b, k) => children.push(...blockParas(b, colW, k === 0)));

    let footers;
    if (hasFooter) {
      const parts = String(L.footerText).split(/(\{page\}|\{pages\})/i).filter(Boolean).map((t) =>
        /^\{page\}$/i.test(t) ? PageNumber.CURRENT : /^\{pages\}$/i.test(t) ? PageNumber.TOTAL_PAGES : t);
      footers = { default: new Footer({ children: [new Paragraph({
        alignment: align(L.footerAlign),
        border: L.footerLine ? { top: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 } } : undefined,
        children: [new TextRun({ children: parts, font: L.font, size: footSize, color })],
      })] }) };
    }
    const headers = L.headerOn === "every" ? { default: new Header({ children: headerBlock(colW) }) } : undefined;
    return docOptions([{ properties: pageProps(), headers, footers, children }]);
  }

  // =============== 2 columns: each column its own page, own header and footer ===============
  let plan = pageInfo?.plan;
  if (!plan) {   // no screen layout available (tests): split evenly
    const per = Math.ceil(blocks.length / cols);
    plan = Array.from({ length: cols }, (_, i) => ({
      header: i === 0 || L.headerOn === "every",
      blocks: blocks.map((_, k) => k).slice(i * per, (i + 1) * per),
    }));
    plan.forEach((p, i) => (p.footer = hasFooter ? footerFor(L, i + 1, plan.length) : ""));
  }

  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noBorders = { top: none, bottom: none, left: none, right: none };
  const line = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
  const cell = (children, width, extra = {}) => new TableCell({
    children: children.length ? children : [P([run("")])],
    width: { size: Math.round(width), type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    borders: noBorders,
    ...extra,
  });
  // one row of columns: [col, ½gap | ½gap, col]; the dividing line sits between the two gap halves
  const columnsTable = (contents, withLine) => {
    const widths = [], cells = [];
    const half = Math.round(gapW / 2);
    contents.forEach((kids, i) => {
      if (i) {
        widths.push(half, half);
        cells.push(cell([], half, withLine ? { borders: { ...noBorders, right: line } } : {}), cell([], half));
      }
      widths.push(colW);
      cells.push(cell(kids, colW));
    });
    return new Table({
      rows: [new TableRow({ children: cells })],
      width: { size: widths.reduce((x, y) => x + y, 0), type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    });
  };

  const sections = [];
  for (let s = 0; s < plan.length; s += cols) {
    const panels = Array.from({ length: cols }, (_, i) => plan[s + i] || null);
    const contents = panels.map((p) => {
      const kids = [];
      if (p) {
        if (p.header) kids.push(...headerBlock(colW));
        p.blocks.forEach((k, j) => kids.push(...blockParas(blocks[k], colW, j === 0 && !p.header)));
      }
      return kids;
    });
    // footers go into Word's real page footer – one under each column – so they always stay at the bottom
    let footers;
    if (hasFooter) {
      footers = { default: new Footer({ children: [columnsTable(panels.map((p) => (p && p.footer ? [P([run(p.footer, { size: footSize })], {
        alignment: align(L.footerAlign),
        border: L.footerLine ? { top: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 } } : undefined,
      })] : [])), false), new Paragraph({ children: [], spacing: { before: 0, after: 0, line: 20 } })] }) };
    }
    sections.push({
      properties: pageProps(),
      footers,
      children: [columnsTable(contents, L.columnLine),
        new Paragraph({ children: [new TextRun({ text: "", size: 2 })], spacing: { before: 0, after: 0, line: 20 } })],
    });
  }
  return docOptions(sections);
}
