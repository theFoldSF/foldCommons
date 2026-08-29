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
import { ENGINES, defaultParams, engineById } from "./engines/index";
import { FRAMES } from "./frames/index";
import { MARKS, loadMarks } from "./marks/index";
import { PHOTOS, loadPhotos, readUpload } from "./photos/index";
import { TEMPLATES } from "./templates/index";
import { renderDoc } from "./render";
import {
  BG_FADE,
  LAYOUTS,
  SIG_PARAMS,
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
  type Doc,
} from "./state";
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

  if (docTemplate(doc).composed) {
    leftPanel.appendChild(h(`<h3 class="panel-title">Ground</h3>`));
    const chips = h(`<div class="chips"></div>`);
    GROUNDS.forEach((g, i) => {
      const c = h(
        `<button class="chip ${doc.ground === i ? "active" : ""}" style="background:${g.hex}" title="${g.label}"></button>`
      );
      c.onclick = () => {
        doc.ground = i;
        doc.register = g.register;
        buildAll();
      };
      chips.appendChild(c);
    });
    leftPanel.appendChild(chips);
    leftPanel.appendChild(
      h(`<div class="note">Any canon color can carry the whole piece — the ink adjusts itself.</div>`)
    );
  } else {
    leftPanel.appendChild(h(`<h3 class="panel-title">Register</h3>`));
    const seg = h(`<div class="seg"></div>`);
    (Object.keys(REGISTERS) as RegisterKey[]).forEach((k) => {
      const b = h(`<button class="${doc.register === k ? "active" : ""}">${REGISTERS[k].label}</button>`);
      b.onclick = () => {
        doc.register = k;
        buildAll();
      };
      seg.appendChild(b);
    });
    leftPanel.appendChild(seg);
  }

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

  leftPanel.appendChild(
    h(`<div class="note">Everything here draws from the canon — palettes, faces, and motifs
      from the brand brief. Compose freely; it can't go off-brand.</div>`)
  );
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
  const fields: { id: string; label: string; chip?: 0 | 1 }[] = [
    { id: "title", label: "Title" },
    { id: "detail", label: "Details (optional)" },
    { id: "date", label: "Date chip", chip: 0 },
    { id: "time", label: "Time chip", chip: 1 },
  ];
  for (const fdef of fields) {
    const f = h(`<div class="field"><label>${fdef.label}</label></div>`);
    const input = h(
      `<input type="text" value="${(doc.fields[fdef.id] ?? "").replaceAll('"', "&quot;")}">`
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
  const seg = h(`<div class="seg">
    <button class="${d.dir === "lr" ? "active" : ""}">Left → right</button>
    <button class="${d.dir === "tb" ? "active" : ""}">Top ↓ bottom</button></div>`);
  const [lr, tb] = seg.querySelectorAll("button");
  lr.onclick = () => { d.dir = "lr"; buildRight(); renderCanvas(); };
  tb.onclick = () => { d.dir = "tb"; buildRight(); renderCanvas(); };
  into.appendChild(seg);
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
  saveB.onclick = () => {
    const name = prompt("Name this piece:", doc.name ?? "");
    if (name === null) return;
    doc.name = name || "Untitled";
    saveToGallery(doc, doc.name);
    saveB.textContent = "Saved ✓";
    setTimeout(() => (saveB.textContent = "Save to gallery"), 1400);
  };
  const shareB = h(`<button class="act ghost">Copy share link</button>`);
  shareB.onclick = async () => {
    const url = `${location.origin}${location.pathname}#d=${encodeDoc(doc)}`;
    await navigator.clipboard.writeText(url);
    shareB.textContent = "Link copied ✓";
    setTimeout(() => (shareB.textContent = "Copy share link"), 1400);
  };
  into.append(svgB, pngB, saveB, shareB);
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
        <div class="n">${item.name}</div><div class="d">${item.date}</div>
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

// The marks and the photo library load async from public/ — refresh whatever
// is on screen once each lands.
const refresh = () => {
  sanitize(doc);
  buildAll();
  if ($("#canonView").classList.contains("active")) buildCanon();
  if ($("#galleryView").classList.contains("active")) buildGallery();
};
loadMarks(refresh);
loadPhotos(refresh);
