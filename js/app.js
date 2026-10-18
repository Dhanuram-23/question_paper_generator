import { generatePaper, swapAlt, patternTotal, partCount, unitKey, QUESTION_TYPES, normaliseEntry, normaliseB, sectionTally, isAnyUnit } from "./generator.js?v=9";
import { loadPatterns, savePattern, deletePattern } from "./patterns.js?v=9";
import { prepareDoc, applyEdit, addOwnQuestion, moveQuestion } from "./render.js?v=9";
import { paginate } from "./paginate.js?v=9";
import { detectPattern } from "./paperParser.js?v=9";
import { extractText, loadScript } from "./fileText.js?v=9";
import { buildDocx } from "./docxExport.js?v=9";
import { loadLayout, saveLayout, DEFAULT_LAYOUT, PAPER_SIZES, FONTS, applyLayoutToPage } from "./layout.js?v=9";

export const APP_VERSION = "v9";
const DOCX_LIB = "https://cdn.jsdelivr.net/npm/docx@9.6.1/dist/index.iife.js";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const HEADER_FIELDS = [["school", "h-school"], ["exam", "h-exam"], ["cls", "h-cls"], ["date", "h-date"], ["time", "h-time"]];

const state = {
  layout: loadLayout(), catalog: null, cls: null, subject: null, bank: [], units: new Set(), weights: {},
  pattern: null, paper: null, header: null, seed: "", edited: false, pages: null, dirty: false,
};

const show = (id) => $(id).classList.remove("hidden");
const hide = (...ids) => ids.forEach((id) => $(id).classList.add("hidden"));
const sectionsOf = (s) => (s?.sections?.length ? s.sections : [{ id: "main", name: null, units: s?.units || [] }]);
const hasSections = () => !!state.subject?.sections?.length;

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

// ================= 1. class =================
async function init() {
  $("app-version").textContent = APP_VERSION;
  try { state.catalog = await fetchJson("data/subjects.json"); }
  catch { $("class-list").innerHTML = `<p class="warn">Could not load data/subjects.json. Run a local server inside the project folder (see README).</p>`; return; }
  const classes = Object.keys(state.catalog.classes).sort((a, b) => a - b);
  $("class-list").innerHTML = classes.map((c) => `<button class="chip" data-cls="${c}">Class ${c}</button>`).join("");
  $("class-list").onclick = (e) => e.target.dataset.cls && selectClass(e.target.dataset.cls);
  wirePattern();
  wireGenerate();
  wirePreview();
  wireSettings();
}

function selectClass(cls) {
  state.cls = cls;
  markActive("class-list", "cls", cls);
  hide("step-units", "step-pattern", "step-generate", "preview");
  const subjects = state.catalog.classes[cls].subjects;
  $("subject-list").innerHTML = subjects.map((s) => `<button class="chip" data-sub="${s.id}">${esc(s.name)}</button>`).join("");
  $("subject-list").onclick = (e) => e.target.dataset.sub && selectSubject(subjects.find((s) => s.id === e.target.dataset.sub));
  show("step-subject");
}

// ================= 2. subject =================
async function selectSubject(subject) {
  state.subject = subject;
  markActive("subject-list", "sub", subject.id);
  hide("preview");
  let loadError = "";
  try { state.bank = (await fetchJson(`data/${state.cls}/${subject.id}.json`)).questions || []; }
  catch (err) { state.bank = []; loadError = err.message; }
  renderUnits();
  if (!state.bank.length) {
    $("bank-info").innerHTML = `<span class="warn" style="display:inline-block">⚠️ No questions found for ${esc(subject.name)} (file <code>data/${state.cls}/${subject.id}.json</code> ${loadError ? "could not be loaded" : "is empty"}). Run <code>python3 tools/excel_to_json.py</code> and reload the page.</span>`;
  } else {
    const kinds = {};
    state.bank.forEach((q) => (kinds[q.type] = (kinds[q.type] || 0) + 1));
    $("bank-info").textContent = `${state.bank.length} exercise questions in the bank (` +
      Object.entries(kinds).map(([k, n]) => `${QUESTION_TYPES[k] || k} ${n}`).join(", ") + ").";
  }
  renderWeights();
  refreshPatternList();
  show("step-units"); show("step-pattern"); show("step-generate");
  const list = loadPatterns();
  const first = list.findIndex((p) => !p.subject || p.subject === subject.id);
  selectPattern(Math.max(0, first));
}

// ================= 3. units + weightage =================
function renderUnits() {
  state.units = new Set();
  const counts = {};
  for (const q of state.bank) if (q.type !== "map" && !isAnyUnit(q)) counts[unitKey(q)] = (counts[unitKey(q)] || 0) + 1;
  $("unit-groups").innerHTML = sectionsOf(state.subject).map((sec) => `
    <div class="unit-group">
      ${sec.name ? `<h3><input type="checkbox" class="sec-toggle" data-sec="${sec.id}"> ${esc(sec.name)}</h3>` : ""}
      <div class="unit-list">${sec.units.map((u) => {
        const k = `${sec.id}:${u.no}`;
        return `<label><input type="checkbox" class="unit-cb" data-sec="${sec.id}" value="${k}">
          Unit ${u.no}${u.name && u.name !== `Unit ${u.no}` ? ` – ${esc(u.name)}` : ""} <span class="count">(${counts[k] || 0})</span></label>`;
      }).join("")}</div>
    </div>`).join("");
  $("unit-groups").onchange = (e) => {
    if (e.target.classList.contains("sec-toggle")) {
      document.querySelectorAll(`.unit-cb[data-sec="${e.target.dataset.sec}"]`).forEach((cb) => (cb.checked = e.target.checked));
    }
    syncUnits();
  };
  $("units-all").onclick = () => setAllUnits(true);
  $("units-none").onclick = () => setAllUnits(false);
}
function setAllUnits(on) { document.querySelectorAll(".unit-cb, .sec-toggle").forEach((cb) => (cb.checked = on)); syncUnits(); }
function syncUnits() { state.units = new Set([...document.querySelectorAll(".unit-cb:checked")].map((cb) => cb.value)); }

const weightKey = () => `qpg.weights.${state.cls}.${state.subject.id}`;
function renderWeights(fromPattern) {
  if (!hasSections()) { hide("weights-box"); state.weights = {}; return; }
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(weightKey())) || {}; } catch { /* ignore */ }
  const secs = state.subject.sections;
  state.weights = Object.fromEntries(secs.map((s) => [s.id, Number(fromPattern?.[s.id] ?? saved[s.id] ?? s.weight ?? 1)]));
  $("weights").innerHTML = secs.map((s, i) =>
    `${i ? '<span class="colon">:</span>' : ""}<label>${esc(s.name)} <input type="number" min="0" data-w="${s.id}" value="${state.weights[s.id]}"></label>`).join("");
  $("weights").oninput = (e) => {
    if (!e.target.dataset.w) return;
    state.weights[e.target.dataset.w] = Number(e.target.value) || 0;
    localStorage.setItem(weightKey(), JSON.stringify(state.weights));
  };
  show("weights-box");
}

// ================= 4. pattern =================
function wirePattern() {
  $("model-file").onchange = onModelUpload;
  $("pattern-select").onchange = (e) => selectPattern(Number(e.target.value));
  $("part-add").onclick = () => {
    const i = state.pattern.parts.length;
    state.pattern.parts.push({ title: "", roman: ROMAN[i] || "", instr: "Answer the following", marks: 2, answerAny: "", eitherOr: false, compulsory: false, mix: [{ kind: "single", type: "short", n: 5, from: "any" }] });
    renderPatternEditor();
  };
  $("pattern-save").onclick = () => {
    const name = $("pattern-name").value.trim();
    if (!name) return alert("Give the pattern a name first.");
    savePattern({ name, subject: state.subject?.id, weights: { ...state.weights }, header: headerFromInputs(), parts: state.pattern.parts });
    refreshPatternList(name);
    alert("Pattern saved in this browser.");
  };
  $("pattern-delete").onclick = () => {
    const p = loadPatterns()[Number($("pattern-select").value)];
    if (!p || p.builtin) return alert("Built-in patterns can't be deleted.");
    if (confirm(`Delete "${p.name}"?`)) { deletePattern(p.name); refreshPatternList(); selectPattern(0); }
  };
  const box = $("pattern-parts");
  box.addEventListener("input", (e) => onPatternField(e, false));
  box.addEventListener("change", (e) => onPatternField(e, true));
  box.addEventListener("click", onPatternClick);
}

async function onModelUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const notes = $("model-notes");
  notes.innerHTML = "";
  $("model-status").textContent = "Reading the paper…";
  try {
    const text = await extractText(file);
    $("model-text").textContent = text;
    $("model-text-box").classList.remove("hidden");
    if (text.replace(/\s/g, "").length < 50) throw new Error("No text found – this looks like a scanned/photo paper. Please build the pattern by hand.");
    const { parts, notes: msgs, paperTotal, header } = detectPattern(text);
    if (!parts.length) throw new Error(msgs[0]);
    state.pattern = { name: "", parts };
    for (const [k, id] of HEADER_FIELDS) if (header[k]) setField(id, header[k]);
    $("pattern-name").value = file.name.replace(/\.[^.]+$/, "");
    renderPatternEditor();
    const total = patternTotal(state.pattern);
    const count = parts.reduce((s, p) => s + partCount(p), 0);
    notes.innerHTML =
      `<div class="info">✅ Found ${parts.length} parts, ${count} questions, ${total} marks${paperTotal === total ? " (same as the paper)" : ""}. Check the pattern below, then save it.</div>` +
      (paperTotal && paperTotal !== total ? `<div class="warn">⚠️ The paper says ${paperTotal} marks but the parts add up to ${total}. Please check.</div>` : "") +
      msgs.map((m) => `<div class="warn">⚠️ ${esc(m)}</div>`).join("");
  } catch (err) {
    notes.innerHTML = `<div class="warn">⚠️ ${esc(err.message)}</div>`;
  } finally {
    $("model-status").textContent = "";
  }
}

function setField(id, v) { $(id).value = v; localStorage.setItem(`qpg.${id}`, v); }

function refreshPatternList(selectName) {
  const list = loadPatterns();
  $("pattern-select").innerHTML = list.map((p, i) =>
    (!p.subject || !state.subject || p.subject === state.subject.id) ? `<option value="${i}">${esc(p.name)}</option>` : "").join("");
  if (selectName) { const i = list.findIndex((p) => p.name === selectName); if (i >= 0) $("pattern-select").value = i; }
}

function selectPattern(i) {
  const p = loadPatterns()[i];
  if (!p) return;
  state.pattern = JSON.parse(JSON.stringify(p));
  state.pattern.parts.forEach((part, k) => { part.mix = part.mix.map(normaliseEntry); if (part.roman === undefined) part.roman = ROMAN[k]; });
  $("pattern-select").value = i;
  $("pattern-name").value = p.builtin ? "" : p.name;
  if (p.header) for (const [k, id] of HEADER_FIELDS) if (p.header[k] && !$(id).value) setField(id, p.header[k]);
  if (p.weights && state.subject) renderWeights(p.weights);
  renderPatternEditor();
}

// ----- pattern editor -----
const KIND_OPTIONS = [...Object.entries(QUESTION_TYPES).filter(([k]) => k !== "map"), ["map", "Map – mark places"], ["group", "Combined question (parts a, b…)"]];
const typeOptions = (sel, withSpecial) =>
  (withSpecial ? KIND_OPTIONS : Object.entries(QUESTION_TYPES).filter(([k]) => k !== "map"))
    .map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${v}</option>`).join("");
const fromOptions = (sel) => [["any", hasSections() ? "any (ratio)" : "any"], ...(hasSections() ? state.subject.sections.map((s) => [s.id, s.name]) : [])]
  .map(([k, v]) => `<option value="${k}" ${k === (sel || "any") ? "selected" : ""}>${v}</option>`).join("");

// Either/Or: choose what kind of question option (b) is. "same" = same kind as (a).
const newEntry = (v, n, from) => (v === "map" ? { kind: "map", n, places: 5, from: hasSections() ? "geography" : "any", mapName: "Outline Map of India" }
  : v === "group" ? { kind: "group", n, from: "any", subs: [{ type: "distinguish", k: 2, from: "any" }, { type: "reason", k: 1, from: "any" }] }
  : { kind: "single", type: v, n, from: from || "any" });
function orBEditor(pi, ei, e) {
  const b = e.orB;
  const sel = !b ? "same" : b.kind === "single" ? b.type : b.kind;
  const at = `data-p="${pi}" data-e="${ei}" data-b="1"`;
  let extra = "";
  if (b?.kind === "map") extra = `<input type="number" min="1" ${at} data-f="places" value="${b.places || 5}"> places on
      <input type="text" ${at} data-f="mapName" value="${esc(b.mapName || "")}" placeholder="World Map" style="width:11rem">`;
  const subs = b?.kind === "group" ? `<div class="subs">${(b.subs || []).map((s, si) => `
      <div class="entry"><span class="badge">${"abcdefgh"[si]})</span>
        <input type="number" min="1" ${at} data-s="${si}" data-f="k" value="${s.k}"> ×
        <select ${at} data-s="${si}" data-f="type">${typeOptions(s.type, false)}</select>
        from <select ${at} data-s="${si}" data-f="from">${fromOptions(s.from)}</select>
        <button class="btn tiny ghost" data-act="bsub-del" data-p="${pi}" data-e="${ei}" data-s="${si}">✕</button></div>`).join("")}
      <button class="btn tiny" data-act="bsub-add" data-p="${pi}" data-e="${ei}">+ part</button></div>` : "";
  return `<div class="entry orb" style="margin-left:2rem"><span class="badge">(or b)</span>
      <select ${at} data-f="kind"><option value="same" ${sel === "same" ? "selected" : ""}>Same as (a)</option>${typeOptions(sel, true)}</select>
      ${b && b.kind !== "group" ? `from <select ${at} data-f="from">${fromOptions(b.from)}</select>` : ""}
      ${extra}</div>${subs}`;
}
function renderPatternEditor() {
  let qn = 0;
  $("pattern-parts").innerHTML = state.pattern.parts.map((p, pi) => {
    const entries = p.mix.map((e, ei) => {
      const first = qn + 1; qn += Number(e.n) || 0;
      const qlabel = e.n > 1 ? `Q ${first}–${qn}` : `Q ${first}`;
      const sel = e.kind === "single" ? e.type : e.kind;
      let extra = "";
      if (e.kind === "map") extra = `<input type="number" min="1" data-p="${pi}" data-e="${ei}" data-f="places" value="${e.places || 5}"> places on
        <input type="text" data-p="${pi}" data-e="${ei}" data-f="mapName" value="${esc(e.mapName || "")}" placeholder="World Map" style="width:11rem">`;
      const subs = e.kind === "group" ? `<div class="subs">${(e.subs || []).map((s, si) => `
          <div class="entry"><span class="badge">${"abcdefgh"[si]})</span>
            <input type="number" min="1" data-p="${pi}" data-e="${ei}" data-s="${si}" data-f="k" value="${s.k}"> ×
            <select data-p="${pi}" data-e="${ei}" data-s="${si}" data-f="type">${typeOptions(s.type, false)}</select>
            from <select data-p="${pi}" data-e="${ei}" data-s="${si}" data-f="from">${fromOptions(s.from)}</select>
            <button class="btn tiny ghost" data-act="sub-del" data-p="${pi}" data-e="${ei}" data-s="${si}">✕</button></div>`).join("")}
          <button class="btn tiny" data-act="sub-add" data-p="${pi}" data-e="${ei}">+ part</button></div>` : "";
      const bRow = p.eitherOr ? orBEditor(pi, ei, e) : "";
      return `<div class="entry"><span class="qno">${qlabel}</span>
          <input type="number" min="0" data-p="${pi}" data-e="${ei}" data-f="n" value="${e.n}"> ×
          <select data-p="${pi}" data-e="${ei}" data-f="kind">${typeOptions(sel, true)}</select>
          ${e.kind === "group" ? "" : `from <select data-p="${pi}" data-e="${ei}" data-f="from">${fromOptions(e.from)}</select>`}
          ${extra}
          <button class="btn tiny ghost" data-act="entry-del" data-p="${pi}" data-e="${ei}" title="Remove">✕</button></div>${subs}${bRow}`;
    }).join("");
    return `<div class="pcard">
      <div class="prow">
        <input type="text" data-p="${pi}" data-f="title" value="${esc(p.title || "")}" placeholder="(Part – I)" style="width:6.5rem">
        <input type="text" data-p="${pi}" data-f="roman" value="${esc(p.roman || "")}" style="width:3rem" title="Roman number">
        <input type="text" class="wide" data-p="${pi}" data-f="instr" value="${esc(p.instr || "")}" placeholder="Instruction">
        <label>Marks each <input type="number" min="1" data-p="${pi}" data-f="marks" value="${p.marks}"></label>
        <label>Answer any <input type="number" min="1" data-p="${pi}" data-f="answerAny" value="${p.answerAny ?? ""}" placeholder="all"></label>
        <label><input type="checkbox" data-p="${pi}" data-f="eitherOr" ${p.eitherOr ? "checked" : ""}> Either/Or</label>
        <label><input type="checkbox" data-p="${pi}" data-f="compulsory" ${p.compulsory ? "checked" : ""}> Last Q compulsory</label>
        <span class="muted small">= ${partCount(p)} Qs, ${(Number(p.answerAny) || partCount(p)) * p.marks} marks</span>
        <button class="btn tiny ghost" data-act="part-del" data-p="${pi}" title="Remove part">✕ part</button>
      </div>
      <div class="mix">${entries}<button class="btn tiny" data-act="entry-add" data-p="${pi}">+ question kind</button></div>
    </div>`;
  }).join("");
  $("pattern-total").textContent = `Total: ${patternTotal(state.pattern)} marks`;
}

function onPatternField(e, isChange) {
  const d = e.target.dataset;
  if (d.p === undefined || !d.f) return;
  const part = state.pattern.parts[+d.p];
  const v = e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value;
  if (d.e === undefined) part[d.f] = v;
  else if (d.b) {
    const en = part.mix[+d.e];
    if (d.f === "kind") {
      if (v === "same") delete en.orB;
      else en.orB = normaliseB(newEntry(v, en.n || 1, en.orB?.from || en.from), en);
    } else if (d.s !== undefined) en.orB.subs[+d.s][d.f] = v;
    else en.orB[d.f] = v;
  }
  else if (d.s !== undefined) part.mix[+d.e].subs[+d.s][d.f] = v;
  else {
    const en = part.mix[+d.e];
    if (d.f === "kind") {
      const n = en.n || 1;
      part.mix[+d.e] = { ...newEntry(v, n, en.from), ...(en.orB ? { orB: en.orB } : {}) };
    } else en[d.f] = v;
  }
  if (isChange && e.target.type !== "text") renderPatternEditor();
  else $("pattern-total").textContent = `Total: ${patternTotal(state.pattern)} marks`;
}

function onPatternClick(e) {
  const d = e.target.dataset;
  if (!d.act) return;
  const part = state.pattern.parts[+d.p];
  if (d.act === "part-del") state.pattern.parts.splice(+d.p, 1);
  if (d.act === "entry-add") part.mix.push({ kind: "single", type: "short", n: 1, from: "any" });
  if (d.act === "entry-del") part.mix.splice(+d.e, 1);
  if (d.act === "sub-add") part.mix[+d.e].subs.push({ type: "reason", k: 1, from: "any" });
  if (d.act === "sub-del") part.mix[+d.e].subs.splice(+d.s, 1);
  if (d.act === "bsub-add") part.mix[+d.e].orB.subs.push({ type: "reason", k: 1, from: "any" });
  if (d.act === "bsub-del") part.mix[+d.e].orB.subs.splice(+d.s, 1);
  renderPatternEditor();
}

// ================= 5. generate =================
const headerFromInputs = () => Object.fromEntries(HEADER_FIELDS.map(([k, id]) => [k, $(id).value]));

function wireGenerate() {
  HEADER_FIELDS.forEach(([, id]) => {
    $(id).value = localStorage.getItem(`qpg.${id}`) || "";
    $(id).addEventListener("input", () => localStorage.setItem(`qpg.${id}`, $(id).value));
  });
  $("generate").onclick = () => generate($("h-seed").value.trim() || randomSeed());
}

const randomSeed = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function generate(seed) {
  $("warnings").innerHTML = "";
  if (!state.bank.length) return warn(["The question bank for this subject is empty – see the message in step 3."]);
  if (!state.units.size) return warn(["Select at least one unit."]);
  if (!state.pattern.parts.length) return warn(["The pattern has no parts."]);
  state.seed = seed;
  const { parts, warnings } = generatePaper(state.bank, state.pattern, [...state.units], seed, state.weights);
  state.paper = { parts: JSON.parse(JSON.stringify(parts)) };
  state.header = { ...headerFromInputs(), subject: state.subject.name, marks: "" };
  if (!state.header.cls) state.header.cls = state.cls;
  state.edited = false;
  warn(warnings);
  prepareDoc(state.paper, state.header);
  show("preview");               // must be visible before the pages are measured
  drawPaper();
  $("preview").scrollIntoView({ behavior: "smooth" });
}

// ================= preview: edit, swap, download =================
function wirePreview() {
  $("reshuffle").onclick = () => {
    if (state.edited && !confirm("Shuffle again makes a new paper and your edits will be lost. Continue?")) return;
    generate(randomSeed());
  };
  const paper = $("paper");
  paper.addEventListener("input", (e) => {
    const el = e.target.closest("[data-path]");
    if (!el) return;
    applyEdit(state.paper, state.header, el.dataset.path, el.textContent);
    // keep repeated headers (one per page/column) in step
    paper.querySelectorAll(`[data-path="${el.dataset.path}"]`).forEach((o) => { if (o !== el) o.textContent = el.textContent; });
    state.edited = true;
    state.dirty = true;
  });
  // after typing, lay the pages out again (text may have grown or shrunk)
  paper.addEventListener("focusout", () => { if (state.dirty) { state.dirty = false; setTimeout(drawPaper, 0); } });
  paper.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.closest("[data-path]")) { e.preventDefault(); e.target.blur(); }
  });
  paper.addEventListener("paste", (e) => {
    if (!e.target.closest("[data-path]")) return;
    e.preventDefault();
    document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain"));
  });
  paper.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const [pi, ii, ai] = [+b.dataset.p, +b.dataset.i, +b.dataset.a];
    const act = b.dataset.act;
    if (act === "swap") {
      if (!swapAlt(state.bank, state.paper, pi, ii, ai, [...state.units], state.weights)) alert("No other unused question of this kind is available. You can type over the question to change it.");
    } else if (act === "del") {
      if (!confirm("Remove this question from the paper?")) return;
      state.paper.parts[pi].items.splice(ii, 1);
    } else if (act === "up" || act === "down") {
      moveQuestion(state.paper, pi, ii, act === "up" ? -1 : 1);
    } else if (act === "add") {
      addOwnQuestion(state.paper, pi);
    }
    prepareDoc(state.paper, state.header);
    state.edited = true;
    drawPaper();
  });
  $("dl-docx").onclick = downloadDocx;
  $("dl-pdf").onclick = downloadPdf;
  // web fonts can arrive after the first layout – lay out again when they are ready
  document.fonts?.ready.then(() => state.paper && drawPaper());
}

function fileName(ext) {
  const base = `${state.header.subject} ${state.header.exam || "Question Paper"} ${state.header.cls || ""}`.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_");
  return `${base}.${ext}`;
}

async function downloadDocx() {
  const btn = $("dl-docx");
  btn.disabled = true; btn.textContent = "Preparing…";
  try {
    if (!window.docx) await loadScript(DOCX_LIB);
    drawPaper();
    const doc = buildDocx(window.docx, state.paper, state.header, state.layout, state.pages);
    const blob = await window.docx.Packer.toBlob(doc);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName("docx");
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (err) {
    alert("Could not make the Word file: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = "⬇️ Download Word (.docx)";
  }
}

function downloadPdf() {
  // The browser's print window makes the PDF (keeps Tamil text perfect). Choose "Save as PDF" there.
  const old = document.title;
  document.title = fileName("pdf").replace(/\.pdf$/, "");
  document.activeElement?.blur();
  window.print();
  setTimeout(() => (document.title = old), 1000);
}

function drawPaper() {
  if (!state.paper) return;
  const el = $("paper");
  applyLayoutToPage(state.layout, el);
  state.pages = paginate(el, state.paper, state.header, state.layout);
  $("seed-info").textContent = `Set code: ${state.seed} · ${state.pages.plan.length} page${state.pages.plan.length > 1 ? "s" : ""}`;
  let t = "";
  if (hasSections()) {
    const tally = sectionTally(state.paper);
    const secs = state.subject.sections;
    t = "Questions by section: " + secs.map((s) => `${s.name} ${tally[s.id] || 0}`).join(" · ") +
      `   (weightage asked: ${secs.map((s) => state.weights[s.id] ?? 0).join(" : ")})`;
  }
  if (state.pages.overflow) t += "  ⚠️ A question is taller than a whole page – make the font smaller or the margins narrower.";
  $("tally").textContent = t;
}

// ================= page & text settings =================
function wireSettings() {
  $("set-paper").innerHTML = Object.entries(PAPER_SIZES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  $("set-font").innerHTML = FONTS.map((f) => `<option value="${f}" style="font-family:'${f}'">${f}</option>`).join("");
  $("toggle-settings").onclick = () => $("settings").classList.toggle("hidden");
  $("layout-reset").onclick = () => { state.layout = { ...DEFAULT_LAYOUT }; afterLayoutChange(); };
  const box = $("settings");
  let timer = null;
  const onField = (e) => {
    const k = e.target.dataset.set;
    if (!k) return;
    const t = e.target;
    let v = t.type === "checkbox" ? t.checked : t.value;
    if (t.type === "number" || k === "lineSpacing") v = v === "" ? DEFAULT_LAYOUT[k] : Number(v);
    state.layout[k] = v;
    clearTimeout(timer);                       // typing in a text box: wait a moment before re-drawing
    timer = setTimeout(() => afterLayoutChange(false), t.type === "text" ? 300 : 0);
  };
  box.addEventListener("input", onField);
  box.addEventListener("change", onField);
  box.addEventListener("click", (e) => {
    const f = e.target.closest("[data-footer]");
    if (f) { state.layout.footerText = f.dataset.footer; afterLayoutChange(); return; }
    const b = e.target.closest(".seg button");
    if (!b) return;
    const k = b.parentElement.dataset.seg;
    state.layout[k] = k === "columns" ? Number(b.dataset.v) : b.dataset.v;
    afterLayoutChange();
  });
  fillSettings();
  applyLayoutToPage(state.layout, $("paper"));
}

function fillSettings() {
  document.querySelectorAll("#settings [data-set]").forEach((el) => {
    const v = state.layout[el.dataset.set];
    if (el.type === "checkbox") el.checked = !!v; else el.value = v ?? "";
  });
  document.querySelectorAll("#settings .seg").forEach((seg) =>
    seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", String(state.layout[seg.dataset.seg]) === b.dataset.v)));
}

function afterLayoutChange(refill = true) {
  saveLayout(state.layout);
  if (refill) fillSettings();
  if (state.paper) drawPaper(); else applyLayoutToPage(state.layout, $("paper"));
}

const warn = (list) => { $("warnings").innerHTML = list.map((w) => `<div class="warn">⚠️ ${esc(w)}</div>`).join(""); };
const markActive = (id, attr, v) => document.querySelectorAll(`#${id} .chip`).forEach((c) => c.classList.toggle("active", c.dataset[attr] === v));

init();
