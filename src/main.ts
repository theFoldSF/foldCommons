// main.ts — Fold Commons app shell: canvas + guarded panels + gallery + canon.

import "./styles.css";
import {
  AVOID,
  BRAND_SENTENCE,
  CANON_COLORS,
  GROUNDS,
  LINE_MOTIF,
  OPEN_QUESTIONS,
  REGISTERS,
  SEASONS,
  TYPE_RULES,
  FACES,
  type RegisterKey,
} from "./brand/tokens";
import { loadFonts } from "./brand/fonts";
import { ENGINES, SIGNATURE_ENGINE, defaultParams, engineById } from "./engines/index";
import { loadCutouts } from "./cutouts/index";
import { FRAMES } from "./frames/index";
import { MARKS, loadMarks } from "./marks/index";
import { PHOTOS, loadPhotos, readUpload } from "./photos/index";
import { TEMPLATES } from "./templates/index";
import { renderDoc } from "./render";
import {
  ARRANGEMENTS,
  BG_FADE,
  LAYOUTS,
  SIG_PARAMS,
  XF_KEYS,
  decodeDoc,
  docGround,
  docTemplate,
  encodeDoc,
  loadGallery,
  newDoc,
  removeFromGallery,
  sanitize,
  saveToGallery,
  shuffleComp,
  type ChipStyle,
  type Doc,
  type WordsLayout,
  type XfKey,
  type XfState,
} from "./state";

// Friendly labels for ARRANGEMENTS, same order/length as state.ts's list.
const ARRANGE_LABELS = ["Centered", "↖ / ↘", "↗ / ↙", "↙ / ↗", "↘ / ↖", "Overlap ↖", "Overlap ↘", "Off-center"];
if (ARRANGE_LABELS.length !== ARRANGEMENTS.length) throw new Error("ARRANGE_LABELS out of sync with ARRANGEMENTS");
import { exportPng, exportSvg } from "./export";

loadFonts();

// --- state -------------------------------------------------------------------

let doc: Doc = (() => {
  const fromHash = location.hash.startsWith("#d=") ? decodeDoc(location.hash.slice(3)) : null;
  return fromHash ?? newDoc("flyer-digital");
})();

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const canvasWrap = $("#canvasWrap");
const leftPanel = $("#leftPanel");
const rightPanel = $("#rightPanel");

function renderCanvas() {
  canvasWrap.innerHTML = renderDoc(doc);
  attachXfInteractivity();
}

function h(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

// Color chips constrained to the active register's accents (+ ink option).
function accentChips(
  current: number | undefined,
  opts: { allowInk?: boolean },
  onPick: (idx: number) => void
): HTMLElement {
  const reg = REGISTERS[doc.register];
  const wrap = h(`<div class="chips"></div>`);
  if (opts.allowInk) {
    const c = h(
      `<button class="chip ink-chip ${current === undefined || current < 0 ? "active" : ""}"
        style="background:${reg.ink}" title="Ink"></button>`
    );
    c.onclick = () => onPick(-1);
    wrap.appendChild(c);
  }
  reg.accents.forEach((hex, i) => {
    const c = h(
      `<button class="chip ${current === i ? "active" : ""}" style="background:${hex}" title="${hex}"></button>`
    );
    c.onclick = () => onPick(i);
    wrap.appendChild(c);
  });
  return wrap;
}

// --- left panel: template, register, season ---------------------------------

function buildLeft() {
  leftPanel.innerHTML = "";
  leftPanel.appendChild(h(`<h3 class="panel-title">Template</h3>`));
  for (const t of TEMPLATES) {
    const card = h(
      `<button class="tpl-card ${t.id === doc.template ? "active" : ""}">
        <div class="t">${t.label}</div><div class="b">${t.blurb}</div>
      </button>`
    );
    card.onclick = () => {
      const prev = doc;
      doc = newDoc(t.id);
      // The design travels with you across sizes: words, ground, frame, photo,
      // motif all carry over — only the geometry changes.
      for (const z of docTemplate(doc).zones)
        if (prev.fields[z.id]) doc.fields[z.id] = prev.fields[z.id];
      if (docTemplate(doc).composed) {
        doc.comp = JSON.parse(JSON.stringify(prev.comp));
        doc.ground = prev.ground;
        doc.register = docGround(doc).register;
        if (prev.motif && doc.motif) doc.motif = JSON.parse(JSON.stringify(prev.motif));
      }
      buildAll();
    };
    leftPanel.appendChild(card);
  }

  leftPanel.appendChild(h(`<h3 class="panel-title">Ground</h3>`));
  const gchips = h(`<div class="chips"></div>`);
  GROUNDS.forEach((g, i) => {
    const c = h(
      `<button class="chip ${doc.ground === i ? "active" : ""}" style="background:${g.hex}" title="${g.label}"></button>`
    );
    c.onclick = () => {
      doc.ground = i;
      doc.register = g.register;
      buildAll();
    };
    gchips.appendChild(c);
  });
  leftPanel.appendChild(gchips);

  if (!docTemplate(doc).composed) {
    leftPanel.appendChild(h(`<h3 class="panel-title">Season</h3>`));
    const chips = h(`<div class="chips"></div>`);
    for (const s of SEASONS) {
      const c = h(
        `<button class="chip ${doc.season === s.key ? "active" : ""}" style="background:${s.accent}" title="${s.label}"></button>`
      );
      c.onclick = () => {
        doc.season = s.key;
        buildLeft();
        renderCanvas();
      };
      chips.appendChild(c);
    }
    leftPanel.appendChild(chips);
    leftPanel.appendChild(
      h(`<div class="note">The Line stays constant; its color marks the season.</div>`)
    );
  }
}

// --- right panel: contextual controls ---------------------------------------

// --- composed-template panels ------------------------------------------------

function compControls(into: HTMLElement) {
  const t = docTemplate(doc);
  if (!t.composed) return;
  into.appendChild(h(`<h3 class="panel-title">Composition</h3>`));

  const shuffle = h(`<button class="act" style="margin-bottom:10px">🎲 Shuffle composition</button>`);
  shuffle.onclick = () => {
    shuffleComp(doc);
    buildAll();
  };
  into.appendChild(shuffle);

  const cards = h(`<div class="layout-grid"></div>`);
  for (const l of LAYOUTS) {
    const b = h(
      `<button class="tpl-card ${doc.comp.layout === l.key ? "active" : ""}">
        <div class="t">${l.label}</div><div class="b">${l.blurb}</div></button>`
    );
    b.onclick = () => {
      doc.comp.layout = l.key;
      buildRight();
      renderCanvas();
    };
    cards.appendChild(b);
  }
  into.appendChild(cards);

  const frameRow = h(`<div class="field"><label>Frame shape</label></div>`);
  const seg = h(`<div class="seg wrap"></div>`);
  for (const f of FRAMES) {
    const b = h(`<button class="${doc.comp.frame === f.id ? "active" : ""}">${f.label}</button>`);
    b.onclick = () => {
      doc.comp.frame = f.id;
      buildRight();
      renderCanvas();
    };
    seg.appendChild(b);
  }
  frameRow.appendChild(seg);
  const reroll = h(`<button class="mini" style="margin-top:6px">↻ Reroll frame</button>`);
  reroll.onclick = () => {
    doc.comp.frameSeed = Math.floor(Math.random() * 100000);
    renderCanvas();
  };
  frameRow.appendChild(reroll);
  into.appendChild(frameRow);

  if (doc.comp.layout === "panel") {
    const f = h(`<div class="field"><label>Panel color</label></div>`);
    f.appendChild(
      accentChips(doc.comp.panelAccent, {}, (idx) => {
        doc.comp.panelAccent = idx;
        buildRight();
        renderCanvas();
      })
    );
    into.appendChild(f);
  }

  if (doc.comp.layout === "backdrop" || doc.comp.layout === "collage") {
    const f = h(`<div class="field"><label>Arrange</label></div>`);
    const aseg = h(`<div class="seg wrap"></div>`);
    ARRANGE_LABELS.forEach((label, i) => {
      const b = h(`<button class="${doc.comp.arrange === i ? "active" : ""}">${label}</button>`);
      b.onclick = () => {
        doc.comp.arrange = i;
        buildRight();
        renderCanvas();
      };
      aseg.appendChild(b);
    });
    f.appendChild(aseg);
    into.appendChild(f);
  }
}

function photoControls(into: HTMLElement) {
  const t = docTemplate(doc);
  if (!t.composed) return;
  const framed = doc.comp.layout !== "panel" && doc.comp.layout !== "motif";

  if (framed) {
    into.appendChild(h(`<h3 class="panel-title">Photo</h3>`));
    const grid = h(`<div class="photo-grid"></div>`);
    for (const p of PHOTOS) {
      const on = !doc.comp.upload && doc.comp.photo === p.id;
      const cell = h(
        `<button class="photo-cell ${on ? "active" : ""}" title="${p.name}">
          <img src="${p.src}" alt="${p.name}"></button>`
      );
      cell.onclick = () => {
        delete doc.comp.upload;
        doc.comp.photo = p.id;
        buildRight();
        renderCanvas();
      };
      grid.appendChild(cell);
    }
    into.appendChild(grid);

    const row = h(`<div class="row" style="margin:8px 0 14px"></div>`);
    const up = h(`<button class="mini" style="flex:1">⤒ Upload photo${doc.comp.upload ? " ✓" : ""}</button>`);
    const file = h(`<input type="file" accept="image/*" style="display:none">`) as HTMLInputElement;
    up.onclick = () => file.click();
    file.onchange = async () => {
      if (!file.files?.[0]) return;
      const p = await readUpload(file.files[0]);
      doc.comp.upload = p.src;
      buildRight();
      renderCanvas();
    };
    const none = h(`<button class="mini">No photo</button>`);
    none.onclick = () => {
      delete doc.comp.upload;
      doc.comp.photo = "";
      buildRight();
      renderCanvas();
    };
    row.append(up, file, none);
    into.appendChild(row);
    into.appendChild(
      h(`<div class="note">House photos are shot inside the Fold itself — its windows,
        brick, and concrete. Uploads stay in this doc. Either way the frame and
        palette keep it ours.</div>`)
    );
  }

  // Background texture — any house photo can wash the whole ground.
  into.appendChild(h(`<h3 class="panel-title">Background texture</h3>`));
  const bgGrid = h(`<div class="photo-grid"></div>`);
  const noneCell = h(
    `<button class="photo-cell bg-none ${doc.comp.bg === "" ? "active" : ""}" title="None">✕</button>`
  );
  noneCell.onclick = () => {
    doc.comp.bg = "";
    buildRight();
    renderCanvas();
  };
  bgGrid.appendChild(noneCell);
  for (const p of PHOTOS) {
    const cell = h(
      `<button class="photo-cell ${doc.comp.bg === p.id ? "active" : ""}" title="${p.name}">
        <img src="${p.src}" alt="${p.name}"></button>`
    );
    cell.onclick = () => {
      doc.comp.bg = p.id;
      buildRight();
      renderCanvas();
    };
    bgGrid.appendChild(cell);
  }
  into.appendChild(bgGrid);
  if (doc.comp.bg) {
    const f = h(`<div class="field" style="margin-top:8px"><label>Texture strength</label></div>`);
    // slider runs texture-strength-wise; the doc stores the ground veil (its inverse)
    const r = h(
      `<input type="range" min="${BG_FADE.min}" max="${BG_FADE.max}" step="0.01"
        value="${BG_FADE.max + BG_FADE.min - doc.comp.bgFade}">`
    ) as HTMLInputElement;
    r.oninput = () => {
      doc.comp.bgFade = BG_FADE.max + BG_FADE.min - Number(r.value);
      renderCanvas();
    };
    f.appendChild(r);
    into.appendChild(f);
  }
}

// The signature — the F·O·L·D net mark in the corner. Always present, always
// tunable: the net is the logo.
function sigControls(into: HTMLElement) {
  if (!docTemplate(doc).composed) return;
  into.appendChild(h(`<h3 class="panel-title">Signature · F·O·L·D net</h3>`));
  into.appendChild(
    h(`<div class="note">The name held together — a membrane, a web, or ridge lines.
      Every piece carries one; reroll until it feels right.</div>`)
  );
  for (const p of SIG_PARAMS) {
    const f = h(`<div class="field"><label>${p.label}</label></div>`);
    const r = h(
      `<input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${doc.comp.sig.params[p.key]}">`
    ) as HTMLInputElement;
    r.oninput = () => {
      doc.comp.sig.params[p.key] = Number(r.value);
      renderCanvas();
    };
    f.appendChild(r);
    into.appendChild(f);
  }
  const reroll = h(`<button class="mini" style="margin-bottom:14px">↻ Reroll signature</button>`);
  reroll.onclick = () => {
    doc.comp.sig.seed = Math.floor(Math.random() * 100000);
    renderCanvas();
  };
  into.appendChild(reroll);
}

function composedWordControls(into: HTMLElement) {
  const t = docTemplate(doc);
  into.appendChild(h(`<h3 class="panel-title">Words</h3>`));

  const wordsDefs: { key: WordsLayout; label: string }[] = [
    { key: "band", label: "Band" },
    { key: "corners", label: "Corners" },
    { key: "stack", label: "Stack" },
  ];
  const wf = h(`<div class="field"><label>Layout</label></div>`);
  const wseg = h(`<div class="seg"></div>`);
  for (const w of wordsDefs) {
    const b = h(`<button class="${doc.comp.words === w.key ? "active" : ""}">${w.label}</button>`);
    b.onclick = () => {
      doc.comp.words = w.key;
      buildRight();
      renderCanvas();
    };
    wseg.appendChild(b);
  }
  wf.appendChild(wseg);
  into.appendChild(wf);

  const chipDefs: { key: ChipStyle; label: string }[] = [
    { key: "ticket", label: "Ticket" },
    { key: "scallop", label: "Scallop" },
    { key: "line", label: "Line" },
  ];
  const cf = h(`<div class="field"><label>Chip style</label></div>`);
  const cseg = h(`<div class="seg"></div>`);
  for (const cs of chipDefs) {
    const b = h(`<button class="${doc.comp.chipStyle === cs.key ? "active" : ""}">${cs.label}</button>`);
    b.onclick = () => {
      doc.comp.chipStyle = cs.key;
      buildRight();
      renderCanvas();
    };
    cseg.appendChild(b);
  }
  cf.appendChild(cseg);
  into.appendChild(cf);

  const fields: { id: string; label: string; chip?: 0 | 1; multi?: boolean }[] = [
    { id: "title", label: "Title" },
    { id: "prose", label: "Prose (optional — gets its own framed card)", multi: true },
    { id: "date", label: "Date chip", chip: 0 },
    { id: "time", label: "Time chip", chip: 1 },
  ];
  for (const fdef of fields) {
    const f = h(`<div class="field"><label>${fdef.label}</label></div>`);
    const input = h(
      fdef.multi
        ? `<textarea rows="3">${(doc.fields[fdef.id] ?? "").replaceAll("<", "&lt;")}</textarea>`
        : `<input type="text" value="${(doc.fields[fdef.id] ?? "").replaceAll('"', "&quot;")}">`
    ) as HTMLInputElement;
    input.oninput = () => {
      doc.fields[fdef.id] = input.value;
      renderCanvas();
    };
    f.appendChild(input);
    if (fdef.chip !== undefined) {
      f.appendChild(
        accentChips(doc.comp.chipAccents[fdef.chip], {}, (idx) => {
          doc.comp.chipAccents[fdef.chip!] = idx;
          buildRight();
          renderCanvas();
        })
      );
    }
    into.appendChild(f);
  }
}

function fieldControls(into: HTMLElement) {
  const t = docTemplate(doc);
  if (t.composed) return composedWordControls(into);
  if (!t.zones.length) return;
  into.appendChild(h(`<h3 class="panel-title">Words</h3>`));
  for (const z of t.zones) {
    const f = h(`<div class="field"><label>${z.label}</label></div>`);
    const multi = (z.lines ?? 3) > 1 && z.role !== "display";
    const input = h(
      multi
        ? `<textarea rows="2">${doc.fields[z.id] ?? ""}</textarea>`
        : `<input type="text" value="${(doc.fields[z.id] ?? "").replaceAll('"', "&quot;")}">`
    ) as HTMLInputElement;
    input.oninput = () => {
      doc.fields[z.id] = input.value;
      renderCanvas();
    };
    f.appendChild(input);
    if (z.colorable) {
      f.appendChild(
        accentChips(doc.fieldAccents[z.id], { allowInk: true }, (idx) => {
          doc.fieldAccents[z.id] = idx;
          buildRight();
          renderCanvas();
        })
      );
    }
    into.appendChild(f);
  }
}

function motifControls(into: HTMLElement) {
  const t = docTemplate(doc);
  const composedMotif =
    t.composed &&
    (doc.comp.layout === "motif" || doc.comp.layout === "backdrop" || doc.comp.layout === "collage");
  if ((!t.motifSlot && !composedMotif) || !doc.motif) return;
  into.appendChild(h(`<h3 class="panel-title">Motif</h3>`));
  const sel = h(
    `<div class="field"><select>${ENGINES.map(
      (e) => `<option value="${e.id}" ${doc.motif!.engine === e.id ? "selected" : ""}>${e.label}</option>`
    ).join("")}</select></div>`
  );
  (sel.querySelector("select") as HTMLSelectElement).onchange = (ev) => {
    const id = (ev.target as HTMLSelectElement).value;
    const e = engineById(id)!;
    doc.motif = { ...doc.motif!, engine: id, params: defaultParams(e) };
    buildRight();
    renderCanvas();
  };
  into.appendChild(sel);
  const eng = engineById(doc.motif.engine)!;
  into.appendChild(h(`<div class="note">${eng.blurb}</div>`));

  for (const p of eng.params) {
    const f = h(`<div class="field"><label>${p.label}</label></div>`);
    const r = h(
      `<input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${doc.motif.params[p.key]}">`
    ) as HTMLInputElement;
    r.oninput = () => {
      doc.motif!.params[p.key] = Number(r.value);
      renderCanvas();
    };
    f.appendChild(r);
    into.appendChild(f);
  }

  const row = h(`<div class="row" style="margin-bottom:14px"></div>`);
  const reroll = h(`<button class="mini" style="flex:1">↻ Reroll seed</button>`);
  reroll.onclick = () => {
    doc.motif!.seed = Math.floor(Math.random() * 1e6);
    renderCanvas();
  };
  row.appendChild(reroll);
  into.appendChild(row);

  const colorsField = h(`<div class="field"><label>Motif colors</label></div>`);
  doc.motif.accents.forEach((a, slot) => {
    colorsField.appendChild(
      accentChips(a, {}, (idx) => {
        doc.motif!.accents[slot] = idx;
        buildRight();
        renderCanvas();
      })
    );
  });
  into.appendChild(colorsField);
}

function lineControls(into: HTMLElement) {
  const t = docTemplate(doc);
  if (!t.line) return;
  into.appendChild(h(`<h3 class="panel-title">The Line</h3>`));
  const tog = h(
    `<div class="seg" style="margin-bottom:10px">
      <button class="${doc.lineOn ? "active" : ""}">On</button>
      <button class="${!doc.lineOn ? "active" : ""}">Off</button>
    </div>`
  );
  const [on, off] = tog.querySelectorAll("button");
  on.onclick = () => { doc.lineOn = true; buildRight(); renderCanvas(); };
  off.onclick = () => { doc.lineOn = false; buildRight(); renderCanvas(); };
  into.appendChild(tog);
  if (!doc.lineOn) return;
  const sliders: [string, keyof Doc["line"], { min: number; max: number }, number][] = [
    ["Amplitude", "amp", LINE_MOTIF.amplitude, 0.005],
    ["Periods", "periods", LINE_MOTIF.periods, 0.1],
    ["Weight", "sw", LINE_MOTIF.strokeWidth, 0.25],
  ];
  for (const [label, key, range, step] of sliders) {
    const f = h(`<div class="field"><label>${label}</label></div>`);
    const r = h(
      `<input type="range" min="${range.min}" max="${range.max}" step="${step}" value="${doc.line[key]}">`
    ) as HTMLInputElement;
    r.oninput = () => {
      doc.line[key] = Number(r.value);
      renderCanvas();
    };
    f.appendChild(r);
    into.appendChild(f);
  }
}

function diagramControls(into: HTMLElement) {
  if (docTemplate(doc).kind !== "diagram") return;
  const d = doc.diagram;
  into.appendChild(h(`<h3 class="panel-title">Boxes</h3>`));
  d.nodes.forEach((n, i) => {
    const row = h(`<div class="row" style="margin-bottom:8px"></div>`);
    const input = h(`<input type="text" value="${n.label.replaceAll('"', "&quot;")}" style="min-width:0">`) as HTMLInputElement;
    input.style.cssText =
      "flex:1;background:var(--cream);border:1px solid var(--rule);color:var(--ink);padding:7px;border-radius:2px;font-family:Figtree,sans-serif;font-size:13.5px";
    input.oninput = () => { n.label = input.value; renderCanvas(); };
    const tint = h(`<button class="chip" style="background:${REGISTERS[doc.register].accents[n.accent % REGISTERS[doc.register].accents.length]};flex:0 0 auto"></button>`);
    tint.onclick = () => { n.accent = (n.accent + 1) % REGISTERS[doc.register].accents.length; buildRight(); renderCanvas(); };
    const del = h(`<button class="mini">✕</button>`);
    del.onclick = () => {
      d.nodes.splice(i, 1);
      d.edges = d.edges
        .filter(([a, b]) => a !== i && b !== i)
        .map(([a, b]) => [a > i ? a - 1 : a, b > i ? b - 1 : b] as [number, number]);
      buildRight();
      renderCanvas();
    };
    row.append(input, tint, del);
    into.appendChild(row);
  });
  const add = h(`<button class="act ghost">+ Add box</button>`);
  add.onclick = () => {
    d.nodes.push({ label: `Box ${d.nodes.length + 1}`, accent: d.nodes.length });
    if (d.nodes.length > 1) d.edges.push([d.nodes.length - 2, d.nodes.length - 1]);
    buildRight();
    renderCanvas();
  };
  into.appendChild(add);

  into.appendChild(h(`<h3 class="panel-title">Arrows</h3>`));
  const opts = (sel: number) =>
    d.nodes.map((n, i) => `<option value="${i}" ${i === sel ? "selected" : ""}>${i + 1}. ${n.label.slice(0, 14)}</option>`).join("");
  d.edges.forEach((e, i) => {
    const row = h(`<div class="row" style="margin-bottom:8px">
      <select>${opts(e[0])}</select><select>${opts(e[1])}</select></div>`);
    const [fromSel, toSel] = row.querySelectorAll("select");
    (fromSel as HTMLSelectElement).onchange = () => { e[0] = Number((fromSel as HTMLSelectElement).value); renderCanvas(); };
    (toSel as HTMLSelectElement).onchange = () => { e[1] = Number((toSel as HTMLSelectElement).value); renderCanvas(); };
    const del = h(`<button class="mini">✕</button>`);
    del.onclick = () => { d.edges.splice(i, 1); buildRight(); renderCanvas(); };
    row.appendChild(del);
    into.appendChild(row);
  });
  const addE = h(`<button class="act ghost">+ Add arrow</button>`);
  addE.onclick = () => {
    if (d.nodes.length >= 2) d.edges.push([0, d.nodes.length - 1]);
    buildRight();
    renderCanvas();
  };
  into.appendChild(addE);

  into.appendChild(h(`<h3 class="panel-title">Flow</h3>`));
  const seg = h(`<div class="seg wrap">
    <button class="${d.dir === "lr" ? "active" : ""}">Left → right</button>
    <button class="${d.dir === "tb" ? "active" : ""}">Top ↓ bottom</button>
    <button class="${d.dir === "scatter" ? "active" : ""}">Scatter</button></div>`);
  const [lr, tb, scatter] = seg.querySelectorAll("button");
  lr.onclick = () => { d.dir = "lr"; buildRight(); renderCanvas(); };
  tb.onclick = () => { d.dir = "tb"; buildRight(); renderCanvas(); };
  scatter.onclick = () => { d.dir = "scatter"; buildRight(); renderCanvas(); };
  into.appendChild(seg);
  if (d.dir === "scatter") {
    const reroll = h(`<button class="mini" style="margin-top:6px">↻ Reroll scatter</button>`);
    reroll.onclick = () => {
      d.scatterSeed = Math.floor(Math.random() * 100000);
      renderCanvas();
    };
    into.appendChild(reroll);
  }

  into.appendChild(h(`<h3 class="panel-title">Node style</h3>`));
  const nseg = h(`<div class="seg">
    <button class="${d.nodeStyle === "ticket" ? "active" : ""}">Ticket</button>
    <button class="${d.nodeStyle === "scallop" ? "active" : ""}">Scallop</button>
    <button class="${d.nodeStyle === "plain" ? "active" : ""}">Plain</button></div>`);
  const [ticketB, scallopB, plainB] = nseg.querySelectorAll("button");
  ticketB.onclick = () => { d.nodeStyle = "ticket"; buildRight(); renderCanvas(); };
  scallopB.onclick = () => { d.nodeStyle = "scallop"; buildRight(); renderCanvas(); };
  plainB.onclick = () => { d.nodeStyle = "plain"; buildRight(); renderCanvas(); };
  into.appendChild(nseg);
}

function stickerControls(into: HTMLElement) {
  if (docTemplate(doc).kind !== "stickers") return;
  into.appendChild(h(`<h3 class="panel-title">Marks</h3>`));
  for (const m of MARKS) {
    const on = doc.stickers.ids.includes(m.id);
    const row = h(`<div class="row" style="margin-bottom:8px">
      <button class="mini" style="flex:1;text-align:left">${on ? "☑" : "☐"} ${m.name}${m.placeholder ? ` <span class="pill">placeholder</span>` : ""}</button>
    </div>`);
    (row.querySelector("button") as HTMLButtonElement).onclick = () => {
      doc.stickers.ids = on
        ? doc.stickers.ids.filter((id) => id !== m.id)
        : [...doc.stickers.ids, m.id];
      buildRight();
      renderCanvas();
    };
    into.appendChild(row);
  }
  into.appendChild(
    h(`<div class="note">The community marks: Brand Jam sketches (cootie catcher, the
      hand-drawn fold, the TF ligature) and the lockup wireframe meshes. Anyone can
      stamp and tint them — like a certain band's bears.</div>`)
  );
  const f = h(`<div class="field"><label>Tint start</label></div>`);
  f.appendChild(
    accentChips(doc.stickers.accent, {}, (idx) => {
      doc.stickers.accent = idx;
      buildRight();
      renderCanvas();
    })
  );
  into.appendChild(f);
}

function exportControls(into: HTMLElement) {
  into.appendChild(h(`<h3 class="panel-title">Ship it</h3>`));
  const svgB = h(`<button class="act">Export SVG</button>`);
  svgB.onclick = () => exportSvg(doc);
  const pngB = h(`<button class="act ghost">Export PNG</button>`);
  pngB.onclick = () => exportPng(doc);
  const saveB = h(`<button class="act ghost">Save to gallery</button>`);
  saveB.onclick = () => openSaveModal(saveB);
  const shareB = h(`<button class="act ghost">Copy share link</button>`);
  shareB.onclick = async () => {
    const url = `${location.origin}${location.pathname}#d=${encodeDoc(doc)}`;
    await navigator.clipboard.writeText(url);
    shareB.textContent = "Link copied ✓";
    setTimeout(() => (shareB.textContent = "Copy share link"), 1400);
  };
  into.append(svgB, pngB, saveB, shareB);
}

// --- save-to-gallery modal ----------------------------------------------------

const MAKER_KEY = "foldCommons.maker";

function openSaveModal(saveB: HTMLElement) {
  let savedMaker = "";
  try {
    savedMaker = localStorage.getItem(MAKER_KEY) ?? "";
  } catch {
    /* private mode etc — just start blank */
  }
  const pieceName = doc.name ?? doc.fields.title ?? "";
  const overlay = h(`<div class="modal-overlay">
    <div class="modal-card">
      <h3 class="modal-title">Save to gallery</h3>
      <div class="field"><label>Your name</label>
        <input type="text" class="maker-input" value="${savedMaker.replaceAll('"', "&quot;")}" placeholder="Anonymous"></div>
      <div class="field"><label>Piece name</label>
        <input type="text" class="name-input" value="${pieceName.replaceAll('"', "&quot;")}" placeholder="Untitled"></div>
      <div class="modal-actions">
        <button class="act ghost modal-cancel">Cancel</button>
        <button class="act modal-save">Save</button>
      </div>
    </div>
  </div>`);
  document.body.appendChild(overlay);
  const nameInput = overlay.querySelector(".name-input") as HTMLInputElement;
  const makerInput = overlay.querySelector(".maker-input") as HTMLInputElement;
  nameInput.focus();
  nameInput.select();

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
    if (e.key === "Enter") save();
  };
  function close() {
    window.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  function save() {
    const name = nameInput.value.trim() || "Untitled";
    const maker = makerInput.value.trim();
    doc.name = name;
    try {
      localStorage.setItem(MAKER_KEY, maker);
    } catch {
      /* private mode etc — nothing to remember across saves */
    }
    saveToGallery(doc, name, maker);
    close();
    saveB.textContent = "Saved ✓";
    setTimeout(() => (saveB.textContent = "Save to gallery"), 1400);
  }
  window.addEventListener("keydown", onKey);
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) close();
  });
  (overlay.querySelector(".modal-cancel") as HTMLButtonElement).onclick = close;
  (overlay.querySelector(".modal-save") as HTMLButtonElement).onclick = save;
}

// --- transform tool -----------------------------------------------------------
// Photoshop-style free transform directly on the rendered SVG: hover any of
// the composed layout's elements (data-el groups, written by render.ts) for a
// dashed box; drag inside to move, corner squares to scale, the handle above
// the top edge to rotate. Everything lives in the SVG's own coordinate space
// (the composed doc's canvas units), so pointer↔doc mapping is exact via
// getScreenCTM regardless of how the canvas is scaled on screen.

const svgNS = "http://www.w3.org/2000/svg";

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function getXf(key: XfKey): XfState {
  const x = doc.comp.xf?.[key];
  return { dx: x?.dx ?? 0, dy: x?.dy ?? 0, s: x?.s ?? 1, rot: x?.rot ?? 0 };
}

function setXf(key: XfKey, xf: XfState) {
  doc.comp.xf = { ...(doc.comp.xf ?? {}), [key]: xf };
}

function resetXf(key: XfKey) {
  const xf = { ...(doc.comp.xf ?? {}) };
  delete xf[key];
  doc.comp.xf = xf;
  renderCanvas();
}

// Apply an xf to a point given the pivot (cx,cy) — mirrors render.ts's
// translate(cx,cy) rotate(rot) scale(s) translate(-cx,-cy) translate(dx,dy).
function applyXf(p: { x: number; y: number }, cx: number, cy: number, xf: XfState) {
  const rad = (xf.rot * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const lx = (p.x - cx + xf.dx) * xf.s;
  const ly = (p.y - cy + xf.dy) * xf.s;
  return { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos };
}

function xfTransformAttr(cx: number, cy: number, xf: XfState): string {
  return `translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(${xf.rot.toFixed(2)}) scale(${xf.s.toFixed(4)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)}) translate(${xf.dx.toFixed(2)} ${xf.dy.toFixed(2)})`;
}

interface DragState {
  key: XfKey;
  mode: "move" | "scale" | "rotate";
  xf0: XfState;
  cx: number;
  cy: number;
  g: SVGGElement;
  pivotWorld: { x: number; y: number };
  startWorld: { x: number; y: number };
  startCornerDist: number;
  startAngle: number;
  live: XfState;
}

let dragState: DragState | null = null;

function buildHandles(g: SVGGElement, key: XfKey) {
  g.querySelector(".xf-chrome")?.remove();
  let bbox: DOMRect;
  try {
    bbox = g.getBBox();
  } catch {
    return;
  }
  if (!bbox.width || !bbox.height) return;
  const svg = g.ownerSVGElement!;
  const H = Number(svg.getAttribute("height")) || bbox.height;
  const hs = Math.max(7, H * 0.012);
  const chrome = document.createElementNS(svgNS, "g");
  chrome.setAttribute("class", "xf-chrome");

  const rect = document.createElementNS(svgNS, "rect");
  rect.setAttribute("x", String(bbox.x));
  rect.setAttribute("y", String(bbox.y));
  rect.setAttribute("width", String(bbox.width));
  rect.setAttribute("height", String(bbox.height));
  rect.setAttribute("class", "xf-box");
  rect.addEventListener("pointerdown", (e) => startDrag(e, key, g, "move"));
  rect.addEventListener("dblclick", () => resetXf(key));
  chrome.appendChild(rect);

  const corners: [number, number][] = [
    [bbox.x, bbox.y],
    [bbox.x + bbox.width, bbox.y],
    [bbox.x, bbox.y + bbox.height],
    [bbox.x + bbox.width, bbox.y + bbox.height],
  ];
  for (const [hx, hy] of corners) {
    const handle = document.createElementNS(svgNS, "rect");
    handle.setAttribute("x", String(hx - hs / 2));
    handle.setAttribute("y", String(hy - hs / 2));
    handle.setAttribute("width", String(hs));
    handle.setAttribute("height", String(hs));
    handle.setAttribute("class", "xf-handle");
    handle.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      startDrag(e, key, g, "scale");
    });
    chrome.appendChild(handle);
  }

  const topMidX = bbox.x + bbox.width / 2;
  const rotY = bbox.y - hs * 2.4;
  const line = document.createElementNS(svgNS, "line");
  line.setAttribute("x1", String(topMidX));
  line.setAttribute("y1", String(bbox.y));
  line.setAttribute("x2", String(topMidX));
  line.setAttribute("y2", String(rotY));
  line.setAttribute("class", "xf-rotline");
  chrome.appendChild(line);
  const rotHandle = document.createElementNS(svgNS, "circle");
  rotHandle.setAttribute("cx", String(topMidX));
  rotHandle.setAttribute("cy", String(rotY));
  rotHandle.setAttribute("r", String(hs * 0.65));
  rotHandle.setAttribute("class", "xf-handle xf-rotate");
  rotHandle.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    startDrag(e, key, g, "rotate");
  });
  chrome.appendChild(rotHandle);

  const reset = document.createElementNS(svgNS, "text");
  reset.setAttribute("x", String(bbox.x + bbox.width + hs * 0.5));
  reset.setAttribute("y", String(bbox.y - hs * 0.3));
  reset.setAttribute("font-size", String(hs * 1.7));
  reset.setAttribute("class", "xf-reset");
  reset.textContent = "⟲";
  reset.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    resetXf(key);
  });
  chrome.appendChild(reset);

  g.appendChild(chrome);
}

function startDrag(e: PointerEvent, key: XfKey, g: SVGGElement, mode: DragState["mode"]) {
  e.preventDefault();
  e.stopPropagation();
  const svg = g.ownerSVGElement as unknown as SVGSVGElement;
  const bbox = g.getBBox();
  const cx = bbox.x + bbox.width / 2, cy = bbox.y + bbox.height / 2;
  const xf0 = getXf(key);
  const world = svgPoint(svg, e.clientX, e.clientY);
  const pivotWorld = applyXf({ x: cx, y: cy }, cx, cy, xf0);
  let startCornerDist = 1, startAngle = 0;
  if (mode === "scale") {
    const corner = applyXf({ x: bbox.x + bbox.width, y: bbox.y + bbox.height }, cx, cy, xf0);
    startCornerDist = Math.hypot(corner.x - pivotWorld.x, corner.y - pivotWorld.y) || 1;
  }
  if (mode === "rotate") startAngle = Math.atan2(world.y - pivotWorld.y, world.x - pivotWorld.x);
  dragState = { key, mode, xf0, cx, cy, g, pivotWorld, startWorld: world, startCornerDist, startAngle, live: xf0 };
  (e.target as Element).setPointerCapture?.(e.pointerId);
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd, { once: true });
}

function onDragMove(e: PointerEvent) {
  if (!dragState) return;
  const svg = dragState.g.ownerSVGElement as unknown as SVGSVGElement;
  const world = svgPoint(svg, e.clientX, e.clientY);
  const xf: XfState = { ...dragState.xf0 };
  if (dragState.mode === "move") {
    const wdx = world.x - dragState.startWorld.x, wdy = world.y - dragState.startWorld.y;
    const rad = (-dragState.xf0.rot * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const invS = 1 / (dragState.xf0.s || 1);
    const ldx = (wdx * cos - wdy * sin) * invS;
    const ldy = (wdx * sin + wdy * cos) * invS;
    xf.dx = Math.max(-4000, Math.min(4000, dragState.xf0.dx + ldx));
    xf.dy = Math.max(-4000, Math.min(4000, dragState.xf0.dy + ldy));
  } else if (dragState.mode === "scale") {
    const dist = Math.hypot(world.x - dragState.pivotWorld.x, world.y - dragState.pivotWorld.y);
    const ratio = dist / dragState.startCornerDist;
    xf.s = Math.max(0.3, Math.min(3, dragState.xf0.s * ratio));
  } else {
    const ang = Math.atan2(world.y - dragState.pivotWorld.y, world.x - dragState.pivotWorld.x);
    const delta = ((ang - dragState.startAngle) * 180) / Math.PI;
    xf.rot = Math.max(-180, Math.min(180, dragState.xf0.rot + delta));
  }
  dragState.live = xf;
  // the chrome (box + handles) is a child of the g, so it tracks live for free
  dragState.g.setAttribute("transform", xfTransformAttr(dragState.cx, dragState.cy, xf));
}

function onDragEnd() {
  if (!dragState) return;
  const { key, live } = dragState;
  window.removeEventListener("pointermove", onDragMove);
  dragState = null;
  // clicking (or dragging) an element selects it — box + handles now persist
  // until something else is clicked, or Escape
  selected = key;
  setXf(key, live);
  renderCanvas();
}

// --- selection: standard design-tool model on top of hover ------------------
// Hover always shows the dashed box (transient). Clicking an element (or
// dragging it — same gesture, onDragEnd above) selects it: box + handles
// persist across re-renders and mouse-leave until something else is
// selected, empty canvas is clicked, or Escape is pressed. One selection at
// a time.
let selected: XfKey | null = null;

function deselect() {
  if (!selected) return;
  selected = null;
  document.querySelectorAll('#canvasWrap svg .xf-chrome').forEach((c) => c.remove());
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") deselect();
});

// Re-attach hover/drag listeners on every render — innerHTML rebuilds the DOM.
function attachXfInteractivity() {
  if (!docTemplate(doc).composed) return;
  const svgEl = canvasWrap.querySelector("svg");
  if (!svgEl) return;
  // click on empty canvas (no data-el under the pointer) clears the selection
  svgEl.addEventListener("pointerdown", (e) => {
    if (!(e.target as Element).closest("[data-el]")) deselect();
  });
  for (const key of XF_KEYS) {
    const g = svgEl.querySelector(`[data-el="${key}"]`) as SVGGElement | null;
    if (!g) continue;
    g.classList.add("xf-el");
    g.addEventListener("pointerenter", () => buildHandles(g, key));
    g.addEventListener("pointerleave", () => {
      if (dragState?.key === key) return;
      if (selected === key) return;
      g.querySelector(".xf-chrome")?.remove();
    });
    // the selected element's chrome persists across the re-render that just
    // rebuilt this DOM — show it immediately, not just on next hover
    if (selected === key) buildHandles(g, key);
  }
}

function buildRight() {
  rightPanel.innerHTML = "";
  compControls(rightPanel);
  photoControls(rightPanel);
  fieldControls(rightPanel);
  sigControls(rightPanel);
  motifControls(rightPanel);
  lineControls(rightPanel);
  diagramControls(rightPanel);
  stickerControls(rightPanel);
  exportControls(rightPanel);
}

// --- gallery -----------------------------------------------------------------

function buildGallery() {
  const view = $("#galleryView");
  view.innerHTML = "";
  const items = loadGallery();
  if (!items.length) {
    view.appendChild(
      h(`<div class="g-empty">Nothing saved yet. Make something in the studio and
        “Save to gallery” — anything saved here can be remixed by whoever uses this
        browser, and share links carry full remixable compositions to everyone else.</div>`)
    );
    return;
  }
  for (const item of items) {
    // older saves predate the composed-layout doc shape — clamp before render
    const docForRender = sanitize(JSON.parse(JSON.stringify(item.doc)));
    const card = h(`<div class="g-card">
      <div class="thumb">${renderDoc(docForRender)}</div>
      <div class="meta">
        <div class="n">${item.name}</div>
        ${item.maker ? `<div class="mk">by ${item.maker}</div>` : ""}
        <div class="d">${item.date}</div>
        <div class="row"></div>
      </div></div>`);
    const row = card.querySelector(".row")!;
    const remix = h(`<button class="mini">Remix</button>`);
    remix.onclick = () => {
      doc = sanitize(JSON.parse(JSON.stringify(item.doc)));
      switchView("make");
      buildAll();
    };
    const share = h(`<button class="mini">Link</button>`);
    share.onclick = async () => {
      await navigator.clipboard.writeText(
        `${location.origin}${location.pathname}#d=${encodeDoc(item.doc)}`
      );
      share.textContent = "✓";
      setTimeout(() => (share.textContent = "Link"), 1200);
    };
    const del = h(`<button class="mini">✕</button>`);
    del.onclick = () => {
      removeFromGallery(item.id);
      buildGallery();
    };
    row.append(remix, share, del);
    view.appendChild(card);
  }
}

// --- canon (guidelines) ------------------------------------------------------

function buildCanon() {
  const sw = (name: string, hex: string, pct?: number) =>
    `<div class="swatch"><div class="c" style="background:${hex}"></div><div class="l">${name}<br><span class="mono">${hex}${pct ? ` · ${pct}%` : ""}</span></div></div>`;
  $("#canonView").innerHTML = `
  <div class="canon-inner">
    <h1>The Canon</h1>
    <p class="lede">${BRAND_SENTENCE}</p>
    <p>This page is the living draft of The Fold's brand guidelines — the rules this
    tool enforces, distilled from the fold-brand Figma deck. It is honest about what's
    decided and what isn't. The brand belongs to the community the way a song belongs
    to a band: anyone can play it, and it still sounds like us.</p>

    <h2>Color</h2>
    <p>The deck's color system, with its usage percentages: mostly warm paper, one
    tenth ink, and four candy accents used sparingly.</p>
    <div class="swatch-row">${CANON_COLORS.map((s) => sw(s.name, s.hex, s.pct)).join("")}</div>

    <h2>Two registers</h2>
    <p><strong>${REGISTERS.paper.label}.</strong> ${REGISTERS.paper.blurb}</p>
    <div class="swatch-row">${[sw("Ground", REGISTERS.paper.ground), sw("Ink", REGISTERS.paper.ink), ...REGISTERS.paper.accents.map((a) => sw("Accent", a))].join("")}</div>
    <p><strong>${REGISTERS.blueprint.label}.</strong> ${REGISTERS.blueprint.blurb}</p>
    <div class="swatch-row">${[sw("Ground", REGISTERS.blueprint.ground), sw("Ink", REGISTERS.blueprint.ink), ...REGISTERS.blueprint.accents.map((a) => sw("Accent", a))].join("")}</div>

    <h2>The Line</h2>
    <p>${LINE_MOTIF.blurb} Each season tints the Line:</p>
    <div class="swatch-row">${SEASONS.map((s) => sw(s.label, s.accent)).join("")}</div>

    <h2>Typography</h2>
    ${FACES.map(
      (f) =>
        `<p class="face-demo" style="font-family:${f.name === "Fira Code" ? "'Fira Code',monospace" : f.name === "Fraunces" ? "'Fraunces',serif" : `'${f.name}',sans-serif`};font-weight:${f.weight}">${f.name} ${f.weight} — the Fold, a gathering place <span class="pill">${f.role}${f.standInFor ? ` · stand-in for ${f.standInFor}` : ""}</span></p>`
    ).join("")}
    <p>The deck's type system is Denim (semi-bold and regular) with Fira Code for
    numerals, urls, dates, and times, plus a chunky soft display face for the biggest
    headlines. Fira Code is open-licensed and used verbatim; the others ship here as
    OFL stand-ins until licensing is decided. The wordmark is
    “${TYPE_RULES.wordmark.text}” — sentence case, semi-bold.</p>

    <h2>The marks</h2>
    <p>The wireframe fold meshes from the lockups — plus, soon, hand-souled redraws
    of the Brand Jam sketches. All recolorable within the canon.</p>
    <div class="mark-row">${MARKS.map(
      (m) =>
        `<div class="mark-cell"><div class="m"><svg viewBox="${m.viewBox}">${m.svg}</svg></div>
        <div class="l">${m.name}${m.placeholder ? " · placeholder" : ""}</div></div>`
    ).join("")}</div>

    <h2>Never</h2>
    <ul>${AVOID.map((a) => `<li>${a}</li>`).join("")}</ul>

    <h2>Open questions</h2>
    <p>Decisions the brand stewards still own — the tool stays honest about them:</p>
    <ul>${OPEN_QUESTIONS.map((q) => `<li>${q}</li>`).join("")}</ul>
  </div>`;
}

// --- view switching ----------------------------------------------------------

function switchView(name: string) {
  document.querySelectorAll("#nav button").forEach((b) => {
    b.classList.toggle("active", (b as HTMLElement).dataset.view === name);
  });
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $(`#${name}View`).classList.add("active");
  if (name === "gallery") buildGallery();
  if (name === "canon") buildCanon();
}

document.querySelectorAll("#nav button").forEach((b) => {
  (b as HTMLElement).onclick = () => switchView((b as HTMLElement).dataset.view!);
});

function buildAll() {
  buildLeft();
  buildRight();
  renderCanvas();
}

buildAll();

// Header logo: a fresh F·O·L·D net generation every visit — the identity is
// the system, so the site wears a different pull from it each time. Clicking
// it rerolls.
function headerLogo() {
  const wm = document.querySelector("#topbar .wordmark") as HTMLElement | null;
  if (!wm) return;
  const inner = SIGNATURE_ENGINE.render({
    w: 150,
    h: 64,
    p: { tiles: 1, style: 3, scatter: 0.55, size: 2.2, weight: 3 },
    colors: [],
    ink: "#03071B",
    ground: "none",
    seed: Math.floor(Math.random() * 1e6),
  });
  wm.innerHTML = `<svg viewBox="0 0 150 64" role="img" aria-label="the Fold">${inner}</svg>`;
  wm.style.cursor = "pointer";
  wm.title = "Reroll the mark";
  wm.onclick = headerLogo;
}
headerLogo();

// The marks, photos, and sculpture cutouts load async from public/ — refresh
// whatever is on screen once each lands.
const refresh = () => {
  sanitize(doc);
  buildAll();
  if ($("#canonView").classList.contains("active")) buildCanon();
  if ($("#galleryView").classList.contains("active")) buildGallery();
};
loadMarks(refresh);
loadPhotos(refresh);
loadCutouts(refresh);
