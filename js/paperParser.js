// Reads the text of a model question paper and works out its pattern, question by question.

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
const NUMW = `(\\d{1,2}|${Object.keys(WORDS).join("|")})`;
const toNum = (s) => (s ? Number(s) || WORDS[String(s).toLowerCase()] || null : null);

const PART_RE = /^\s*(?:PART|SECTION|பகுதி)\s*[-–—:.]?\s*([IVX]+|[A-H]|\d{1,2})\b/i;
const ROMAN_HEAD_RE = /^\s*([IVX]{1,4})\s*[.)]\s*(\S.*)$/;
const MARKS_RE = /(\d{1,2})\s*[x×X*]\s*(\d{1,2})\s*=\s*(\d{1,3})/;
const ANY_RE = new RegExp(`(?:answer|attempt)?\\s*any\\s+${NUMW}|ஏதேனும்\\s*(\\d{1,2})`, "i");
const COMPULSORY_RE = /compulsory|கட்டாய/i;
const QNO_RE = /^\s*(\d{1,2})\s*[.)]\s*(.*)$/;
const OR_RE = /\(\s*(?:OR|அல்லது)\s*\)|^\s*(?:OR|அல்லது)\s*$/im;
const OPT_RE = /(?:^|\s|\()\(?([a-d])\s?\)/g;
const INSTR_WORDS = /answer|choose|fill|match|write|explain|define|mark|map|true|false|any\s+\w+|question|distinguish|reason|விடை/i;

const SUB_KINDS = [
  ["fill", /fill\s+in\s+the\s+blanks?/i],
  ["distinguish", /distinguish|differentiate|difference\s+between/i],
  ["reason", /give\s+reasons?/i],
  ["match", /match\s+the/i],
  ["truefalse", /true\s+or\s+false/i],
  ["mcq", /choose\s+the/i],
];

export function normalise(text) {
  let t = text.replace(/\r/g, "").replace(/\u00a0/g, " ");
  t = t.replace(/(?<=\S)\s*\b(Subject|Marks|Class|Time|Standard|Std)\s*:/g, "\n$1:");
  t = t.replace(/([A-Z]{3,})([A-Z][a-z]{2,})/g, "$1\n$2");
  t = t.replace(/(?<=[a-z0-9)?.\]])\s*((?:VIII|VII|VI|IV|IX|V|X|III|II|I)\s*\.\s+(?=[A-Z]))/g, "\n$1");
  t = t.replace(/(?<=[A-Z])(?<![IVX])((?:VIII|VII|VI|IV|IX|V|X|III|II|I)\s*\.\s+(?=(?:Answer|Choose|Fill|Match|Write|Mark|Map|Distinguish|Give|Define|Explain|State|Read)\b))/g, "\n$1");
  t = t.replace(/(?<=[A-Za-z)?.\]_”"'])\s*(?<!No\.\s?)(\d{1,2}\s*[.)]\s+(?=[A-Za-z(_“"']))/g, "\n$1");
  t = t.replace(/(?<=\S)\s*((?:PART|SECTION)\s*[-–—]\s*[IVX]+\b)/g, "\n$1");
  t = t.replace(/(?<=\S)\s*(\(\s*OR\s*\))\s*/g, "\n$1\n");
  return t;
}
const linesOf = (text) => normalise(text).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

function findHeadings(lines) {
  const parts = lines.map((l, i) => (PART_RE.test(l) && l.length < 80 ? i : -1)).filter((i) => i >= 0);
  if (parts.length) return { heads: parts.map((i) => ({ i, roman: lines[i].match(PART_RE)[1] })), hasPartWord: true };
  const out = [];
  let k = 0;
  lines.forEach((l, i) => {
    const m = l.match(ROMAN_HEAD_RE);
    if (m && m[1] === ROMAN[k] && (MARKS_RE.test(l) || INSTR_WORDS.test(m[2]))) { out.push({ i, roman: m[1] }); k++; }
  });
  return { heads: out, hasPartWord: false };
}

function hasOptions(text) {
  const s = [...text.matchAll(OPT_RE)].map((m) => m[1]);
  return s.includes("a") && s.includes("b") && s.includes("c");
}
function isOrQuestion(text) {
  return OR_RE.test(text) || (/(^|\n)\s*a\)/.test(text) && /\n\s*b\)/.test(text) && !hasOptions(text));
}
function countItems(seg) {
  const nums = [...seg.matchAll(/(?:^|\s)(\d{1,2})\s*[.)]\s+\S/g)].map((m) => Number(m[1]));
  const romans = [...seg.matchAll(/(?:^|\s)\(?(i{1,3}|iv|v|vi{1,3}|ix|x)\)\s*\S/g)];
  let n = 0;
  for (const x of nums) if (x === n + 1) n = x;
  let l = 0;
  for (const m of seg.matchAll(/(?:^|\s)\(?([a-h])\)\s*\S/g)) if (m[1].charCodeAt(0) - 97 === l) l++;
  return Math.max(1, n, romans.length, l >= 3 ? l : 0);
}
const firstAlt = (text) => text.split(/\(\s*OR\s*\)|\n\s*b\)\s/i)[0];

export function questionType(text, instr, marks) {
  const t = text.toLowerCase(), h = instr.toLowerCase();
  if (/time ?line/.test(t)) return "timeline";
  if (/distinguish|differentiate|difference between/.test(t + " " + h)) return "distinguish";
  if (/give reasons?/.test(t + " " + h)) return "reason";
  if (/true or false|true\/false/.test(t + " " + h)) return "truefalse";
  if (/match/.test(h) || /^match/.test(t)) return "match";
  if (hasOptions(text)) return "mcq";
  if (/_{3,}|\.{4,}|…{2,}/.test(text) || /fill/.test(h)) return "fill";
  if (/solve|problem|numerical/.test(h)) return "problem";
  if (marks <= 1) return /choose/.test(h) ? "mcq" : "oneword";
  if (/detail|paragraph|essay/.test(h)) return "long";
  if (/brief|short/.test(h)) return "short";
  return marks >= 4 ? "long" : "short";
}

export function entryFor(q, instr, marks) {
  const text = q.text;
  const alt = isOrQuestion(text) ? firstAlt(text) : text;
  if (/\bmap\b/i.test(text) && /mark|locate|show/i.test(text)) {
    const world = /world/i.test(text), tn = /tamil\s*nadu/i.test(text);
    const placesTxt = alt.replace(/^[^\n]*?map[^\n]*?[.:]?\s*(?:\n|$)/i, "");
    return { kind: "map", n: 1, places: countItems(placesTxt || alt), from: world ? "history" : "geography",
      mapName: world ? "World Map" : tn ? "Outline Map of Tamil Nadu" : "Outline Map of India" };
  }
  const hits = [];
  for (const [kind, re] of SUB_KINDS) { const m = text.match(re); if (m) hits.push({ kind, at: m.index }); }
  hits.sort((a, b) => a.at - b.at);
  if (hits.length && !hasOptions(text)) {
    const subs = hits.map((h, i) => {
      const seg = text.slice(h.at, i + 1 < hits.length ? hits[i + 1].at : undefined)
        .replace(/^[^:.\n]*[:.]?/, "").replace(/(?:^|\n|\s)[a-h]\)\s*$/, "").replace(/^\s*[a-h]\)\s*/, "");
      return { type: h.kind, k: countItems(seg), from: "any" };
    });
    if (subs.length > 1 || subs[0].k > 1) return { kind: "group", n: 1, subs };
  }
  return { kind: "single", type: questionType(alt, instr, marks), n: 1, from: "any" };
}

function readMarks(m, answered) {
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  if (answered && a === answered && b !== answered) return { n: a, marks: b };
  if (answered && b === answered && a !== answered) return { n: b, marks: a };
  return a >= b ? { n: a, marks: b } : { n: b, marks: a };
}

function compact(entries) {
  const out = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && e.kind === "single" && last.kind === "single" && last.type === e.type && last.from === e.from) last.n++;
    else out.push({ ...e, subs: e.subs?.map((s) => ({ ...s })) });
  }
  return out;
}

function headerInfo(lines) {
  const h = {};
  for (const l of lines.slice(0, 8)) {
    if (!h.school && /school/i.test(l)) h.school = l.replace(/\s{2,}.*/, "");
    if (!h.exam && /exam|test|assessment|revision/i.test(l)) h.exam = l.replace(/(subject|marks|time)\s*:.*$/i, "").trim();
    const t = l.match(/time\s*:?\s*([0-9][^|]*?(?:hrs?|hours?|min(?:utes)?)(?:\s*\d+\s*min)?)/i);
    if (!h.time && t) h.time = t[1].trim();
    const c = l.match(/class\s*:?\s*([IVX]+(?:\s*[–-]\s*[A-Z])?|\d{1,2})/i);
    if (!h.cls && c) h.cls = c[1];
    const d = l.match(/date\s*:?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/i);
    if (!h.date && d) h.date = d[1];
  }
  return h;
}

export function detectPattern(text) {
  const lines = linesOf(text);
  const notes = [];
  const { heads, hasPartWord } = findHeadings(lines);
  const totalM = text.match(/marks\s*[:\-]?\s*(\d{2,3})/i);
  const paperTotal = totalM ? Number(totalM[1]) : null;
  const header = headerInfo(lines.slice(0, heads[0]?.i ?? 8));

  if (!heads.length) {
    notes.push("Couldn't find part headings (Part – I, SECTION A, or I. II. III.). Please build the pattern by hand.");
    return { parts: [], notes, paperTotal, header };
  }

  let lastQ = 0;
  const parts = heads.map((h, idx) => {
    const chunk = lines.slice(h.i, idx + 1 < heads.length ? heads[idx + 1].i : lines.length);
    const instrLines = [], qs = [];
    for (const line of chunk) {
      const m = line.match(QNO_RE);
      if (m && Number(m[1]) === lastQ + 1) { lastQ++; qs.push({ no: lastQ, text: m[2] }); }
      else if (qs.length) qs[qs.length - 1].text += "\n" + line;
      else instrLines.push(line);
    }
    const instr = instrLines.join(" ");
    const all = chunk.join(" ");
    const anyM = instr.match(ANY_RE);
    const answerAnyRaw = anyM ? toNum(anyM[1] || anyM[2]) : null;
    const orCount = qs.filter((q) => isOrQuestion(q.text)).length;
    const eitherOr = qs.length > 0 && orCount >= Math.ceil(qs.length / 2);
    const mk = readMarks(instr.match(MARKS_RE) || all.match(MARKS_RE), answerAnyRaw || qs.length);
    const marks = mk ? mk.marks : 0;
    if (!mk) notes.push(`Part ${h.roman}: no "N × M = T" marks found – please enter the marks.`);

    const romanInside = instrLines.map((l) => l.match(ROMAN_HEAD_RE)).find(Boolean);
    let clean = (romanInside ? romanInside[2] : instr.replace(PART_RE, ""))
      .replace(MARKS_RE, "").replace(/\(?\s*Q\.?\s*No\.?\s*\d+[^)]*\)?/i, "").replace(/\(\s*\)|\(\s*,?\s*\)/g, "")
      .replace(new RegExp(`\\(?\\s*any\\s+${NUMW}[^)]*\\)?`, "i"), "")
      .replace(/\(\s*OR\s*\)/i, "").replace(/\s+/g, " ").replace(/^[\s\-–:.]+|[\s\-–:,(]+$/g, "").trim();
    if (!clean || /^answer\.?$/i.test(clean)) clean = "Answer the following";

    let mix = compact(qs.map((q) => entryFor(q, instr, marks || 1)));
    if (!mix.length && mk) mix = [{ kind: "single", type: questionType("", instr, marks), n: mk.n, from: "any" }];
    const given = mix.reduce((s, e) => s + e.n, 0);
    let answerAny = "";
    if (answerAnyRaw && answerAnyRaw < given) answerAny = answerAnyRaw;
    else if (!answerAnyRaw && mk && mk.n < given && !eitherOr) answerAny = mk.n;

    return {
      title: hasPartWord ? `Part – ${h.roman}` : "",
      roman: romanInside ? romanInside[1] : ROMAN[idx],
      instr: clean.slice(0, 90),
      marks: marks || 1,
      answerAny,
      eitherOr,
      compulsory: COMPULSORY_RE.test(all) && !eitherOr,
      mix,
    };
  });

  if (parts.some((p) => p.mix.some((e) => e.type === "timeline"))) {
    notes.push("The model paper has a Timeline question. The textbook exercises have none, so an 'Answer in detail' question is used in its place (you can edit it in the preview).");
  }
  return { parts, notes, paperTotal, header };
}
