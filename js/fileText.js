// Extract plain text (with line breaks) from an uploaded PDF / DOCX / TXT, in the browser.

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
const MAMMOTH = "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js";

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("Could not load " + src + " (check internet)"));
    document.head.appendChild(s);
  });
}

async function pdfText(buf) {
  const pdfjs = await import(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const { items } = await (await doc.getPage(p)).getTextContent();
    const rows = new Map();
    for (const it of items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: it.transform[4], s: it.str });
    }
    [...rows.entries()].sort((a, b) => b[0] - a[0])
      .forEach(([, r]) => out.push(r.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ")));
  }
  return out.join("\n");
}

async function docxText(buf) {
  if (!window.mammoth) await loadScript(MAMMOTH);
  const { value: html } = await window.mammoth.convertToHtml({ arrayBuffer: buf });
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|h\d|li|tr|div)>/gi, "\n").replace(/<\/t[dh]>/gi, "  ");
  const div = document.createElement("div");
  div.innerHTML = withBreaks;
  return div.textContent;
}

export async function extractText(file) {
  const buf = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return pdfText(buf);
  if (name.endsWith(".docx")) return docxText(buf);
  if (name.endsWith(".txt")) return new TextDecoder().decode(buf);
  throw new Error("Please upload a PDF, DOCX or TXT file (old .doc: open in Word and Save As .docx).");
}
