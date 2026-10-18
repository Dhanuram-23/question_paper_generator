// Lays the paper out page by page in the browser, exactly as it will print.
// A "sheet" is one printed page. With 2 columns a sheet holds 2 "panels"; every panel is its own
// page with its own header (first only / every) and its own footer.
// The result (which question is on which panel) is also used to build the Word file.

import { headerHtml, blockList, blockHtml } from "./render.js?v=9";
import { footerFor } from "./layout.js?v=9";

const el = (cls, tag = "div") => { const e = document.createElement(tag); e.className = cls; return e; };

export function paginate(root, paper, header, L) {
  const cols = Math.max(1, Number(L.columns) || 1);
  const blocks = blockList(paper);
  const head = headerHtml(header, L);
  const hasFooter = !!String(L.footerText || "").trim();
  root.innerHTML = "";

  const plan = [];
  let sheet = null, inSheet = cols, body = null;

  let slots = [];
  const newPanel = () => {
    if (inSheet >= cols) {
      sheet = el(`sheet cols-${cols}${L.columnLine && cols > 1 ? " divider" : ""}`);
      root.appendChild(sheet);
      // create every column of the page first, so each one already has its final width when it is measured
      slots = Array.from({ length: cols }, () => sheet.appendChild(el("panel empty")));
      inSheet = 0;
    }
    const panel = slots[inSheet++];
    panel.className = "panel";
    const showHead = plan.length === 0 || L.headerOn === "every";
    if (showHead) panel.insertAdjacentHTML("beforeend", head);
    body = el("panel-body");
    panel.appendChild(body);
    if (hasFooter) { const f = el("panel-foot"); f.textContent = "\u00a0"; panel.appendChild(f); }
    plan.push({ header: showHead, blocks: [] });
  };

  newPanel();
  blocks.forEach((b, k) => {
    const html = blockHtml(paper, b, L);
    body.insertAdjacentHTML("beforeend", html);
    if (body.scrollHeight > body.clientHeight + 1 && plan[plan.length - 1].blocks.length) {
      body.lastElementChild.remove();
      newPanel();
      body.insertAdjacentHTML("beforeend", html);
    }
    plan[plan.length - 1].blocks.push(k);
  });


  const total = plan.length;
  root.querySelectorAll(".panel-foot").forEach((f, i) => { f.textContent = footerFor(L, i + 1, total) || "\u00a0"; });
  plan.forEach((p, i) => (p.footer = hasFooter ? footerFor(L, i + 1, total) : ""));
  return { plan, blocks, overflow: [...root.querySelectorAll(".panel-body")].some((b) => b.scrollHeight > b.clientHeight + 1) };
}
