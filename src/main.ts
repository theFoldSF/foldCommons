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
import { FRAMES, PLATE_FRAMES } from "./frames/index";
import { MARKS, loadMarks } from "./marks/index";
import { PHOTOS, loadPhotos, readUpload, submitPhoto } from "./photos/index";
import { TEMPLATES } from "./templates/index";
import { ensureArtLum, renderDoc, sigEngineParams } from "./render";
import { fetchGalleryMerged, saveGalleryItem, removeLocalGalleryItem, type MergedGalleryItem } from "./gallery/index";
import {
  loadSamples,
  addSample,
  removeSample,
  exportSamplesJson,
  pushSample,
  fetchTeamSamples,
  deleteTeamSample,
  type RemoteSigSample,
} from "./tuning/index";
import {
  fetchPendingPhotos,
  approvePhoto,
  denyPhoto,
  fetchFeedback,
  setFeedbackStatus,
  deleteFeedback,
  loadModToken,
  saveModToken,
} from "./moderation/index";
import { submitFeedback, type FeedbackKind } from "./feedback/index";
import {
  ARRANGEMENTS,
  BG_FADE,
  LAYOUTS,
  LOCK_KEYS,
  SIG_PARAMS,
  XF_KEYS,
  decodeDoc,
  defaultSigParams,
  docAccents,
  docGround,
  docTemplate,
  encodeDoc,
  newDoc,
  newTextBoxId,
  sanitize,
  shuffleComp,
  textXfKey,
  type ChipStyle,
  type Doc,
  type LockKey,
  type TextBoxState,
  type WordsLayout,
  type XfKey,
  type XfState,
} from "./state";

// Friendly labels for ARRANGEMENTS, same order/length as state.ts's list.
const ARRANGE_LABELS = ["Centered", "↖ / ↘", "↗ / ↙", "↙ / ↗", "↘ / ↖", "Overlap ↖", "Overlap ↘", "Off-center"];
if (ARRANGE_LABELS.length !== ARRANGEMENTS.length) throw new Error("ARRANGE_LABELS out of sync with ARRANGEMENTS");
// Friendly labels for LOCK_KEYS, same order/length as state.ts's list.
const LOCK_LABELS: Record<LockKey, string> = {
  layout: "Layout",
  frame: "Frame",
  photo: "Photo",
  bg: "Background",
  panelAccent: "Panel color",
  chips: "Chips",
  titlePlate: "Title plate",
  words: "Words",
  arrange: "Arrange",
  groundRegister: "Ground",
  motif: "Motif",
  signature: "Signature",
};
import { exportPng, exportSvg } from "./export";

loadFonts();

// The optional shared backend (Cloudflare Worker) — unset means fully
// local: photo submission, feedback, and the moderation pages have nothing
// to talk to, so their entry points stay hidden/inert.
const FOLD_API: string | undefined = import.meta.env.VITE_FOLD_API;

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
  noteHistory();
  // warm the true-pixel luminance grid for contrast; when it lands (once per
  // art change) re-render so sig/chip inks read the pixels actually beneath
  ensureArtLum(doc, renderCanvas);
}

function h(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

// Color chips constrained to the active register's accents (+ ink option) —
// or a palette-lab override when one is set, so a chip's on-screen color
// always matches what docAccent(doc, i) actually renders at that index.
function accentChips(
  current: number | undefined,
  opts: { allowInk?: boolean },
  onPick: (idx: number) => void
): HTMLElement {
  const reg = REGISTERS[doc.register];
  const accents = docAccents(doc);
  const wrap = h(`<div class="chips"></div>`);
  if (opts.allowInk) {
    const c = h(
      `<button class="chip ink-chip ${current === undefined || current < 0 ? "active" : ""}"
        style="background:${reg.ink}" title="Ink"></button>`
    );
    c.onclick = () => onPick(-1);
    wrap.appendChild(c);
  }
  accents.forEach((hex, i) => {
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
  // same scrollTop-preservation concern as buildRight below — leftPanel is
  // itself the scrolling element.
  const scrollY = leftPanel.scrollTop;
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
  leftPanel.scrollTop = scrollY;
}

// --- right panel: contextual controls ---------------------------------------

// --- composed-template panels ------------------------------------------------

function compControls(into: HTMLElement) {
  const t = docTemplate(doc);
  if (!t.composed) return;

  const shuffle = h(`<button class="act" style="margin-bottom:10px">🎲 Shuffle composition</button>`);
  shuffle.onclick = () => {
    shuffleComp(doc);
    buildAll();
  };
  into.appendChild(shuffle);

  const lockRow = h(`<div class="field"><label>🔒 Lock from shuffle</label></div>`);
  const lockSeg = h(`<div class="seg wrap"></div>`);
  for (const key of LOCK_KEYS) {
    const on = !!doc.comp.locks?.[key];
    const b = h(`<button class="${on ? "active" : ""}">${on ? "🔒" : "🔓"} ${LOCK_LABELS[key]}</button>`);
    b.onclick = () => {
      doc.comp.locks = { ...(doc.comp.locks ?? {}), [key]: !on };
      buildRight();
    };
    lockSeg.appendChild(b);
  }
  lockRow.appendChild(lockSeg);
  into.appendChild(lockRow);

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

// True when the current layout actually shows a framed photo window at all
// (panel/motif layouts don't) — both photo sections key off this.
function hasPhotoWindow(): boolean {
  const t = docTemplate(doc);
  return !!t.composed && doc.comp.layout !== "panel" && doc.comp.layout !== "motif";
}

function photoLibraryControls(into: HTMLElement) {
  if (!hasPhotoWindow()) return;
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
  if (FOLD_API) {
    const submit = h(`<button class="mini">📤 Submit to library</button>`);
    submit.onclick = () => openSubmitPhotoModal();
    row.appendChild(submit);
  }
  into.appendChild(row);
  into.appendChild(
    h(`<div class="note">House photos are shot inside the Fold itself — its windows,
      brick, and concrete. Uploads stay in this doc. Either way the frame and
      palette keep it ours.${
        FOLD_API ? " Got a photo that belongs in the house library? Submit it — the design team reviews before it joins the rest." : ""
      }</div>`)
  );
}

// Palette lab — a temporary, explicitly non-canon tool for dialing accent
// colors while the design team settles on them. Overrides the active
// register's accent list on this doc only; "Reset to canon" removes it.
function paletteLabControls(into: HTMLElement) {
  if (!docTemplate(doc).composed) return;
  into.appendChild(
    h(`<div class="note">Temporary — for dialing in the palette while the team decides.
      Not canon. Colors picked here save with this doc (gallery, share links)
      but don't change the brand.</div>`)
  );
  const swatches = h(`<div class="palette-swatches"></div>`);
  const accents = docAccents(doc);
  accents.forEach((hex, i) => {
    const cell = h(`<div class="palette-swatch">
      <input type="color" value="${hex}">
      <button class="mini rm" title="Remove">✕</button>
    </div>`);
    const input = cell.querySelector("input") as HTMLInputElement;
    input.oninput = () => {
      const next = [...accents];
      next[i] = input.value;
      doc.comp.paletteOverride = { accents: next };
      renderCanvas();
    };
    // Other panels (date/time chip pickers, diagram node tints) render their
    // own swatches from this same list — refresh them once the color is
    // settled, rather than on every drag tick of the native color picker.
    input.onchange = () => buildRight();
    (cell.querySelector(".rm") as HTMLButtonElement).onclick = () => {
      if (accents.length <= 2) return;
      doc.comp.paletteOverride = { accents: accents.filter((_, j) => j !== i) };
      buildRight();
      renderCanvas();
    };
    swatches.appendChild(cell);
  });
  into.appendChild(swatches);

  const row = h(`<div class="row" style="margin-top:10px"></div>`);
  const add = h(`<button class="mini">+ Add color</button>`);
  add.onclick = () => {
    if (accents.length >= 8) return;
    doc.comp.paletteOverride = { accents: [...accents, "#888888"] };
    buildRight();
    renderCanvas();
  };
  const reset = h(`<button class="mini">Reset to canon</button>`);
  reset.onclick = () => {
    delete doc.comp.paletteOverride;
    buildRight();
    renderCanvas();
  };
  row.append(add, reset);
  into.appendChild(row);
}

function bgTextureControls(into: HTMLElement) {
  const t = docTemplate(doc);
  if (!t.composed) return;
  // Background texture — any house photo can wash the whole ground.
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
  into.appendChild(
    h(`<div class="note">The name held together — a membrane, a web, or ridge lines.
      Every piece carries one; reroll until it feels right.</div>`)
  );
  const tog = h(
    `<div class="seg" style="margin-bottom:10px">
      <button class="${doc.comp.sigOn ? "active" : ""}">On</button>
      <button class="${!doc.comp.sigOn ? "active" : ""}">Off</button>
    </div>`
  );
  const [sigOnBtn, sigOffBtn] = tog.querySelectorAll("button");
  sigOnBtn.onclick = () => {
    doc.comp.sigOn = true;
    buildRight();
    renderCanvas();
  };
  sigOffBtn.onclick = () => {
    doc.comp.sigOn = false;
    if (selected === "sig") deselect();
    buildRight();
    renderCanvas();
  };
  into.appendChild(tog);
  if (!doc.comp.sigOn) return;
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

  // the title's contrast plate can take any frame shape — same set as
  // photo/motif/text-box frames (a plate only actually shows over full-bleed
  // art in the "corners"/"stack" words layouts; harmless to set otherwise)
  const tf = h(`<div class="field"><label>Title frame</label></div>`);
  const tfSeg = h(`<div class="seg wrap"></div>`);
  for (const f of PLATE_FRAMES) {
    const b = h(`<button class="${doc.comp.titleFrame === f.id ? "active" : ""}">${f.label}</button>`);
    b.onclick = () => {
      doc.comp.titleFrame = f.id;
      buildRight();
      renderCanvas();
    };
    tfSeg.appendChild(b);
  }
  tf.appendChild(tfSeg);
  const tfReroll = h(`<button class="mini" style="margin-top:6px">↻ Reroll title frame</button>`);
  tfReroll.onclick = () => {
    doc.comp.titleFrameSeed = Math.floor(Math.random() * 100000);
    renderCanvas();
  };
  tf.appendChild(tfReroll);
  into.appendChild(tf);

  const fields: { id: string; label: string; chip?: 0 | 1; multi?: boolean }[] = [
    { id: "title", label: "Title" },
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

// Text boxes — each a member string in its own framed card, sized to its
// wrapped text, selectable/movable/rotatable/resizable like any other element.
function textBoxesControls(into: HTMLElement) {
  const t = docTemplate(doc);
  if (!t.composed) return;
  for (const tb of doc.comp.texts) {
    const card = h(
      `<div class="field" style="border:1px solid var(--rule);border-radius:10px;padding:10px 10px 4px"></div>`
    );
    const ta = h(
      `<textarea rows="3" placeholder="Say something…">${tb.text.replaceAll("<", "&lt;")}</textarea>`
    ) as HTMLTextAreaElement;
    ta.oninput = () => {
      tb.text = ta.value;
      renderCanvas();
    };
    card.appendChild(ta);
    const frameRow = h(`<div class="seg wrap" style="margin-top:8px"></div>`);
    for (const f of PLATE_FRAMES) {
      const b = h(`<button class="${tb.frame === f.id ? "active" : ""}">${f.label}</button>`);
      b.onclick = () => {
        tb.frame = f.id;
        buildRight();
        renderCanvas();
      };
      frameRow.appendChild(b);
    }
    card.appendChild(frameRow);
    const rowBtns = h(`<div class="row" style="margin:8px 0 10px"></div>`);
    const reroll = h(`<button class="mini" style="flex:1">↻ Reroll frame</button>`);
    reroll.onclick = () => {
      tb.frameSeed = Math.floor(Math.random() * 100000);
      renderCanvas();
    };
    const del = h(`<button class="mini">✕ Delete</button>`);
    del.onclick = () => {
      doc.comp.texts = doc.comp.texts.filter((x) => x.id !== tb.id);
      const xf = { ...(doc.comp.xf ?? {}) };
      delete xf[textXfKey(tb.id)];
      doc.comp.xf = xf;
      if (selected === textXfKey(tb.id)) deselect();
      buildRight();
      renderCanvas();
    };
    rowBtns.append(reroll, del);
    card.appendChild(rowBtns);
    into.appendChild(card);
  }
  const add = h(`<button class="act ghost">+ Add text box</button>`);
  add.onclick = () => {
    doc.comp.texts.push({
      id: newTextBoxId(),
      text: "",
      frame: PLATE_FRAMES[0].id,
      frameSeed: Math.floor(Math.random() * 100000),
    });
    buildRight();
    renderCanvas();
  };
  into.appendChild(add);
}

function motifControls(into: HTMLElement) {
  const t = docTemplate(doc);
  const composedMotif =
    t.composed &&
    (doc.comp.layout === "motif" || doc.comp.layout === "backdrop" || doc.comp.layout === "collage");
  if ((!t.motifSlot && !composedMotif) || !doc.motif) return;
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
    const nodeAccents = docAccents(doc);
    const tint = h(`<button class="chip" style="background:${nodeAccents[n.accent % nodeAccents.length]};flex:0 0 auto"></button>`);
    tint.onclick = () => { n.accent = (n.accent + 1) % nodeAccents.length; buildRight(); renderCanvas(); };
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
  async function save() {
    const name = nameInput.value.trim() || "Untitled";
    const maker = makerInput.value.trim();
    doc.name = name;
    try {
      localStorage.setItem(MAKER_KEY, maker);
    } catch {
      /* private mode etc — nothing to remember across saves */
    }
    close();
    saveB.textContent = "Saving…";
    await saveGalleryItem(doc, name, maker);
    saveB.textContent = "Saved ✓";
    setTimeout(() => (saveB.textContent = "Save to gallery"), 1400);
    if ($("#galleryView").classList.contains("active")) buildGallery();
  }
  window.addEventListener("keydown", onKey);
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) close();
  });
  (overlay.querySelector(".modal-cancel") as HTMLButtonElement).onclick = close;
  (overlay.querySelector(".modal-save") as HTMLButtonElement).onclick = save;
}

// --- submit-a-photo modal -----------------------------------------------------
// Public path into the shared house library — separate from a member's own
// doc-only upload. Lands pending design-team review (see #moderate below).

function openSubmitPhotoModal() {
  const overlay = h(`<div class="modal-overlay">
    <div class="modal-card">
      <h3 class="modal-title">Submit a photo</h3>
      <div class="note">Goes to the design team for review before it joins the house library.</div>
      <div class="field"><label>Photo</label>
        <input type="file" accept="image/*" class="submit-file"></div>
      <div class="field"><label>Your name (optional)</label>
        <input type="text" class="submit-name" placeholder="Anonymous"></div>
      <div class="modal-actions">
        <button class="act ghost modal-cancel">Cancel</button>
        <button class="act modal-submit">Submit</button>
      </div>
    </div>
  </div>`);
  document.body.appendChild(overlay);
  const fileInput = overlay.querySelector(".submit-file") as HTMLInputElement;
  const nameInput = overlay.querySelector(".submit-name") as HTMLInputElement;
  const submitBtn = overlay.querySelector(".modal-submit") as HTMLButtonElement;
  function close() {
    overlay.remove();
  }
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) close();
  });
  (overlay.querySelector(".modal-cancel") as HTMLButtonElement).onclick = close;
  submitBtn.onclick = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    submitBtn.textContent = "Submitting…";
    submitBtn.disabled = true;
    const res = await submitPhoto(file, nameInput.value.trim());
    if (res.ok) {
      (overlay.querySelector(".modal-card") as HTMLElement).innerHTML = `
        <h3 class="modal-title">Thanks!</h3>
        <p class="note">The design team will review it before it joins the library.</p>
        <div class="modal-actions"><button class="act modal-close">Close</button></div>`;
      (overlay.querySelector(".modal-close") as HTMLButtonElement).onclick = close;
    } else {
      submitBtn.textContent = "Failed — try again";
      submitBtn.disabled = false;
    }
  };
}

// --- feedback modal ------------------------------------------------------------
// Visible to everyone (topbar button) — a bug report or feature request,
// sent straight to the backend for review at the hidden #feedback page.

function openFeedbackModal() {
  const overlay = h(`<div class="modal-overlay">
    <div class="modal-card">
      <h3 class="modal-title">Send feedback</h3>
      <div class="field"><label>Type</label>
        <div class="seg fb-kind">
          <button type="button" class="active" data-k="bug">Bug</button>
          <button type="button" data-k="feature">Feature</button>
          <button type="button" data-k="other">Other</button>
        </div>
      </div>
      <div class="field"><label>What's up?</label>
        <textarea class="fb-text" rows="4" placeholder="Describe the bug, or the feature you'd like..."></textarea></div>
      <div class="field"><label>Your name (optional)</label>
        <input type="text" class="fb-name" placeholder="Anonymous"></div>
      <div class="modal-actions">
        <button class="act ghost modal-cancel">Cancel</button>
        <button class="act modal-send">Send</button>
      </div>
    </div>
  </div>`);
  document.body.appendChild(overlay);
  let kind: FeedbackKind = "bug";
  overlay.querySelectorAll(".fb-kind button").forEach((b) => {
    (b as HTMLButtonElement).onclick = () => {
      kind = (b as HTMLElement).dataset.k as FeedbackKind;
      overlay.querySelectorAll(".fb-kind button").forEach((x) => x.classList.toggle("active", x === b));
    };
  });
  const textArea = overlay.querySelector(".fb-text") as HTMLTextAreaElement;
  const nameInput = overlay.querySelector(".fb-name") as HTMLInputElement;
  const sendBtn = overlay.querySelector(".modal-send") as HTMLButtonElement;
  function close() {
    overlay.remove();
  }
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) close();
  });
  (overlay.querySelector(".modal-cancel") as HTMLButtonElement).onclick = close;
  textArea.focus();
  sendBtn.onclick = async () => {
    const text = textArea.value.trim();
    if (!text) return;
    sendBtn.textContent = "Sending…";
    sendBtn.disabled = true;
    const res = await submitFeedback(kind, text, nameInput.value.trim());
    if (res.ok) {
      (overlay.querySelector(".modal-card") as HTMLElement).innerHTML = `
        <h3 class="modal-title">Sent — thanks ✓</h3>
        <div class="modal-actions"><button class="act modal-close">Close</button></div>`;
      (overlay.querySelector(".modal-close") as HTMLButtonElement).onclick = close;
    } else {
      sendBtn.textContent = "Failed — try again";
      sendBtn.disabled = false;
    }
  };
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
  // preventDefault above also cancels the browser's normal implicit blur of
  // whatever field had focus (e.g. a text-box textarea the member was just
  // typing in) — without this, clicking straight from typing to selecting a
  // canvas element leaves focus stranded on the old field, and Delete would
  // still be suppressed as "typing" instead of reaching the newly selected
  // element. Blur explicitly so intent visibly moves to the canvas.
  if (isTypingTarget(document.activeElement)) (document.activeElement as HTMLElement).blur();
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

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

// Delete key on the selected element: each element kind has its own idea of
// "removed" — a photo clears back to no image, a motif turns fully off, a
// text box is dropped from comp.texts, title/date/time clear their field,
// and the signature is hidden (sigControls' On/Off toggle brings it back —
// the one element kind whose panel would otherwise disappear along with it).
function deleteSelected() {
  const key = selected;
  if (!key) return;
  if (key.startsWith("text:")) {
    const id = key.slice("text:".length);
    doc.comp.texts = doc.comp.texts.filter((tb) => tb.id !== id);
  } else if (key === "photo") {
    doc.comp.photo = "";
    delete doc.comp.upload;
  } else if (key === "motif") {
    doc.motif = null;
  } else if (key === "title" || key === "date" || key === "time") {
    doc.fields[key] = "";
  } else if (key === "sig") {
    doc.comp.sigOn = false;
  }
  const xf = { ...(doc.comp.xf ?? {}) };
  delete xf[key];
  doc.comp.xf = xf;
  deselect();
  buildAll();
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    deselect();
    return;
  }
  const typing = isTypingTarget(document.activeElement);
  if ((e.key === "Delete" || e.key === "Backspace") && !typing && selected) {
    e.preventDefault();
    deleteSelected();
    return;
  }
  // Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z — suppressed while typing so the browser's
  // own per-field undo (e.g. inside a textarea) isn't hijacked.
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  }
});

// --- undo / redo --------------------------------------------------------------
// One history stack over the whole doc, keyed off renderCanvas() — almost
// every mutation in the app funnels through it (directly, or via buildAll()),
// so it's the single choke point to snapshot from instead of instrumenting
// every call site. Continuous gestures (a drag, a range slider, typing in a
// field) coalesce into one entry via noteHistory's "same focused
// continuous-input element, within the coalesce window" check; the drag tool
// itself only ever calls renderCanvas() once per gesture (at pointerup), so
// it coalesces for free.
const HISTORY_CAP = 100;
const HISTORY_COALESCE_MS = 1200;
let historyUndo: string[] = [];
let historyRedo: string[] = [];
let historyCurrent: string = JSON.stringify(doc);
let historyCoalesceEl: Element | null = null;
let historyCoalesceAt = 0;
let historySuppressed = false;

function isContinuousInput(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return type === "range" || type === "text";
  }
  return false;
}

function updateHistoryButtons() {
  const undoBtn = document.querySelector("#undoBtn") as HTMLButtonElement | null;
  const redoBtn = document.querySelector("#redoBtn") as HTMLButtonElement | null;
  if (undoBtn) undoBtn.disabled = historyUndo.length === 0;
  if (redoBtn) redoBtn.disabled = historyRedo.length === 0;
}

// Called from renderCanvas(). Records the doc state from BEFORE this render
// as one undo step, unless: it's a no-op re-render with no actual doc change
// (e.g. ensureArtLum's async warm-up callback), it's happening while an
// undo/redo itself is being applied (historySuppressed), or it's a
// continuation of the same gesture that produced the last entry.
function noteHistory() {
  const snap = JSON.stringify(doc);
  if (snap === historyCurrent) return;
  if (historySuppressed) {
    historyCurrent = snap;
    return;
  }
  const active = document.activeElement;
  const now = performance.now();
  const continuing =
    isContinuousInput(active) && active === historyCoalesceEl && now - historyCoalesceAt < HISTORY_COALESCE_MS;
  if (!continuing) {
    historyUndo.push(historyCurrent);
    if (historyUndo.length > HISTORY_CAP) historyUndo.shift();
    historyRedo = [];
  }
  historyCoalesceEl = isContinuousInput(active) ? active : null;
  historyCoalesceAt = now;
  historyCurrent = snap;
  updateHistoryButtons();
}

function applyHistorySnapshot(snap: string) {
  historySuppressed = true;
  doc = sanitize(JSON.parse(snap));
  deselect();
  buildAll();
  historySuppressed = false;
  updateHistoryButtons();
}

function undo() {
  if (!historyUndo.length) return;
  historyRedo.push(historyCurrent);
  if (historyRedo.length > HISTORY_CAP) historyRedo.shift();
  applyHistorySnapshot(historyUndo.pop()!);
}

function redo() {
  if (!historyRedo.length) return;
  historyUndo.push(historyCurrent);
  if (historyUndo.length > HISTORY_CAP) historyUndo.shift();
  applyHistorySnapshot(historyRedo.pop()!);
}

(document.querySelector("#undoBtn") as HTMLButtonElement).onclick = undo;
(document.querySelector("#redoBtn") as HTMLButtonElement).onclick = redo;

// Re-attach hover/drag listeners on every render — innerHTML rebuilds the DOM.
function attachXfInteractivity() {
  if (!docTemplate(doc).composed) return;
  const svgEl = canvasWrap.querySelector("svg");
  if (!svgEl) return;
  // click on empty canvas (no data-el under the pointer) clears the selection
  svgEl.addEventListener("pointerdown", (e) => {
    if (!(e.target as Element).closest("[data-el]")) deselect();
  });
  // Text boxes are dynamic in number, so they're not part of the fixed
  // XF_KEYS union — add each one's runtime `text:<id>` key so every box is
  // selectable/movable/rotatable/resizable exactly like the fixed elements.
  const allKeys: XfKey[] = [...XF_KEYS, ...doc.comp.texts.map((tb) => textXfKey(tb.id))];
  for (const key of allKeys) {
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

// --- collapsible right-panel sections -----------------------------------------
// Each control group gets its own disclosure; open/closed state is per-section
// and remembered across visits. Sensible defaults: the photo library and
// background texture pickers (big image grids, least-used) start collapsed;
// composition/layout/shuffle and everything else starts open.

const SECTION_KEY = "foldCommons.sections.v1";

function loadSectionState(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SECTION_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function sectionOpen(key: string, defaultOpen: boolean): boolean {
  const v = loadSectionState()[key];
  return typeof v === "boolean" ? v : defaultOpen;
}
function setSectionOpen(key: string, open: boolean) {
  try {
    const state = loadSectionState();
    state[key] = open;
    localStorage.setItem(SECTION_KEY, JSON.stringify(state));
  } catch {
    /* private mode etc — the toggle still works, just doesn't stick */
  }
}

// Builds `build`'s content off-DOM first so an empty section (wrong template
// kind, nothing applicable right now) renders no header at all instead of an
// empty disclosure. Non-empty content gets a clickable title+chevron header;
// open state persists per `key` and animates via a plain max-height transition.
function section(into: HTMLElement, key: string, title: string, defaultOpen: boolean, build: (body: HTMLElement) => void) {
  const scratch = document.createElement("div");
  build(scratch);
  if (!scratch.childNodes.length) return;
  const isOpen = sectionOpen(key, defaultOpen);
  const wrap = h(`<div class="panel-section${isOpen ? " open" : ""}">
    <button type="button" class="panel-section-head"><h3 class="panel-title">${title}</h3><span class="chev">›</span></button>
    <div class="panel-section-body"><div class="panel-section-inner"></div></div>
  </div>`);
  const inner = wrap.querySelector(".panel-section-inner") as HTMLElement;
  inner.append(...Array.from(scratch.childNodes));
  into.appendChild(wrap);
  const body = wrap.querySelector(".panel-section-body") as HTMLElement;
  // Every build (not just the first) creates a brand-new .panel-section-body,
  // and its CSS class starts it at max-height:0 with a transition — setting
  // the real height right after insertion would otherwise animate open over
  // ~220ms, during which the panel's scrollHeight is still short of its true
  // total. That silently clamps a caller's scrollTop restore (buildRight's
  // scroll-position preservation) to whatever the panel could scroll to at
  // that half-grown instant. Suppress the transition for this initial snap
  // to size — a forced reflow commits "no transition" before the height
  // change, then the CSS transition is restored so a later manual toggle
  // click still animates normally.
  body.style.transition = "none";
  body.style.maxHeight = isOpen ? inner.scrollHeight + "px" : "0px";
  void body.offsetHeight; // flush styles so "none" actually applies first
  body.style.transition = "";
  (wrap.querySelector(".panel-section-head") as HTMLButtonElement).onclick = () => {
    const next = !wrap.classList.contains("open");
    wrap.classList.toggle("open", next);
    setSectionOpen(key, next);
    body.style.maxHeight = next ? inner.scrollHeight + "px" : "0px";
  };
}

function buildRight() {
  // rightPanel is itself the scrolling element — clearing its innerHTML
  // collapses scrollHeight and snaps scrollTop to 0, so every click that
  // rebuilds the panel (frame pickers, add/delete text box, etc.) would
  // otherwise yank the panel back to the top. Restore the position after
  // rebuilding, clamped to the new (possibly shorter) content height.
  const scrollY = rightPanel.scrollTop;
  rightPanel.innerHTML = "";
  section(rightPanel, "composition", "Composition", true, compControls);
  section(rightPanel, "photo", "Photo", false, photoLibraryControls);
  section(rightPanel, "bg", "Background texture", false, bgTextureControls);
  section(rightPanel, "palette", "Palette lab (temporary)", false, paletteLabControls);
  section(rightPanel, "words", "Words", true, fieldControls);
  section(rightPanel, "texts", "Text boxes", true, textBoxesControls);
  section(rightPanel, "signature", "Signature · F·O·L·D net", true, sigControls);
  section(rightPanel, "motif", "Motif", true, motifControls);
  section(rightPanel, "line", "The Line", true, lineControls);
  section(rightPanel, "diagram", "Diagram", true, diagramControls);
  section(rightPanel, "marks", "Marks", true, stickerControls);
  section(rightPanel, "export", "Ship it", true, exportControls);
  rightPanel.scrollTop = scrollY;
}

// --- gallery -----------------------------------------------------------------

let galleryLoadToken = 0;

async function buildGallery() {
  const view = $("#galleryView");
  view.innerHTML = `<div class="g-empty">Loading…</div>`;
  const token = ++galleryLoadToken;
  const items: MergedGalleryItem[] = await fetchGalleryMerged();
  if (token !== galleryLoadToken) return; // a newer load superseded this one
  view.innerHTML = "";
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
        <div class="d">${item.date}${item.source === "remote" ? " · shared" : ""}</div>
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
    row.append(remix, share);
    // Remote gallery entries have no public-facing delete path — only local
    // saves can be removed from this browser.
    if (item.source === "local") {
      const del = h(`<button class="mini">✕</button>`);
      del.onclick = () => {
        removeLocalGalleryItem(item.id);
        buildGallery();
      };
      row.append(del);
    }
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

// --- hidden internal tools -----------------------------------------------------
// #tune, #moderate, #feedback: standalone pages, never linked from #nav,
// reached only by typing the URL. Each renders a full-viewport overlay on
// top of the normal app shell (which still boots underneath — harmless idle
// work) rather than plugging into the Make/Gallery/Canon view system.

// Shared bearer-token prompt for the two moderation pages: shows a small
// form if no token is saved yet, otherwise calls straight through.
function tokenGate(container: HTMLElement, onToken: (token: string) => void) {
  const saved = loadModToken();
  if (saved) {
    onToken(saved);
    return;
  }
  container.innerHTML = "";
  const wrap = h(`<div class="token-gate">
    <p class="note">Paste the moderation bearer token to continue. Stored only in this browser.</p>
    <input type="password" class="tg-input" placeholder="Bearer token">
    <button class="act tg-go" style="margin-top:10px">Continue</button>
  </div>`);
  container.appendChild(wrap);
  const input = wrap.querySelector(".tg-input") as HTMLInputElement;
  input.focus();
  const go = () => {
    const t = input.value.trim();
    if (!t) return;
    saveModToken(t);
    onToken(t);
  };
  (wrap.querySelector(".tg-go") as HTMLButtonElement).onclick = go;
  input.onkeydown = (e) => {
    if (e.key === "Enter") go();
  };
}

function hiddenPageShell(title: string, blurb: string): { overlay: HTMLElement; body: HTMLElement } {
  const overlay = h(`<div class="hidden-page"><div class="hp-inner">
    <button type="button" class="hp-close mini">✕ Close</button>
    <h1>${title}</h1>
    <div class="hp-sub">${blurb}</div>
    <div class="hp-body"></div>
  </div></div>`);
  document.body.appendChild(overlay);
  (overlay.querySelector(".hp-close") as HTMLButtonElement).onclick = () => {
    overlay.remove();
    history.replaceState(null, "", location.pathname + location.search);
  };
  return { overlay, body: overlay.querySelector(".hp-body") as HTMLElement };
}

// #tune — the one team member refining the signature dials it here: a big
// preview, every SIG_PARAMS slider, and a local log of notes (what's
// working, what's not) they can export and hand off.
function buildTuneView() {
  const { body } = hiddenPageShell(
    "Signature tuning",
    "Hidden internal tool — not linked from the nav. Dial the F·O·L·D net, leave a note, move on."
  );
  const preview = h(`<div class="tune-preview"></div>`);
  const controls = h(`<div class="tune-controls"></div>`);
  // Reuses the gallery's maker key, so anyone who already named themselves
  // when publishing a flyer gets it prefilled here.
  let savedTuner = "";
  try {
    savedTuner = localStorage.getItem(MAKER_KEY) ?? "";
  } catch {
    savedTuner = "";
  }
  const tunerField = h(`<div class="field"><label>Your name</label>
    <input type="text" class="tune-tuner" placeholder="Anonymous"></div>`);
  (tunerField.querySelector(".tune-tuner") as HTMLInputElement).value = savedTuner;
  const commentField = h(`<div class="field"><label>Comment</label>
    <textarea class="tune-comment" rows="3" placeholder="What's working, what's not..."></textarea></div>`);
  const ratingSeg = h(`<div class="seg" style="margin-bottom:10px">
    <button type="button" data-r="up">👍 Good</button>
    <button type="button" data-r="down">👎 Not it</button>
  </div>`);
  const actions = h(`<div class="row">
    <button type="button" class="act tune-save">Save note</button>
    <button type="button" class="act ghost tune-export">Export JSON</button>
  </div>`);
  const syncNote = h(`<div class="note tune-sync"></div>`);
  const logHeader = h(`<h3 class="panel-title" style="margin-top:30px">Your notes</h3>`);
  const log = h(`<div class="tune-log"></div>`);
  const teamHeader = h(`<h3 class="panel-title" style="margin-top:30px">Everyone's notes</h3>`);
  const teamLog = h(`<div class="tune-log"></div>`);
  body.append(preview, controls, tunerField, commentField, ratingSeg, actions, syncNote, logHeader, log);
  // The pooled view is a moderator read (bearer token), so it only appears
  // when there's a backend to read from at all.
  if (FOLD_API) body.append(teamHeader, teamLog);

  let seed = Math.floor(Math.random() * 100000);
  let params = defaultSigParams();
  let rating: "up" | "down" | "" = "";
  const TUNE_GROUND = "#FFF9F1";
  const TUNE_INK = "#03071B";

  function renderPreview() {
    const pairs = [
      { ground: "#FFF9F1", ink: "#03071B" },
      { ground: "#03071B", ink: "#FFF9F1" },
    ];
    preview.innerHTML = pairs
      .map(({ ground, ink }) => {
        const inner = SIGNATURE_ENGINE.render({ w: 280, h: 200, p: sigEngineParams(params), colors: [], ink, ground, seed });
        return `<div class="tune-swatch" style="background:${ground}"><svg viewBox="0 0 280 200">${inner}</svg></div>`;
      })
      .join("");
  }

  function renderControls() {
    controls.innerHTML = "";
    const randomize = h(`<button type="button" class="act ghost" style="margin-bottom:14px">🎲 Randomize</button>`);
    randomize.onclick = () => {
      seed = Math.floor(Math.random() * 100000);
      for (const p of SIG_PARAMS) {
        const v = p.min + Math.random() * (p.max - p.min);
        params[p.key] = Math.min(p.max, Math.max(p.min, Math.round(v / p.step) * p.step));
      }
      renderPreview();
      renderControls();
    };
    controls.appendChild(randomize);
    for (const p of SIG_PARAMS) {
      const f = h(`<div class="field"><label>${p.label}</label></div>`);
      const r = h(
        `<input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${params[p.key]}">`
      ) as HTMLInputElement;
      r.oninput = () => {
        params[p.key] = Number(r.value);
        renderPreview();
      };
      f.appendChild(r);
      controls.appendChild(f);
    }
  }

  ratingSeg.querySelectorAll("button").forEach((b) => {
    (b as HTMLButtonElement).onclick = () => {
      const r = (b as HTMLElement).dataset.r as "up" | "down";
      rating = rating === r ? "" : r;
      ratingSeg
        .querySelectorAll("button")
        .forEach((x) => x.classList.toggle("active", (x as HTMLElement).dataset.r === rating));
    };
  });

  function renderLog() {
    const samples = loadSamples();
    log.innerHTML = "";
    if (!samples.length) {
      log.appendChild(h(`<div class="note">Nothing saved yet.</div>`));
      return;
    }
    for (const s of samples) {
      const inner = SIGNATURE_ENGINE.render({ w: 72, h: 72, p: sigEngineParams(s.params), colors: [], ink: s.ink, ground: s.ground, seed: s.seed });
      const card = h(`<div class="hp-card">
        <div class="thumb" style="background:${s.ground}"><svg viewBox="0 0 72 72">${inner}</svg></div>
        <div class="body">
          <div class="hp-comment"></div>
          <div class="meta"></div>
        </div>
      </div>`);
      (card.querySelector(".hp-comment") as HTMLElement).textContent =
        (s.rating === "up" ? "👍 " : s.rating === "down" ? "👎 " : "") + (s.comment || "(no comment)");
      (card.querySelector(".meta") as HTMLElement).textContent =
        `${new Date(s.createdAt).toLocaleString()} · seed ${s.seed}`;
      const load = h(`<button type="button" class="mini">↩ Load</button>`);
      load.onclick = () => restore(s.seed, s.params);
      const del = h(`<button type="button" class="mini">✕</button>`);
      del.onclick = () => {
        removeSample(s.id);
        renderLog();
      };
      (card.querySelector(".body") as HTMLElement).append(load, del);
      log.appendChild(card);
    }
  }

  (actions.querySelector(".tune-save") as HTMLButtonElement).onclick = async () => {
    const commentEl = commentField.querySelector(".tune-comment") as HTMLTextAreaElement;
    const tunerEl = tunerField.querySelector(".tune-tuner") as HTMLInputElement;
    const tuner = tunerEl.value.trim();
    try {
      if (tuner) localStorage.setItem(MAKER_KEY, tuner);
    } catch {
      // private mode — the name just won't be prefilled next time
    }
    const sample = addSample({
      seed,
      params: { ...params },
      ground: TUNE_GROUND,
      ink: TUNE_INK,
      comment: commentEl.value.trim(),
      rating,
    });
    commentEl.value = "";
    rating = "";
    ratingSeg.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
    renderLog();

    // Local copy is already saved; the shared copy is best-effort.
    if (FOLD_API) {
      syncNote.textContent = "Saving to the team log...";
      const ok = await pushSample(sample, tuner || undefined);
      syncNote.textContent = ok
        ? "Saved to the team log ✓"
        : "Saved on this device only — the team log couldn't be reached.";
      if (ok) renderTeamLog();
    }
  };
  (actions.querySelector(".tune-export") as HTMLButtonElement).onclick = async (e) => {
    await navigator.clipboard.writeText(exportSamplesJson());
    const btn = e.currentTarget as HTMLButtonElement;
    btn.textContent = "Copied ✓";
    setTimeout(() => (btn.textContent = "Export JSON"), 1400);
  };

  // Everyone's notes: same bearer token as the other hidden pages. Rendered
  // read-mostly — a moderator can prune a row, but not edit one.
  function renderTeamLog(token?: string) {
    if (!FOLD_API) return;
    const go = (t: string) => {
      teamLog.innerHTML = "";
      teamLog.appendChild(h(`<div class="note">Loading...</div>`));
      fetchTeamSamples(FOLD_API, t).then((res) => {
        teamLog.innerHTML = "";
        if (!res.ok) {
          teamLog.appendChild(h(`<div class="note">${res.error}</div>`));
          return;
        }
        if (!res.data.length) {
          teamLog.appendChild(h(`<div class="note">No notes from the team yet.</div>`));
          return;
        }
        for (const s of res.data) renderTeamCard(s, t);
      });
    };
    if (token) go(token);
    else tokenGate(teamLog, go);
  }

  function renderTeamCard(s: RemoteSigSample, token: string) {
    const inner = SIGNATURE_ENGINE.render({
      w: 72,
      h: 72,
      p: sigEngineParams(s.params),
      colors: [],
      ink: s.ink,
      ground: s.ground,
      seed: s.seed,
    });
    const card = h(`<div class="hp-card">
      <div class="thumb" style="background:${s.ground}"><svg viewBox="0 0 72 72">${inner}</svg></div>
      <div class="body">
        <div class="hp-comment"></div>
        <div class="meta"></div>
      </div>
    </div>`);
    (card.querySelector(".hp-comment") as HTMLElement).textContent =
      (s.rating === "up" ? "\u{1F44D} " : s.rating === "down" ? "\u{1F44E} " : "") + (s.comment || "(no comment)");
    (card.querySelector(".meta") as HTMLElement).textContent =
      `${s.tuner || "Anonymous"} \u00B7 ${new Date(s.created_at).toLocaleString()} \u00B7 seed ${s.seed}`;
    const load = h(`<button type="button" class="mini">\u21A9 Load</button>`);
    load.onclick = () => restore(s.seed, s.params);
    const del = h(`<button type="button" class="mini">\u2715</button>`);
    del.onclick = async () => {
      if (await deleteTeamSample(FOLD_API!, s.id, token)) renderTeamLog(token);
    };
    (card.querySelector(".body") as HTMLElement).append(load, del);
    teamLog.appendChild(card);
  }

  // Load this sample's dials back into the editor — the point of pooling the
  // notes is being able to pick a teammate's "good" one back up.
  function restore(sampleSeed: number, sampleParams: Record<string, number>) {
    seed = sampleSeed;
    params = { ...defaultSigParams(), ...sampleParams };
    renderPreview();
    renderControls();
  }

  renderPreview();
  renderControls();
  renderLog();
  renderTeamLog();
}

// #moderate — approve or deny photos the community submitted for the
// shared house library.
function buildModerateView() {
  const { body } = hiddenPageShell(
    "Photo moderation",
    "Hidden internal tool. Approve or deny community photo submissions."
  );
  if (!FOLD_API) {
    body.appendChild(h(`<div class="note">No backend configured (VITE_FOLD_API is unset) — nothing to moderate.</div>`));
    return;
  }
  const base = FOLD_API;

  async function loadList(token: string) {
    body.innerHTML = `<div class="note">Loading…</div>`;
    const res = await fetchPendingPhotos(base, token);
    body.innerHTML = "";
    if (!res.ok) {
      const msg = h(`<div class="note"></div>`);
      msg.textContent = res.error;
      body.appendChild(msg);
      if (res.error === "Invalid token.") {
        const retry = h(`<button type="button" class="mini" style="margin-top:8px">Try another token</button>`);
        retry.onclick = () => {
          saveModToken("");
          tokenGate(body, loadList);
        };
        body.appendChild(retry);
      }
      return;
    }
    if (!res.data.length) {
      body.appendChild(h(`<div class="note">Nothing pending.</div>`));
      return;
    }
    for (const p of res.data) {
      const card = h(`<div class="hp-card">
        <div class="thumb"><img></div>
        <div class="body">
          <div class="hp-name"></div>
          <div class="meta hp-submitter"></div>
          <div class="row" style="margin-top:10px"></div>
        </div>
      </div>`);
      (card.querySelector("img") as HTMLImageElement).src = p.url;
      (card.querySelector(".hp-name") as HTMLElement).textContent = p.name;
      (card.querySelector(".hp-submitter") as HTMLElement).textContent = p.submitter
        ? `submitted by ${p.submitter}`
        : "submitted anonymously";
      const row = card.querySelector(".row") as HTMLElement;
      const approve = h(`<button type="button" class="mini">✓ Approve</button>`);
      approve.onclick = async () => {
        approve.textContent = "…";
        await approvePhoto(base, p.id, token);
        loadList(token);
      };
      const deny = h(`<button type="button" class="mini">✕ Deny</button>`);
      deny.onclick = async () => {
        deny.textContent = "…";
        await denyPhoto(base, p.id, token);
        loadList(token);
      };
      row.append(approve, deny);
      body.appendChild(card);
    }
  }

  tokenGate(body, loadList);
}

// #feedback — the bug-report / feature-request inbox anyone can post to
// from the topbar button; this is where it gets reviewed.
function buildFeedbackView() {
  const { body } = hiddenPageShell(
    "Feedback inbox",
    "Hidden internal tool. Bug reports and feature requests sent from the app."
  );
  if (!FOLD_API) {
    body.appendChild(h(`<div class="note">No backend configured (VITE_FOLD_API is unset) — nothing to show.</div>`));
    return;
  }
  const base = FOLD_API;

  async function loadList(token: string) {
    body.innerHTML = `<div class="note">Loading…</div>`;
    const res = await fetchFeedback(base, token);
    body.innerHTML = "";
    if (!res.ok) {
      const msg = h(`<div class="note"></div>`);
      msg.textContent = res.error;
      body.appendChild(msg);
      if (res.error === "Invalid token.") {
        const retry = h(`<button type="button" class="mini" style="margin-top:8px">Try another token</button>`);
        retry.onclick = () => {
          saveModToken("");
          tokenGate(body, loadList);
        };
        body.appendChild(retry);
      }
      return;
    }
    if (!res.data.length) {
      body.appendChild(h(`<div class="note">Nothing yet.</div>`));
      return;
    }
    for (const item of res.data) {
      const card = h(`<div class="hp-card">
        <div class="body">
          <span class="hp-badge"></span>
          <div class="hp-text" style="margin-top:6px"></div>
          <div class="meta hp-meta"></div>
          <div class="row" style="margin-top:10px"></div>
        </div>
      </div>`);
      if (item.status === "done") card.style.opacity = "0.55";
      (card.querySelector(".hp-badge") as HTMLElement).textContent = item.kind;
      (card.querySelector(".hp-text") as HTMLElement).textContent = item.text;
      (card.querySelector(".hp-meta") as HTMLElement).textContent =
        `${new Date(item.created_at).toLocaleString()}${item.name ? ` · ${item.name}` : ""}${item.context ? ` · ${item.context}` : ""}`;
      const row = card.querySelector(".row") as HTMLElement;
      const toggle = h(`<button type="button" class="mini">${item.status === "done" ? "↺ Reopen" : "✓ Mark done"}</button>`);
      toggle.onclick = async () => {
        await setFeedbackStatus(base, item.id, item.status === "done" ? "new" : "done", token);
        loadList(token);
      };
      const del = h(`<button type="button" class="mini">✕ Delete</button>`);
      del.onclick = async () => {
        await deleteFeedback(base, item.id, token);
        loadList(token);
      };
      row.append(toggle, del);
      body.appendChild(card);
    }
  }

  tokenGate(body, loadList);
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
    p: { tiles: 1, style: 3, scatter: 0.55, size: 2.2, weight: 3, even: 1 },
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

// Topbar feedback button — hidden entirely when there's no backend to send
// reports to (mirrors how other backend-optional features degrade).
if (FOLD_API) {
  const feedbackBtn = $("#feedbackBtn");
  feedbackBtn.style.display = "";
  feedbackBtn.onclick = () => openFeedbackModal();
}

// Hidden internal tools — no #nav entry, reached by typing the URL.
if (location.hash === "#tune") buildTuneView();
if (location.hash === "#moderate") buildModerateView();
if (location.hash === "#feedback") buildFeedbackView();
