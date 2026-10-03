// Patterns saved in this browser (localStorage) + built-in ones.
const KEY = "qpg.patterns.v3";

export const DEFAULT_PATTERNS = [
  {
    name: "June Monthly Test – 50 marks (Social)",
    builtin: true,
    subject: "social",
    weights: { history: 3, geography: 2, civics: 1, economics: 1 },
    header: { school: "THE CRESCENT MATRIC. HR. SEC. SCHOOL - UTHAMAPALAYAM", exam: "June Monthly Test – 2026", cls: "X – A", time: "1 Hr 30 Min" },
    parts: [
      { title: "", roman: "I", instr: "Choose the correct answer", marks: 1, answerAny: "", eitherOr: false, compulsory: false,
        mix: [{ kind: "single", type: "mcq", n: 7, from: "any" }] },
      { title: "", roman: "II", instr: "Answer the following", marks: 2, answerAny: 5, eitherOr: false, compulsory: true,
        mix: [{ kind: "single", type: "short", n: 7, from: "any" }] },
      { title: "", roman: "III", instr: "Answer in detail", marks: 5, answerAny: 5, eitherOr: false, compulsory: true,
        mix: [
          { kind: "single", type: "long", n: 5, from: "any" },
          { kind: "group", n: 1, from: "geography", subs: [{ type: "distinguish", k: 2, from: "geography" }, { type: "reason", k: 1, from: "geography" }] },
          { kind: "map", n: 1, places: 5, from: "history", mapName: "World Map" },
        ] },
      { title: "", roman: "IV", instr: "Map Work", marks: 8, answerAny: "", eitherOr: false, compulsory: false,
        mix: [{ kind: "map", n: 1, places: 8, from: "geography", mapName: "Outline Map of India" }] },
    ],
  },
  {
    name: "Common Quarterly – 100 marks (Social)",
    builtin: true,
    subject: "social",
    header: { exam: "COMMON QUARTERLY EXAMINATION - 2026", cls: "X", time: "3.00 hrs" },
    parts: [
      { title: "Part – I", roman: "I", instr: "Choose the correct answer.", marks: 1, answerAny: "", eitherOr: false, compulsory: false,
        mix: [{ kind: "single", type: "mcq", n: 14, from: "any" }] },
      { title: "Part – II", roman: "II", instr: "Answer the following", marks: 2, answerAny: 10, eitherOr: false, compulsory: true,
        mix: [{ kind: "single", type: "short", n: 14, from: "any" }] },
      { title: "Part – III", roman: "III", instr: "Answer the following", marks: 5, answerAny: 10, eitherOr: false, compulsory: true,
        mix: [
          { kind: "group", n: 1, from: "any", subs: [{ type: "fill", k: 5, from: "any" }] },
          { kind: "single", type: "long", n: 3, from: "any" },
          { kind: "group", n: 1, from: "geography", subs: [{ type: "distinguish", k: 2, from: "geography" }, { type: "reason", k: 1, from: "geography" }] },
          { kind: "single", type: "long", n: 8, from: "any" },
          { kind: "map", n: 1, places: 5, from: "history", mapName: "World Map" },
        ] },
      { title: "Part – IV", roman: "IV", instr: "Answer the following question.", marks: 8, answerAny: "", eitherOr: true, compulsory: false,
        mix: [{ kind: "single", type: "long", n: 1, from: "any" }, { kind: "map", n: 1, places: 8, from: "geography", mapName: "Outline Map of India" }] },
    ],
  },
];

export function loadPatterns() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(KEY)) || []; } catch { /* ignore */ }
  return [...DEFAULT_PATTERNS, ...saved];
}
export function savePattern(p) {
  const saved = loadPatterns().filter((x) => !x.builtin && x.name !== p.name);
  saved.push({ ...p, builtin: false });
  localStorage.setItem(KEY, JSON.stringify(saved));
}
export function deletePattern(name) {
  localStorage.setItem(KEY, JSON.stringify(loadPatterns().filter((x) => !x.builtin && x.name !== name)));
}
