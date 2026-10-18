// Pure logic (no DOM) so it can be tested with Node.
//
// Pattern part:
//   { title, roman, instr, marks, answerAny, eitherOr, compulsory, mix: [entry...] }
// Entry kinds:
//   single : { kind:"single", type:"short", n:7, from:"any" }
//   group  : { kind:"group", n:1, subs:[{type:"distinguish",k:2,from:"geography"},{type:"reason",k:1,from:"geography"}] }
//   map    : { kind:"map", n:1, places:5, from:"history", mapType:"world map" }
//            Map questions are NOT tied to units. Places come from the bank entry whose
//            section = from and map_type = mapType (e.g. "world map" / "indian map").
//            mapName is still accepted (e.g. "World Map") and used to work out the map type.
// Either/Or: an entry may carry orB = { kind, type, from, places, mapType, mapName, subs }
//   giving the kind of question for option (b). If orB is missing, (b) is the same kind as (a).
//   e.g. { kind:"single", type:"long", n:1, from:"history", orB:{ kind:"single", type:"timeline", from:"history" } }
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
  const out = { from: "any", ...e };
  if (out.orB) out.orB = normaliseB(out.orB, out);
  else delete out.orB;
  return out;
}
/** Option (b) spec for an Either/Or entry. Shares n with (a). */
export function normaliseB(b, a = {}) {
  if (!b) return null;
  const kind = b.kind || "single";
  const base = { kind, n: a.n, from: b.from || "any" };
  if (kind === "map") return { ...base, places: Number(b.places) || 5, mapType: b.mapType || "", mapName: b.mapName || "" };
  if (kind === "group") return { ...base, subs: (b.subs || []).map((x) => ({ type: x.type, k: Number(x.k) || 1, from: x.from || "any" })) };
  return { ...base, type: b.type || "short" };
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

/** Questions with unit "any" (e.g. the generic history timeline) are not tied to a unit
 *  and are always available, whatever units are selected. */
export const isAnyUnit = (q) => String(q.unit).toLowerCase() === "any";
function poolOf(bank, type, units, from) {
  const sel = new Set(units);
  return bank.filter((q) => q.type === type && (isAnyUnit(q) || sel.has(unitKey(q))) && (from === "any" || !from || q.section === from));
}
/** "World Map" / "world" / "indian map" / "India" -> "world" / "indian" */
export const mapKey = (s) => {
  const k = String(s || "").toLowerCase().replace(/\bmap\b/g, "").replace(/\s+/g, " ").trim();
  if (/\bworld\b/.test(k)) return "world";
  if (/\bindia/.test(k)) return "indian";
  return k;
};
const titleCase = (s) => String(s).replace(/\b\w/g, (c) => c.toUpperCase());
/** Map type for an entry: mapType first, then mapName, else "" (any map). */
export const entryMapType = (e) => mapKey(e.mapType || e.map_type || e.mapName || "");
/** Map types available in the bank for a section, e.g. { history: ["world map","indian map"] } */
export function mapTypes(bank) {
  const out = {};
  for (const q of bank) {
    if (q.type !== "map" || !q.map_type) continue;
    (out[q.section] ||= []);
    if (!out[q.section].includes(q.map_type)) out[q.section].push(q.map_type);
  }
  return out;
}
/** All places for a section + map type. Units are ignored for map questions. */
function placePool(bank, from, mapType) {
  const want = mapKey(mapType);
  const out = [];
  for (const q of bank) {
    if (q.type !== "map") continue;
    if (from && from !== "any" && q.section !== from) continue;
    if (want && q.map_type && mapKey(q.map_type) !== want) continue;
    const list = Array.isArray(q.q) ? q.q.map((p) => String(p).trim()).filter(Boolean) : placesFrom(q.q);
    const mt = q.map_type || "map";
    list.forEach((p) => out.push({ id: `${q.id}#${p.toLowerCase()}`, q: p, section: q.section, unit: mt, type: "place" }));
  }
  return out;
}
function drawPlaces(ctx, n, from, mapType) {
  if (n <= 0) return [];
  const pool = placePool(ctx.bank, from, mapType);
  const picked = pickSpread(pool, n, ctx.rng, ctx.used);
  if (picked.length < n) {
    const where = [from && from !== "any" ? from : "", mapType ? titleCase(mapType) : ""].filter(Boolean).join(" – ");
    ctx.warnings.push(pool.length
      ? `${ctx.label}: needs ${n} map places${where ? ` (${where})` : ""}, only ${picked.length} available.`
      : `${ctx.label}: no map places found${where ? ` for ${where}` : ""}. Check "section" and "map_type" in the question bank.`);
  }
  return picked;
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

function draw(ctx, type, n, from) {
  if (n <= 0) return [];
  const get = (t, f) => poolOf(ctx.bank, t, ctx.units, f);
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
  for (const alt of ctx.noFallback ? [] : FALLBACK[type] || []) {
    if (picked.length >= n) break;
    const more = pickSpread(get(alt, from), n - picked.length, ctx.rng, ctx.used);
    if (more.length) {
      ctx.warnings.push(`${ctx.label}: not enough "${typeLabel(type)}" questions – used ${more.length} "${typeLabel(alt)}" instead.`);
      picked.push(...more);
    }
  }
  if (picked.length < n && (from && from !== "any")) {
    const allUnits = [...new Set(ctx.bank.map(unitKey))].filter((k) => !from || from === "any" || k.startsWith(from + ":"));
    const pool = poolOf(ctx.bank, type, allUnits, from);
    const more = pickSpread(pool, n - picked.length, ctx.rng, ctx.used);
    if (more.length) {
      const us = [...new Set(more.map((q) => `${q.section} unit ${q.unit}`))].join(", ");
      const what = `"${typeLabel(type)}" questions`;
      ctx.warnings.push(`${ctx.label}: the selected units don't have enough ${what}, so ${more.length} taken from ${us}. Change them in the preview if needed.`);
      picked.push(...more);
    }
  }
  if (picked.length < n) {
    const where = from && from !== "any" ? ` from ${from}` : "";
    ctx.warnings.push(`${ctx.label}: needs ${n} "${typeLabel(type)}" questions${where}, only ${picked.length} found in the selected units.`);
  }
  for (const q of picked) ctx.tally[q.section] = (ctx.tally[q.section] || 0) + 1;
  return picked;
}

const qView = (q) => ({ id: q.id, text: q.q, options: q.options ? [...q.options] : [], src: `${q.section} ${q.unit ?? ""}`.trim(), type: q.type });

function buildEntry(ctx, e, count) {
  if (e.kind === "map") {
    const places = Math.max(1, Number(e.places) || 5);
    const mt = entryMapType(e);
    const got = drawPlaces(ctx, places * count, e.from, mt);
    const name = e.mapName || (mt ? `${titleCase(mt)} Map` : "map");
    for (let i = 0; i < count; i++) {
      const sec = got[i * places]?.section;
      if (sec) ctx.tally[sec] = (ctx.tally[sec] || 0) + 1;
    }
    return Array.from({ length: count }, (_, i) => ({
      kind: "map", mapType: mt, heading: `Mark the following on the ${name}.`,
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
    if (!entryCount(e)) return;
    const label = partLabel(part);
    if (part.eitherOr && e.orB) {
      // (a) and (b) are different kinds: build each side separately, then pair them up
      const pair = { pi, e, per: 2, label, sides: [] };
      tasks.push(pair);
      pair.sides.push({ e, label, bodies: null }, { e: e.orB, label: `${label} (b)`, bodies: null });
    } else {
      tasks.push({ pi, e, per: part.eitherOr ? 2 : 1, label });
    }
  }));
  const jobs = [];
  for (const t of tasks) {
    if (t.sides) t.sides.forEach((sd) => jobs.push({ spec: sd.e, n: entryCount(t.e), label: sd.label, set: (b) => (sd.bodies = b) }));
    else jobs.push({ spec: t.e, n: entryCount(t.e) * t.per, label: t.label, set: (b) => (t.bodies = b) });
  }
  const order = [...jobs.filter((j) => isFixed(j.spec)), ...jobs.filter((j) => !isFixed(j.spec))];
  for (const j of order) { ctx.label = j.label; j.set(buildEntry(ctx, j.spec, j.n)); }
  for (const t of tasks) {
    if (!t.sides) continue;
    const [A, B] = t.sides.map((sd) => sd.bodies || []);
    t.bodies = [];
    for (let i = 0; i < entryCount(t.e); i++) t.bodies.push(A[i], B[i]);
  }

  const parts = pattern.parts.map((part, pi) => {
    const items = [];
    for (const t of tasks.filter((x) => x.pi === pi)) {
      for (let i = 0; i < entryCount(t.e); i++) {
        const alts = t.bodies.slice(i * t.per, i * t.per + t.per);
        if (alts.length === t.per && alts.every(Boolean)) items.push({ entry: t.e, alts });
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
  // noFallback: a swap must give the same kind of question (e.g. timeline stays timeline)
  const ctx = { bank, units, rng: () => rng(), used: usedIds(paper), weights, tally: {}, warnings: [], label: "", noFallback: true };
  let e = altIdx === 1 && item.entry.orB ? item.entry.orB : item.entry;
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
