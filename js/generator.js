// Pure logic (no DOM) so it can be tested with Node.
//
// Pattern part:
//   { title, roman, instr, marks, answerAny, eitherOr, compulsory, mix: [entry...] }
// Entry kinds:
//   single : { kind:"single", type:"short", n:7, from:"any" }
//   group  : { kind:"group", n:1, subs:[{type:"distinguish",k:2,from:"geography"},{type:"reason",k:1,from:"geography"}] }
//   map    : { kind:"map", n:1, places:5, from:"history", mapName:"World Map" }
// from = "any" uses the weightage ratio (e.g. History 3 : Geography 2 : Civics 1 : Economics 1).

export const QUESTION_TYPES = {
  mcq: "Choose the correct answer",
  fill: "Fill in the blanks",
  match: "Match the following",
  truefalse: "True or False",
  oneword: "Answer in one word",
  short: "Answer briefly",
  reason: "Give reasons",
  distinguish: "Distinguish between",
  long: "Answer in detail",
  timeline: "Timeline",
  problem: "Numerical problem",
  map: "Map work",
};
export const typeLabel = (t) => QUESTION_TYPES[t] || t;

const FALLBACK = { oneword: ["fill"], fill: ["oneword"], truefalse: ["fill"], problem: ["short"], timeline: ["long"] };

export function makeRng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const unitKey = (q) => `${q.section || "main"}:${q.unit}`;

export function normaliseEntry(e) {
  if (!e.kind) return { kind: "single", type: e.type || "short", n: Number(e.n) || 0, from: "any" };
  return { from: "any", ...e };
}
export const entryCount = (e) => Number(e.n) || 0;
export const partCount = (part) => part.mix.reduce((s, e) => s + entryCount(e), 0);
export function partMarks(part) {
  const answered = Number(part.answerAny) || partCount(part);
  return answered * Number(part.marks || 0);
}
export const patternTotal = (pattern) => pattern.parts.reduce((s, p) => s + partMarks(p), 0);

/** Split a map exercise into single places. */
export function placesFrom(text) {
  const flat = String(text).replace(/\n/g, " ").replace(/\s+/g, " ").trim()
    .replace(/^(?:mark|locate|show|shade|point out)[^.:\d]*?(?:map|following)[^.:\d]*[.:]?\s*/i, "");
  const items = flat.split(/(?:^|\s)\d{1,2}\s*[.)]\s+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (let it of items) {
    it = it.replace(/[.;]+$/, "").trim();
    const verb = it.match(/^(?:mark|locate|show|shade|demarcate|delineate|point out)\s+(?:the\s+)?(.*)$/i);
    if (verb) it = verb[1];
    it = it.replace(/\s+(?:on|in)\s+(?:the\s+)?(?:different\s+|given\s+)?(?:outline\s+)?[\w\s]*maps?$/i, "");
    const cat = it.match(/^([^–\-:]{3,40})\s*[–\-:]\s+(.+)$/);
    const list = cat ? cat[2] : it;
    const parts = (list.includes(",") ? list.split(/,|\band\b/) : [list])
      .map((s) => s.trim().replace(/^the\s+/i, "")).filter((s) => s.length > 1)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
    if (parts.length > 1 && parts.every((p) => p.length < 45)) out.push(...parts);
    else if (it.length <= 70) out.push(it.charAt(0).toUpperCase() + it.slice(1));
  }
  return [...new Set(out)];
}

function poolOf(bank, type, units, from) {
  const sel = new Set(units);
  return bank.filter((q) => q.type === type && sel.has(unitKey(q)) && (from === "any" || !from || q.section === from));
}
function placePool(bank, units, from) {
  const out = [];
  for (const q of poolOf(bank, "map", units, from)) {
    placesFrom(q.q).forEach((p, i) => out.push({ id: `${q.id}#${i}`, q: p, section: q.section, unit: q.unit, type: "place" }));
  }
  return out;
}

function pickSpread(pool, n, rng, used) {
  const byUnit = new Map();
  for (const q of shuffle(pool, rng)) {
    if (used.has(q.id)) continue;
    if (!byUnit.has(unitKey(q))) byUnit.set(unitKey(q), []);
    byUnit.get(unitKey(q)).push(q);
  }
  const buckets = shuffle([...byUnit.values()], rng);
  const picked = [];
  while (picked.length < n && buckets.some((b) => b.length)) {
    for (const b of buckets) {
      if (picked.length >= n) break;
      if (b.length) { const q = b.shift(); picked.push(q); used.add(q.id); }
    }
  }
  return picked;
}

function apportion(n, sections, weightsIn, tally) {
  const anySet = sections.some((s) => Number(weightsIn[s]) > 0);
  const weights = anySet ? weightsIn : Object.fromEntries(sections.map((s) => [s, 1]));
  const W = sections.reduce((s, x) => s + (Number(weights[x]) || 0), 0);
  if (!W) return Object.fromEntries(sections.map((s, i) => [s, i === 0 ? n : 0]));
  const T = sections.reduce((s, x) => s + (tally[x] || 0), 0) + n;
  const want = sections.map((s) => Math.max(0, (T * (Number(weights[s]) || 0)) / W - (tally[s] || 0)));
  const sum = want.reduce((a, b) => a + b, 0) || 1;
  const exact = want.map((w) => (w / sum) * n);
  const out = exact.map(Math.floor);
  let left = n - out.reduce((a, b) => a + b, 0);
  exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) out[i]++; });
  return Object.fromEntries(sections.map((s, i) => [s, out[i]]));
}

function draw(ctx, type, n, from, isPlace = false) {
  if (n <= 0) return [];
  const get = (t, f) => (isPlace ? placePool(ctx.bank, ctx.units, f) : poolOf(ctx.bank, t, ctx.units, f));
  let picked = [];
  if (from && from !== "any") {
    picked = pickSpread(get(type, from), n, ctx.rng, ctx.used);
  } else {
    const full = get(type, "any").filter((q) => !ctx.used.has(q.id));
    const secs = [...new Set(full.map((q) => q.section))]
      .filter((s) => Number(ctx.weights[s]) !== 0 || ctx.weights[s] === undefined);
    const plan = apportion(n, secs, ctx.weights, ctx.tally);
    for (const s of secs) picked.push(...pickSpread(full.filter((q) => q.section === s), plan[s], ctx.rng, ctx.used));
    if (picked.length < n) picked.push(...pickSpread(full, n - picked.length, ctx.rng, ctx.used));
    picked = shuffle(picked, ctx.rng);
  }
  for (const alt of isPlace ? [] : FALLBACK[type] || []) {
    if (picked.length >= n) break;
    const more = pickSpread(get(alt, from), n - picked.length, ctx.rng, ctx.used);
    if (more.length) {
      ctx.warnings.push(`${ctx.label}: not enough "${typeLabel(type)}" questions – used ${more.length} "${typeLabel(alt)}" instead.`);
      picked.push(...more);
    }
  }
  if (picked.length < n && (isPlace || (from && from !== "any"))) {
    const allUnits = [...new Set(ctx.bank.map(unitKey))].filter((k) => !from || from === "any" || k.startsWith(from + ":"));
    const pool = isPlace ? placePool(ctx.bank, allUnits, from) : poolOf(ctx.bank, type, allUnits, from);
    const more = pickSpread(pool, n - picked.length, ctx.rng, ctx.used);
    if (more.length) {
      const us = [...new Set(more.map((q) => `${q.section} unit ${q.unit}`))].join(", ");
      const what = isPlace ? "map places" : `"${typeLabel(type)}" questions`;
      ctx.warnings.push(`${ctx.label}: the selected units don't have enough ${what}, so ${more.length} taken from ${us}. Change them in the preview if needed.`);
      picked.push(...more);
    }
  }
  if (picked.length < n) {
    const where = from && from !== "any" ? ` from ${from}` : "";
    ctx.warnings.push(`${ctx.label}: needs ${n} ${isPlace ? "map places" : `"${typeLabel(type)}" questions`}${where}, only ${picked.length} found in the selected units.`);
  }
  if (!isPlace) for (const q of picked) ctx.tally[q.section] = (ctx.tally[q.section] || 0) + 1;
  return picked;
}

const qView = (q) => ({ id: q.id, text: q.q, options: q.options ? [...q.options] : [], src: `${q.section} ${q.unit}`, type: q.type });

function buildEntry(ctx, e, count) {
  if (e.kind === "map") {
    const places = Math.max(1, Number(e.places) || 5);
    const got = draw(ctx, "map", places * count, e.from, true);
    const name = e.mapName || "map";
    for (let i = 0; i < count; i++) {
      const sec = got[i * places]?.section;
      if (sec) ctx.tally[sec] = (ctx.tally[sec] || 0) + 1;
    }
    return Array.from({ length: count }, (_, i) => ({
      kind: "map", heading: `Mark the following on the ${name}.`,
      places: got.slice(i * places, (i + 1) * places).map(qView),
    }));
  }
  if (e.kind === "group") {
    const subs = (e.subs || []).map((s) => ({ s, qs: draw(ctx, s.type, (Number(s.k) || 1) * count, s.from || e.from) }));
    return Array.from({ length: count }, (_, i) => ({
      kind: "group",
      subs: subs.map(({ s, qs }) => ({
        type: s.type,
        heading: `${typeLabel(s.type)}:`,
        items: qs.slice(i * (Number(s.k) || 1), (i + 1) * (Number(s.k) || 1)).map(qView),
      })),
    }));
  }
  return draw(ctx, e.type, count, e.from).map((q) => ({ kind: "single", ...qView(q) }));
}

const isFixed = (e) => (e.kind === "group"
  ? (e.subs || []).every((s) => (s.from || e.from) && (s.from || e.from) !== "any")
  : e.from && e.from !== "any");
export const partLabel = (p) => [p.title, `${p.roman ? p.roman + ". " : ""}${p.instr || ""}`.trim()].filter(Boolean).join(" ") || "Part";

export function generatePaper(bank, pattern, units, seed, weights = {}) {
  const ctx = { bank, units, rng: makeRng(seed), used: new Set(), weights, tally: {}, warnings: [], label: "" };
  const tasks = [];
  pattern.parts.forEach((part, pi) => part.mix.forEach((raw) => {
    const e = normaliseEntry(raw);
    if (entryCount(e)) tasks.push({ pi, e, per: part.eitherOr ? 2 : 1, label: partLabel(part) });
  }));
  const order = [...tasks.filter((t) => isFixed(t.e)), ...tasks.filter((t) => !isFixed(t.e))];
  for (const t of order) { ctx.label = t.label; t.bodies = buildEntry(ctx, t.e, entryCount(t.e) * t.per); }

  const parts = pattern.parts.map((part, pi) => {
    const items = [];
    for (const t of tasks.filter((x) => x.pi === pi)) {
      for (let i = 0; i < entryCount(t.e); i++) {
        const alts = t.bodies.slice(i * t.per, i * t.per + t.per);
        if (alts.length === t.per) items.push({ entry: t.e, alts });
      }
    }
    return { ...part, items };
  });
  return { parts, warnings: ctx.warnings };
}

export function usedIds(paper) {
  const ids = new Set();
  const add = (b) => {
    if (b.kind === "single") ids.add(b.id);
    if (b.kind === "group") b.subs.forEach((s) => s.items.forEach((q) => ids.add(q.id)));
    if (b.kind === "map") b.places.forEach((q) => ids.add(q.id));
  };
  paper.parts.forEach((p) => p.items.forEach((it) => it.alts.forEach(add)));
  return ids;
}

export function swapAlt(bank, paper, partIdx, itemIdx, altIdx, units, weights = {}, rng = Math.random) {
  const item = paper.parts[partIdx].items[itemIdx];
  const old = item.alts[altIdx];
  const ctx = { bank, units, rng: () => rng(), used: usedIds(paper), weights, tally: {}, warnings: [], label: "" };
  let e = item.entry;
  if (e.kind === "single" && old.src) e = { ...e, from: old.src.split(" ")[0], type: old.type || e.type };
  const [fresh] = buildEntry(ctx, e, 1);
  if (!fresh || (fresh.kind === "single" && !fresh.id)) return false;
  item.alts[altIdx] = fresh;
  return true;
}

export function sectionTally(paper) {
  const t = {};
  const add = (q) => { const s = (q?.src || "").split(" ")[0]; if (s) t[s] = (t[s] || 0) + 1; };
  paper.parts.forEach((p) => p.items.forEach((it) => {
    const b = it.alts[0];
    if (b.kind === "single") add(b);
    if (b.kind === "group") b.subs.forEach((s) => s.items.forEach(add));
    if (b.kind === "map") add(b.places[0]);
  }));
  return t;
}
