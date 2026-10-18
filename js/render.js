// Editable question paper: model -> HTML pieces, edits -> model.
import { perRow, infoItems, spreadRows } from "./layout.js?v=9";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const LET = "abcdefgh";
const ROM = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
export const subLabel = (i) => `${LET[i]})`;
export const romanItem = (i) => `${ROM[i] || i + 1})`;

/** Numbers, heading texts and marks text. Call after generating and after any add / delete / move. */
export function prepareDoc(paper, header) {
  let n = 0, total = 0;
  for (const part of paper.parts) {
    const given = part.items.length;
    const first = n + 1;
    n += given;
    const answered = Math.min(Number(part.answerAny) || given, given);
    total += answered * Number(part.marks || 0);
    part.items.forEach((it, i) => (it.no = first + i));
    if (!part.headingEdited) {
      let rule = "";
      if (Number(part.answerAny) && Number(part.answerAny) < given) rule = `Any ${part.answerAny}${part.compulsory ? `, Q.No.${n} compulsory` : ""}`;
      else if (part.compulsory) rule = `Q.No.${n} compulsory`;
      part.headingText = `${part.roman ? part.roman + ". " : ""}${part.instr || "Answer the following"}${rule ? ` (${rule})` : ""}`;
    }
    if (!part.marksEdited) part.marksText = `(${answered} × ${part.marks} = ${answered * part.marks})`;
  }
  if (!header.marksEdited) header.marks = String(total);
  return total;
}

const ed = (path, text, cls = "") => `<span class="ed ${cls}" contenteditable="true" spellcheck="false" data-path="${path}">${esc(text)}</span>`;
const btn = (act, pi, ii, ai, label, title) =>
  `<button data-act="${act}" data-p="${pi}" data-i="${ii}" data-a="${ai}" title="${title}">${label}</button>`;
const tools = (pi, ii, ai, last) => `<span class="q-tools no-print">` +
  btn("swap", pi, ii, ai, "🔄", "Swap with another question from the book") +
  (ai === 0 ? (ii > 0 ? btn("up", pi, ii, 0, "▲", "Move up") : "") + (!last ? btn("down", pi, ii, 0, "▼", "Move down") : "") +
    btn("del", pi, ii, 0, "✕", "Remove this question") : "") + `</span>`;
const src = (q) => (q?.src ? `<span class="src no-print">${esc(q.src)}</span>` : "");
const grid = (n) => `style="grid-template-columns:repeat(${n},minmax(0,1fr))"`;

// ---------- header ----------
export function headerHtml(header, L) {
  const item = ([label, value, path]) => `<span class="info-item">${label}: ${ed(path, value || "")}</span>`;
  const items = infoItems(header);
  let info;
  if (L.infoStyle === "line") info = `<div class="info-line">${items.map(item).join('<span class="info-sep"></span>')}</div>`;
  else if (L.infoStyle === "stacked") info = items.map((i) => `<div class="info-line">${item(i)}</div>`).join("");
  else info = spreadRows(items).map((r) => `<div class="info-spread">${r.map(item).join("")}</div>`).join("");
  return `<div class="paper-head">
      ${L.topNote ? `<div class="top-note">${esc(L.topNote)}</div>` : ""}
      <div class="h-school">${ed("h.school", header.school || "School name")}</div>
      <div class="h-exam">${ed("h.exam", header.exam || "Examination")}</div>
      <div class="hinfo hinfo-${L.infoStyle}">${info}</div>
    </div>`;
}

// ---------- question body ----------
function bodyHtml(b, base, L) {
  if (b.kind === "single") {
    let h = `<div class="q-body">${ed(`${base}.text`, b.text)}${src(b)}`;
    if (b.options?.length) {
      const n = perRow(L.optionsPerRow, b.options, L);
      h += `<div class="opts" ${grid(n)}>${b.options.map((o, k) => `<span>${LET[k]}) ${ed(`${base}.opt.${k}`, o)}</span>`).join("")}</div>`;
    }
    return h + "</div>";
  }
  if (b.kind === "group") {
    const single = b.subs.length === 1;
    return `<div class="q-body">${b.subs.map((s, si) => `
      <div class="sub">${single ? "" : `<b>${subLabel(si)}</b> `}${ed(`${base}.sub.${si}.heading`, s.heading, "b")}
        ${s.items.map((q, k) => `<div class="subitem"><span>${single ? romanItem(k) : `${k + 1}.`}</span> <span>${ed(`${base}.sub.${si}.item.${k}`, q.text)}${src(q)}</span></div>`).join("")}
      </div>`).join("")}</div>`;
  }
  if (b.kind === "map") {
    const n = perRow(L.placesPerRow, b.places.map((q) => `${q.text}  `), L);
    return `<div class="q-body">${ed(`${base}.heading`, b.heading, "b")}
      <div class="places" ${grid(n)}>${b.places.map((q, k) => `<span>${k + 1}. ${ed(`${base}.place.${k}`, q.text)}${src(q)}</span>`).join("")}</div></div>`;
  }
  return "";
}

// ---------- blocks (the pieces that are laid out page by page) ----------
/** One block per question; the first question of a part carries the part title + heading with it. */
export function blockList(paper) {
  const out = [];
  paper.parts.forEach((part, pi) => {
    if (!part.items.length) { out.push({ pi, ii: -1, lead: true }); return; }
    part.items.forEach((_, ii) => out.push({ pi, ii, lead: ii === 0 }));
  });
  return out;
}

export function blockHtml(paper, blk, L) {
  const part = paper.parts[blk.pi];
  const pi = blk.pi;
  let h = "";
  if (blk.lead) {
    if (part.title) h += `<div class="part-title">${ed(`p.${pi}.title`, part.title)}</div>`;
    h += `<div class="part-head">${ed(`p.${pi}.headingText`, part.headingText)}<span class="marks">${ed(`p.${pi}.marksText`, part.marksText)}</span></div>`;
  }
  if (blk.ii >= 0) {
    const it = part.items[blk.ii], ii = blk.ii, last = ii === part.items.length - 1;
    const base = `p.${pi}.i.${ii}.a`;
    if (it.alts.length === 2) {
      h += `<div class="q"><span class="q-no">${it.no}.</span><div>
        <div class="alt"><span>a)</span>${bodyHtml(it.alts[0], `${base}.0`, L)}${tools(pi, ii, 0, last)}</div>
        <div class="or">(OR)</div>
        <div class="alt"><span>b)</span>${bodyHtml(it.alts[1], `${base}.1`, L)}${tools(pi, ii, 1, last)}</div></div><span></span></div>`;
    } else {
      h += `<div class="q"><span class="q-no">${it.no}.</span>${bodyHtml(it.alts[0], `${base}.0`, L)}${tools(pi, ii, 0, last)}</div>`;
    }
  }
  if (blk.ii === part.items.length - 1) {
    h += `<div class="no-print add-q"><button data-act="add" data-p="${pi}">+ Add my own question here</button></div>`;
  }
  return `<div class="blk${blk.lead ? " lead" : ""}">${h}</div>`;
}

// ---------- edits ----------
export function applyEdit(paper, header, path, value) {
  const t = path.split(".");
  if (t[0] === "h") { header[t[1]] = value; if (t[1] === "marks") header.marksEdited = true; return; }
  const part = paper.parts[+t[1]];
  if (t[2] === "headingText") { part.headingText = value; part.headingEdited = true; return; }
  if (t[2] === "marksText") { part.marksText = value; part.marksEdited = true; return; }
  if (t[2] === "title") { part.title = value; return; }
  const b = part.items[+t[3]].alts[+t[5]];
  const f = t[6];
  if (f === "text" || (f === "heading" && b.kind === "map")) b[f] = value;
  else if (f === "opt") b.options[+t[7]] = value;
  else if (f === "place") b.places[+t[7]].text = value;
  else if (f === "sub") { const s = b.subs[+t[7]]; if (t[8] === "heading") s.heading = value; else s.items[+t[9]].text = value; }
}

export function addOwnQuestion(paper, pi) {
  const part = paper.parts[pi];
  const body = () => ({ kind: "single", id: `own-${Date.now()}-${Math.random()}`, text: "Type your question here", options: [], src: "", type: "short" });
  part.items.push({ entry: { kind: "single", type: "short", n: 1, from: "any" }, alts: part.eitherOr ? [body(), body()] : [body()] });
}

export function moveQuestion(paper, pi, ii, dir) {
  const items = paper.parts[pi].items;
  const j = ii + dir;
  if (j < 0 || j >= items.length) return;
  [items[ii], items[j]] = [items[j], items[ii]];
}
