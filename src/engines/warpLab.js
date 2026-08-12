// warpLab.js — "Warp Lab". An explorer for space-time-warp line diagrams: a family
// of lines (rectangular lattice, polar grid, or traced streamlines) pushed and pulled
// by a handful of movable SINGULARITIES — gravity wells that dimple space and vortices
// that swirl it into a spiral. Drag the points, reseed their placement, dial the line
// spacing. Because the output is meant to read as a LOGOMARK, the whole field can be
// clipped to a contained shape (disc · ring · lens · rounded square), so a dense warp
// becomes an icon, not a full-bleed texture. For true mark-simple forms there is a
// contour (membrane) field, a 3-line floor on line count, ◇ Mark presets, and a
// BREAKER line — one heavy stroke that plunges through the sheet while the membrane
// lines part around it (the "something breaking the membrane" direction). It's all lines, so the SVG export is
// natively clean, editable vector. Same lineage as the Quilt engine's space-time warp,
// rebuilt as a focused, draggable, spacing-rich tool.
//
// Live view renders to a 2D canvas (fast with thousands of segments); snapshotSVG
// re-emits the identical warped polylines as vector paths under the same clip.
import { rng, smoothPath } from "./util.js";

const STAGE = 1080;
const TAU = Math.PI * 2;

// tiny hex → for line color alpha compositing we just use rgba via the hex + opacity
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export default (() => {
  const engine = {
    id: "warp",
    label: "Warp Lab",
    kind: "live",
    vector: true,
    blurb: "Space-time-warp line diagrams as logomarks. A lattice / polar grid / contours / streamlines bent by movable gravity wells & vortices. ⟳ New seed scatters the singularities · Mutate nudges them · toggle Edit points to drag. The ◇ Mark presets drop to a few bold lines for a true logomark; the Breaker line punches through the membrane and the lines part around it. Exports clean vector.",
    params: [
      { key: "grid", label: "Field", type: "select", default: "rect", options: [
        { value: "rect", label: "Rectangular lattice" },
        { value: "polar", label: "Polar grid" },
        { value: "contour", label: "Contours (membrane)" },
        { value: "stream", label: "Streamlines" },
      ] },
      { key: "lines", label: "Line count / spacing", min: 3, max: 140, step: 1, default: 44 },
      { key: "render", label: "Render", type: "select", default: "lines", options: [
        { value: "lines", label: "Lines (wireframe)" },
        { value: "fill", label: "Filled bands (translucent)" },
        { value: "both", label: "Fills + line edges" },
      ] },
      { key: "fillOpacity", label: "Fill opacity", min: 0.05, max: 0.7, step: 0.01, default: 0.25 },
      { key: "moire", label: "Moiré ghost (rotated copy)", min: 0, max: 1, step: 0.01, default: 0 },
      { key: "res", label: "Smoothness", min: 20, max: 160, step: 2, default: 84 },
      { key: "warp", label: "Warp strength", min: 0, max: 1.6, step: 0.02, default: 0.7 },
      { key: "falloff", label: "Well radius", min: 0.05, max: 0.6, step: 0.01, default: 0.24 },
      { key: "swirl", label: "Vortex swirl", min: 0, max: 3, step: 0.02, default: 1 },
      { key: "depth", label: "Funnel depth", min: 0, max: 1, step: 0.02, default: 0.55 },
      { key: "tilt", label: "View tilt", min: 0, max: 1.3, step: 0.02, default: 0.35 },
      { key: "persp", label: "Perspective", min: 0, max: 1, step: 0.02, default: 0.6 },
      { key: "points", label: "Singularities", min: 1, max: 6, step: 1, default: 3 },
      { key: "streamLen", label: "Streamline length", min: 0.15, max: 1, step: 0.01, default: 0.55 },
      { key: "mask", label: "Frame (mark)", type: "select", default: "none", options: [
        { value: "none", label: "None (full field)" },
        { value: "circle", label: "Disc" },
        { value: "ring", label: "Ring" },
        { value: "lens", label: "Lens / eye" },
        { value: "square", label: "Rounded square" },
      ] },
      { key: "inner", label: "Ring / lens inner", min: 0.1, max: 0.85, step: 0.01, default: 0.45 },
      { key: "breaker", label: "Breaker line (breaks the membrane)", min: 0, max: 1, step: 1, default: 0 },
      { key: "breakGap", label: "Break halo", min: 0, max: 0.1, step: 0.005, default: 0.035 },
      { key: "breakBoost", label: "Breaker plunge", min: 0, max: 2.5, step: 0.05, default: 0.5 },
      { key: "breakWeight", label: "Breaker weight", min: 0.5, max: 10, step: 0.1, default: 3.5 },
      { key: "weight", label: "Line weight", min: 0.2, max: 8, step: 0.05, default: 0.8 },
      { key: "opacity", label: "Line opacity", min: 0.05, max: 1, step: 0.01, default: 0.5 },
      { key: "jitter", label: "Hand-drawn", min: 0, max: 1, step: 0.02, default: 0 },
      { key: "accent", label: "Accent color line", min: 0, max: 1, step: 1, default: 0 },
      { key: "handles", label: "Edit points (drag)", min: 0, max: 1, step: 1, default: 1 },
    ],

    controls() {
      return `<div class="knot-actions">
        <button class="ghost sm" id="warpMutate">✦ Mutate</button>
        <button class="ghost sm" id="warpAdd">＋ Point</button>
        <button class="ghost sm" id="warpType">↻ Flip type</button>
        <button class="ghost sm" id="warpBank">☆ Bank pose</button>
      </div>
      <div class="knot-actions">
        <button class="ghost sm" id="warpMarkMembrane">◇ Mark · membrane</button>
        <button class="ghost sm" id="warpMarkBreaker">◇ Mark · breaker</button>
        <button class="ghost sm" id="warpMarkLattice">◇ Mark · lattice</button>
        <button class="ghost sm" id="warpMarkVeil">◇ Mark · veil</button>
      </div>
      <p class="blurb" style="margin:0 0 8px">Wells (○) dimple space · vortices (◐) swirl it · twists (⌁ rust, with axis tick) flip the plane over like a twisted ribbon. Drag a point, then <b>Flip type</b> to cycle the last-touched one (○→◐→⌁). Right-click a point to remove. <b>◇ Mark presets</b> collapse to a few bold lines (logomark-simple); <b>Breaker</b> runs one heavy line through the selected point that plunges deeper than the sheet — the membrane parts around it.</p>
      <label class="slider"><span>Selected point · funnel depth<em id="warpSelVal">1.00</em></span><input type="range" id="warpSelDepth" min="0" max="2" step="0.05" value="1"></label>
      <div class="knot-tray" id="warpTray"></div>`;
    },
    wireControls(root) {
      const tray = root.querySelector("#warpTray");
      const renderTray = () => {
        tray.innerHTML = engine._poses.map((p, i) =>
          `<button class="knot-thumb" data-pose="${i}" title="Restore pose"><img src="${p.thumb}" alt=""></button>`).join("");
        tray.querySelectorAll("[data-pose]").forEach((b) =>
          b.onclick = () => engine._active && engine._active.restore(engine._poses[+b.dataset.pose]));
      };
      const bind = (id, fn) => { const el = root.querySelector(id); if (el) el.onclick = () => { if (engine._active) fn(engine._active); } };
      bind("#warpMutate", (A) => A.mutate());
      bind("#warpAdd", (A) => A.addPoint());
      bind("#warpType", (A) => A.flipType());
      bind("#warpBank", (A) => { A.bankPose(); renderTray(); });
      // ◇ Mark presets — push logomark-simple values into the shared param inputs and
      // let the studio's own oninput handlers propagate them (state + labels + redraw).
      const MARK_PRESETS = {
        membrane: { grid: "contour", render: "lines", lines: 9, warp: 0.85, falloff: 0.3, depth: 0.85, tilt: 0.55, persp: 0.65, points: 1, mask: "none", weight: 3, opacity: 1, jitter: 0, breaker: 0 },
        breaker: { grid: "contour", render: "lines", lines: 7, warp: 0.8, falloff: 0.32, depth: 0.75, tilt: 0.55, persp: 0.65, points: 1, mask: "none", weight: 2.4, opacity: 0.95, jitter: 0, breaker: 1, breakGap: 0.035, breakBoost: 0.5, breakWeight: 3.5 },
        lattice: { grid: "rect", render: "lines", lines: 6, warp: 1, falloff: 0.34, depth: 0.7, tilt: 0.45, persp: 0.6, points: 2, mask: "none", weight: 3, opacity: 1, jitter: 0, breaker: 0 },
        // filled translucent bands — the sheet's self-overlaps darken and the fold
        // reads as SHAPE (high depth + tilt so the membrane actually folds over itself)
        veil: { grid: "contour", render: "both", lines: 6, warp: 0.9, falloff: 0.34, depth: 1, tilt: 0.8, persp: 0.7, points: 1, mask: "none", weight: 0.8, opacity: 0.9, fillOpacity: 0.25, jitter: 0, breaker: 0 },
      };
      const applyPreset = (vals) => {
        for (const [k, v] of Object.entries(vals)) {
          const inp = root.querySelector(`[data-param="${k}"]`);
          if (!inp) continue;
          if (inp.type === "checkbox") inp.checked = !!v; else inp.value = v;
          inp.dispatchEvent(new Event("input"));
        }
        // Marks read best as wells (the funnel dip; twists hook, and carry no funnel
        // depth for the breaker to plunge into). Flip type still cycles afterwards.
        if (engine._active && engine._active.makeWells) engine._active.makeWells();
      };
      const preset = (id, key) => { const el = root.querySelector(id); if (el) el.onclick = () => applyPreset(MARK_PRESETS[key]); };
      preset("#warpMarkMembrane", "membrane");
      preset("#warpMarkBreaker", "breaker");
      preset("#warpMarkLattice", "lattice");
      preset("#warpMarkVeil", "veil");
      // per-point funnel depth — bound to the last-touched singularity
      const sd = root.querySelector("#warpSelDepth"), sv = root.querySelector("#warpSelVal");
      if (sd) sd.oninput = () => { if (engine._active) { engine._active.setSelDepth(Number(sd.value)); if (sv) sv.textContent = Number(sd.value).toFixed(2); } };
      engine._syncSel = (dz) => { if (sd) sd.value = dz; if (sv) sv.textContent = Number(dz).toFixed(2); };
      renderTray();
    },
    _poses: [],
    _active: null,

    mount(host, cx) {
      let P = cx.params, colors = cx.colors, ink = cx.ink, ground = cx.ground, seed = cx.seed;

      const canvas = document.createElement("canvas");
      Object.assign(canvas.style, { width: "100%", height: "100%", display: "block", touchAction: "none" });
      host.appendChild(canvas);
      const g2 = canvas.getContext("2d");

      let pts = [];              // singularities: {x,y in UV 0..1, type:'well'|'vortex', s:strength, dz:depth×}
      let lastTouched = 0;
      let pointsParam = Math.round(P.points);   // last seen value of the Singularities slider
      let uvLines = [];          // warped polylines in UV space (rebuilt on geometry change)
      let uvBands = [];          // closed band polygons between adjacent family lines (fill modes)
      let breakerUV = null;      // the breaker line's warped polyline (null when off)

      // ---- singularity field ---------------------------------------------------
      function makePoints() {
        const r = rng((seed >>> 0) * 2654435761 >>> 0);
        const n = Math.round(P.points);
        pts = [];
        for (let i = 0; i < n; i++) {
          const roll = r();
          const type = roll < 0.42 ? "well" : roll < 0.78 ? "vortex" : "twist";
          pts.push({
            x: 0.2 + 0.6 * r(), y: 0.2 + 0.6 * r(),
            type, s: (type === "well" ? -1 : 1) * (0.5 + 0.8 * r()),   // wells pull in by default
            a: r() * Math.PI,                                           // twist axis angle (twist type only)
            dz: 1,                                                      // per-point funnel depth multiplier
          });
        }
        lastTouched = 0;
        notifySel();
      }
      function notifySel() { if (engine._syncSel) engine._syncSel(pts[lastTouched] ? (pts[lastTouched].dz ?? 1) : 1); }
      // velocity vector of the field at a UV point — used ONLY to trace streamlines.
      function field(u, v) {
        let du = 0, dv = 0;
        const rad = P.falloff;
        for (const m of pts) {
          const vx = u - m.x, vy = v - m.y, d = Math.hypot(vx, vy) + 1e-4;
          const g = Math.exp(-(d * d) / (2 * rad * rad)) * m.s;
          if (m.type === "vortex") {
            du += (-vy / d) * g * P.swirl + (vx / d) * g * -0.35;   // swirl + a mild inward pull → spiral
            dv += (vx / d) * g * P.swirl + (vy / d) * g * -0.35;
          } else if (m.type === "twist") {
            // shear: flow runs along the twist axis, reversing across it — streamlines
            // sweep past in opposite directions, the flow-field read of a ribbon twist
            const axc = Math.cos(m.a || 0), axs = Math.sin(m.a || 0);
            const q = -vx * axs + vy * axc;
            const sh = Math.tanh(q / (P.falloff * 0.6)) * g;
            du += axc * sh; dv += axs * sh;
          } else {
            du += (vx / d) * g; dv += (vy / d) * g;
          }
        }
        return [du, dv];
      }
      const jit = (u, v, k) => {
        if (P.jitter < 0.01) return 0;
        const s = Math.sin((u * 127.1 + v * 311.7 + k * 74.7)) * 43758.5453;
        return ((s - Math.floor(s)) - 0.5) * P.jitter * 0.012;
      };
      // Warp the lattice/polar grids with a SMOOTH space deformation — the logomark-
      // quality guarantee. Vortices ROTATE points around themselves by an angle that
      // decays with distance (a rotation can never tear or fling lines off), and wells
      // SCALE the radius toward/away from their center by a clamped factor (a point can
      // shrink toward the center but never overshoot past it — no fold-through, no
      // space inversion). Composed over a few substeps so multiple singularities blend
      // as one continuous deformation instead of fighting each other.
      const SUB = 3;
      function warpUV(u, v) {
        let x = u, y = v;
        const rad = P.falloff;
        for (let s = 0; s < SUB; s++) {
          let dx = 0, dy = 0;
          for (const m of pts) {
            if (m.type === "twist") continue;                          // twists apply exactly, after this loop
            const vx = x - m.x, vy = y - m.y;
            const d2 = vx * vx + vy * vy;
            const g = Math.exp(-d2 / (2 * rad * rad));
            if (m.type === "vortex") {
              const ang = (m.s * P.swirl * 2.2 * g) / SUB;          // rotate about the vortex — can wrap full turns
              const ca = Math.cos(ang), sa = Math.sin(ang);
              dx += (vx * ca - vy * sa) - vx;
              dy += (vx * sa + vy * ca) - vy;
            } else {
              // radial scale: r' = r·(1+k). k ∈ (−0.94, 0.94) per substep total, so the
              // pinch can be extreme but the map stays monotonic — lines bunch, never cross.
              const k = Math.max(-0.94, Math.min(0.94, m.s * P.warp * g)) / SUB;
              dx += vx * k; dy += vy * k;
            }
          }
          x += dx; y += dy;
        }
        // Twist points: the ribbon flip. The sheet rotates about an axis LYING IN THE
        // PLANE through the point — travelling along that axis, the cross-section turns
        // from 0 to ~180°: lines pinch edge-on at the twist, lift out of the plane, and
        // come out MIRRORED on the far side, exactly like a twisted ribbon. Windowed
        // across the axis so the flip blends into the surrounding sheet. Applied as an
        // exact rotation (not substepped) and carries real z for the fold-over.
        let zt = 0;
        for (const m of pts) {
          if (m.type !== "twist") continue;
          const axc = Math.cos(m.a || 0), axs = Math.sin(m.a || 0);
          const vx = x - m.x, vy = y - m.y;
          const along = vx * axc + vy * axs;                 // position along the twist axis
          const q = -vx * axs + vy * axc;                    // offset across it
          const ramp = 0.5 * (1 + Math.tanh(along / (P.falloff * 0.55)));
          const win = Math.exp(-(q * q) / (2 * Math.pow(P.falloff * 1.7, 2)));
          const phi = m.s * Math.PI * ramp * win;            // ~±180° on the far side of the point
          const q2 = q * Math.cos(phi);
          zt += q * Math.sin(phi) * (m.dz ?? 1) * (0.35 + 0.65 * P.depth);
          x = m.x + axc * along - axs * q2;
          y = m.y + axs * along + axc * q2;
        }
        return [x + jit(u, v, 1), y + jit(u, v, 2), zt];
      }

      // ---- the third dimension: what makes the sheet FOLD BACK ON ITSELF --------
      // The 2D warp alone can bunch lines but never overlap them (a smooth planar map
      // has no folds). The time-warp-tunnel look comes from treating the grid as a 3D
      // SHEET: every singularity digs a funnel in z, the sheet is tilted toward the
      // camera, and perspective projects it back to 2D — near funnel walls swallow far
      // ones, and the surface self-overlaps as smoothly as draped fabric.
      function zAt(x, y) {
        let z = 0;
        const rz = P.falloff * 0.72;                 // funnel narrower than the in-plane pinch → steep walls, real tunnels
        for (const m of pts) {
          if (m.type === "twist") continue;                  // twists carry their own z in warpUV
          const dx = x - m.x, dy = y - m.y;
          const g = Math.exp(-(dx * dx + dy * dy) / (2 * rz * rz));
          z -= Math.abs(m.s) * P.depth * (m.dz ?? 1) * 0.9 * g * (m.type === "vortex" ? 0.85 : 1);
        }
        return z;
      }
      // warped-UV point → tilted, perspective-projected unit coords. zBoost lets the
      // breaker line dive deeper than the sheet it belongs to — the "breaking through".
      function place(pt, zBoost = 1) {
        const z = (zAt(pt[0], pt[1]) + (pt[2] || 0)) * zBoost;   // funnels + any ribbon-twist lift
        const cx = pt[0] - 0.5, cy = pt[1] - 0.5;
        const ct = Math.cos(P.tilt), st = Math.sin(P.tilt);
        const y2 = cy * ct - z * st;
        const z2 = cy * st + z * ct;
        const f = 1 / Math.max(0.2, 1 + z2 * P.persp * 1.1);
        return [0.5 + cx * f, 0.5 + y2 * f];
      }
      // Project every line, then normalize to a centered, frame-filling composition —
      // tilt/depth reshape the sheet, but the MARK always sits centered at full size.
      function projectAll() {
        const raw = uvLines.map((ln) => ln.map((p) => place(p)));
        const braw = breakerUV ? breakerUV.map((p) => place(p, 1 + P.breakBoost)) : null;
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        for (const ln of braw ? raw.concat([braw]) : raw) for (const [x, y] of ln) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        const s = 0.94 / Math.max(1e-6, Math.max(maxX - minX, maxY - minY));
        const ox = 0.5 - s * (minX + maxX) / 2, oy = 0.5 - s * (minY + maxY) / 2;
        const fit = (p) => [p[0] * s + ox, p[1] * s + oy];
        let plines = raw.map((ln) => ln.map(fit));
        const breaker = braw ? braw.map(fit) : null;
        if (breaker && P.breakGap > 0) plines = cutAround(plines, breaker, P.breakGap);
        // band vertices are a subset of the line vertices, so the frame bounds above
        // already cover them — just project + fit each pair
        const bands = uvBands.length ? uvBands.map(([A, B]) => [A.map((p) => fit(place(p))), B.map((p) => fit(place(p)))]) : null;
        return { plines, bands, breaker, fit };
      }
      // The membrane parts around the breaker: drop every sample within a halo of the
      // breaker's projected path and split the survivors into separate runs, so each
      // line visibly BREAKS where the breaker passes instead of just being overdrawn.
      function cutAround(plines, breaker, g) {
        const gg = g * g;
        let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
        for (const [x, y] of breaker) {
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
          if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
        bx0 -= g; by0 -= g; bx1 += g; by1 += g;
        const near = (x, y) => {
          if (x < bx0 || x > bx1 || y < by0 || y > by1) return false;
          for (const [px, py] of breaker) { const dx = x - px, dy = y - py; if (dx * dx + dy * dy < gg) return true; }
          return false;
        };
        const out = [];
        for (const ln of plines) {
          let run = [];
          for (const p of ln) {
            if (near(p[0], p[1])) { if (run.length > 1) out.push(run); run = []; }
            else run.push(p);
          }
          if (run.length > 1) out.push(run);
        }
        return out;
      }
      let lastFit = (p) => p;                        // handles & hit-testing share the current fit

      // ---- geometry: warped polylines in UV -----------------------------------
      function buildLines() {
        const N = Math.round(P.lines), R = Math.round(P.res);
        const out = [];
        const fam = [];   // one ordered line family — adjacent pairs become fill bands
        if (P.grid === "rect") {
          for (let i = 0; i <= N; i++) {
            const c = i / N, hl = [], vl = [];
            for (let s = 0; s <= R; s++) { const t = s / R; hl.push(warpUV(t, c)); vl.push(warpUV(c, t)); }
            out.push(hl, vl);
            fam.push(hl);
          }
        } else if (P.grid === "contour") {
          // horizontal lines only — the sheet read as a MEMBRANE in cross-section.
          // At low counts (3–12) this is the logomark-simple form.
          for (let i = 0; i <= N; i++) {
            const c = i / N, hl = [];
            for (let s = 0; s <= R; s++) hl.push(warpUV(s / R, c));
            out.push(hl);
            fam.push(hl);
          }
        } else if (P.grid === "polar") {
          const cx0 = 0.5, cy0 = 0.5, maxR = 0.5;
          for (let i = 1; i <= N; i++) {                 // concentric rings
            const rr = (i / N) * maxR, ring = [];
            for (let s = 0; s <= R; s++) { const a = (s / R) * TAU; ring.push(warpUV(cx0 + Math.cos(a) * rr, cy0 + Math.sin(a) * rr)); }
            out.push(ring);
            fam.push(ring);
          }
          const K = Math.max(6, Math.round(N * 1.4));
          for (let i = 0; i < K; i++) {                  // radial spokes
            const a = (i / K) * TAU, sp = [];
            for (let s = 0; s <= R; s++) { const rr = (s / R) * maxR; sp.push(warpUV(cx0 + Math.cos(a) * rr, cy0 + Math.sin(a) * rr)); }
            out.push(sp);
          }
        } else {                                          // streamlines: integrate the field
          const r = rng((seed >>> 0) * 40503 + 7);
          const count = Math.round(P.lines * 2.2);
          const steps = Math.round(30 + P.streamLen * 160);
          const h = 0.0016 + P.streamLen * 0.004;
          for (let i = 0; i < count; i++) {
            const sx = 0.5 + (r() - 0.5) * 0.94, sy = 0.5 + (r() - 0.5) * 0.94;
            const line = [];
            let x = sx, y = sy;
            for (let s = 0; s < steps; s++) {             // forward
              line.push([x, y]);
              const [du, dv] = field(x, y); const L = Math.hypot(du, dv) + 1e-5;
              x += (du / L) * h; y += (dv / L) * h;
              if (x < -0.3 || x > 1.3 || y < -0.3 || y > 1.3) break;
            }
            x = sx; y = sy; const back = [];
            for (let s = 0; s < steps; s++) {             // backward, for a full streamline
              const [du, dv] = field(x, y); const L = Math.hypot(du, dv) + 1e-5;
              x -= (du / L) * h; y -= (dv / L) * h;
              if (x < -0.3 || x > 1.3 || y < -0.3 || y > 1.3) break;
              back.push([x, y]);
            }
            const full = back.reverse().concat(line);
            if (full.length > 2) out.push(full);
          }
        }
        uvLines = out;
        // Fill bands: the region between each adjacent pair of family lines. Drawn
        // translucent, the sheet's self-overlaps stack alpha and DARKEN — the fold
        // becomes legible as shape, not wireframe. Same-color alpha stacking is
        // order-independent, so no depth sorting is needed. Stored as line PAIRS and
        // filled as per-step quads, NOT one big polygon: a warped band that folds over
        // itself reverses winding, and a single self-intersecting polygon cancels to
        // checkered holes along the crease under any fill rule. Tiny quads keep a
        // consistent local winding, so the union fills solid through the fold.
        // (Streamlines have no ordered family — no bands.)
        uvBands = [];
        if (P.render && P.render !== "lines") {
          for (let i = 0; i < fam.length - 1; i++) uvBands.push([fam[i], fam[i + 1]]);
        }
        buildBreaker();
      }
      // The breaker: one line traced through the SELECTED singularity, warped like the
      // rest of the sheet but projected with extra plunge (see place's zBoost) — the
      // waveform that breaks through the membrane.
      function buildBreaker() {
        if (!P.breaker || !pts.length) { breakerUV = null; return; }
        const R = Math.max(60, Math.round(P.res));
        const m = pts[lastTouched] || pts[0];
        const line = [];
        for (let s = 0; s <= R; s++) line.push(warpUV(s / R, m.y));
        breakerUV = line;
      }

      // ---- mask (logomark frame) ----------------------------------------------
      // Returns a Path2D (canvas) or a d-string (svg) at the given dimension, plus
      // whether it needs even-odd fill (for the ring annulus).
      function maskShape(dim, forSvg) {
        const c = dim / 2, F = dim * 0.9, rad = F / 2;
        const kind = P.mask;
        if (kind === "none") return null;
        const arc = (cx, cy, rr, from, to, sweep) => forSvg
          ? `M ${(cx + Math.cos(from) * rr).toFixed(1)} ${(cy + Math.sin(from) * rr).toFixed(1)} A ${rr} ${rr} 0 ${Math.abs(to - from) > Math.PI ? 1 : 0} ${sweep} ${(cx + Math.cos(to) * rr).toFixed(1)} ${(cy + Math.sin(to) * rr).toFixed(1)}`
          : null;
        if (forSvg) {
          if (kind === "circle") return { d: `M ${c - rad} ${c} a ${rad} ${rad} 0 1 0 ${rad * 2} 0 a ${rad} ${rad} 0 1 0 ${-rad * 2} 0`, evenodd: false };
          if (kind === "ring") { const ir = rad * P.inner;
            return { d: `M ${c - rad} ${c} a ${rad} ${rad} 0 1 0 ${rad * 2} 0 a ${rad} ${rad} 0 1 0 ${-rad * 2} 0 Z M ${c - ir} ${c} a ${ir} ${ir} 0 1 1 ${ir * 2} 0 a ${ir} ${ir} 0 1 1 ${-ir * 2} 0 Z`, evenodd: true }; }
          if (kind === "square") { const s = F * 0.5, o = c - s, k = F * 0.14;
            return { d: `M ${o + k} ${o} h ${s * 2 - 2 * k} q ${k} 0 ${k} ${k} v ${s * 2 - 2 * k} q 0 ${k} ${-k} ${k} h ${-(s * 2 - 2 * k)} q ${-k} 0 ${-k} ${-k} v ${-(s * 2 - 2 * k)} q 0 ${-k} ${k} ${-k} Z`, evenodd: false }; }
          // lens / vesica: intersection of two circles offset horizontally
          const off = rad * (0.6 + 0.4 * (1 - P.inner)); const cr = rad * 1.15;
          const ay = Math.acos(clamp01(off / cr));
          return { d: `${arc(c - off, c, cr, -ay, ay, 1)} ${arc(c + off, c, cr, Math.PI - ay, Math.PI + ay, 1)} Z`, evenodd: false };
        }
        const path = new Path2D();
        if (kind === "circle") path.arc(c, c, rad, 0, TAU);
        else if (kind === "ring") { path.arc(c, c, rad, 0, TAU); path.arc(c, c, rad * P.inner, 0, TAU, true); }
        else if (kind === "square") { const s = F * 0.5, k = F * 0.14; roundRect(path, c - s, c - s, s * 2, s * 2, k); }
        else { const off = rad * (0.6 + 0.4 * (1 - P.inner)), cr = rad * 1.15, ay = Math.acos(clamp01(off / cr));
          path.arc(c - off, c, cr, -ay, ay); path.arc(c + off, c, cr, Math.PI - ay, Math.PI + ay); path.closePath(); }
        return { path, evenodd: kind === "ring" };
      }
      function roundRect(path, x, y, w, h, r) {
        path.moveTo(x + r, y); path.arcTo(x + w, y, x + w, y + h, r); path.arcTo(x + w, y + h, x, y + h, r);
        path.arcTo(x, y + h, x, y, r); path.arcTo(x, y, x + w, y, r); path.closePath();
      }
      const mapUV = (uv, dim) => { const F = dim * 0.9, o = dim * 0.05; return [o + uv[0] * F, o + uv[1] * F]; };

      // ---- canvas render -------------------------------------------------------
      function lineColor() { return P.accent && colors.length ? colors[0] : ink; }
      function draw(showHandles) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const rect = host.getBoundingClientRect();
        const size = Math.max(1, Math.min(rect.width, rect.height || rect.width));
        if (canvas.width !== Math.round(size * dpr)) { canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr); }
        g2.setTransform(dpr, 0, 0, dpr, 0, 0);
        g2.clearRect(0, 0, size, size);
        g2.fillStyle = ground; g2.fillRect(0, 0, size, size);
        g2.save();
        const mask = maskShape(size, false);
        if (mask) g2.clip(mask.path, mask.evenodd ? "evenodd" : "nonzero");
        g2.strokeStyle = lineColor(); g2.globalAlpha = P.opacity; g2.lineWidth = P.weight;
        g2.lineJoin = "round"; g2.lineCap = "round";
        // midpoint-quadratic smoothing: pass through segment midpoints with each sample
        // as the control point — no visible facets even where the warp is violent.
        const trace = (pl, size) => {
          const n = pl.length;
          if (n < 2) return;
          const [x0, y0] = mapUV(pl[0], size);
          g2.moveTo(x0, y0);
          for (let i = 1; i < n - 1; i++) {
            const [cx, cy] = mapUV(pl[i], size);
            const [nx, ny] = mapUV(pl[i + 1], size);
            g2.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
          }
          const [xe, ye] = mapUV(pl[n - 1], size);
          g2.lineTo(xe, ye);
        };
        const proj = projectAll(); lastFit = proj.fit;
        const hasFill = proj.bands && proj.bands.length;
        if (hasFill) {
          // one path per band, one subpath per step-quad: quads only share edges, so a
          // single fill unions them seamlessly — and the fold can't cancel to holes
          const quadBand = (A, B) => {
            const n = Math.min(A.length, B.length);
            for (let s = 0; s + 1 < n; s++) {
              const [ax, ay] = mapUV(A[s], size), [ax2, ay2] = mapUV(A[s + 1], size);
              const [bx2, by2] = mapUV(B[s + 1], size), [bx, by] = mapUV(B[s], size);
              g2.moveTo(ax, ay); g2.lineTo(ax2, ay2); g2.lineTo(bx2, by2); g2.lineTo(bx, by); g2.closePath();
            }
          };
          const fillPass = (stride) => {
            for (let bi = 0; bi < proj.bands.length; bi += stride) {
              const [A, B] = proj.bands[bi];
              g2.beginPath(); quadBand(A, B); g2.fill();
            }
          };
          g2.fillStyle = lineColor(); g2.globalAlpha = P.fillOpacity;
          fillPass(1);
          if (P.moire > 0) {
            // intentional moiré: a STRIPED ghost (every other band — solid fills have
            // no period to interfere with) rotated AND scaled a touch about center, so
            // its stripes beat against the base structure instead of echoing it
            const c = size / 2, k = 1 + P.moire * 0.05;
            g2.save();
            g2.translate(c, c); g2.rotate(P.moire * 0.1); g2.scale(k, k); g2.translate(-c, -c);
            g2.globalAlpha = P.fillOpacity * 0.7;
            fillPass(2);
            g2.restore();
          }
          g2.globalAlpha = P.opacity;
        }
        if (P.render !== "fill" || !hasFill) {           // "fill" hides the wireframe (bands only)
          g2.beginPath();
          for (const pl of proj.plines) trace(pl, size);
          g2.stroke();
        }
        if (proj.breaker) {
          g2.globalAlpha = 1; g2.lineWidth = P.breakWeight;
          g2.strokeStyle = colors.length ? colors[0] : ink;
          g2.beginPath();
          trace(proj.breaker, size);
          g2.stroke();
        }
        g2.restore();
        if (showHandles && P.handles) drawHandles(size);
      }
      function drawHandles(size) {
        pts.forEach((m, i) => {
          const [x, y] = mapUV(lastFit(place(warpUV(m.x, m.y))), size);   // sit on the projected funnel
          g2.globalAlpha = 1; g2.lineWidth = 2;
          g2.strokeStyle = m.type === "vortex" ? "#c9a24a" : m.type === "twist" ? "#a04a3a" : "#3a6b5f";
          g2.fillStyle = i === lastTouched ? g2.strokeStyle : "rgba(255,255,255,.85)";
          g2.beginPath(); g2.arc(x, y, 7, 0, TAU); g2.fill(); g2.stroke();
          if (m.type === "vortex") { g2.beginPath(); g2.arc(x, y, 7, -Math.PI / 2, Math.PI / 2); g2.fillStyle = g2.strokeStyle; g2.fill(); }
          if (m.type === "twist") {                     // axis tick through the dot — the fold line
            const ac = Math.cos(m.a || 0), as = Math.sin(m.a || 0);
            g2.beginPath(); g2.moveTo(x - ac * 13, y - as * 13); g2.lineTo(x + ac * 13, y + as * 13); g2.stroke();
          }
        });
      }

      function rebuild(regen) {
        if (regen) makePoints();
        buildLines(); draw(true);
      }
      rebuild(true);

      const ro = new ResizeObserver(() => draw(true)); ro.observe(host);

      // ---- pointer: drag singularities ----------------------------------------
      let dragging = -1;
      const uvAt = (e) => { const r = canvas.getBoundingClientRect(); const size = Math.min(r.width, r.height); const F = size * 0.9, o = size * 0.05; return [((e.clientX - r.left) - o) / F, ((e.clientY - r.top) - o) / F]; };
      const hit = (e) => {
        const r = canvas.getBoundingClientRect(); const size = Math.min(r.width, r.height);
        let best = -1, bd = 16;
        pts.forEach((m, i) => { const [hx, hy] = mapUV(lastFit(place(warpUV(m.x, m.y))), size); const d = Math.hypot(e.clientX - r.left - hx, e.clientY - r.top - hy); if (d < bd) { bd = d; best = i; } });
        return best;
      };
      let lastUV = null;
      const onDown = (e) => {
        if (!P.handles) return;
        const i = hit(e);
        if (i >= 0) { dragging = i; lastTouched = i; lastUV = uvAt(e); canvas.setPointerCapture?.(e.pointerId); notifySel(); if (P.breaker) buildBreaker(); draw(true); }
      };
      const onMove = (e) => {
        if (dragging < 0) return;
        // delta drag — under tilt/perspective the cursor's absolute UV no longer maps
        // 1:1 onto the sheet, but relative motion still feels exact.
        const [u, v] = uvAt(e);
        pts[dragging].x = clamp01(pts[dragging].x + (u - lastUV[0]));
        pts[dragging].y = clamp01(pts[dragging].y + (v - lastUV[1]));
        lastUV = [u, v];
        buildLines(); draw(true);
      };
      const onUp = () => { dragging = -1; };
      const onContext = (e) => {                 // right-click removes the point under the cursor
        if (!P.handles) return; const i = hit(e); if (i >= 0 && pts.length > 1) { e.preventDefault(); pts.splice(i, 1); lastTouched = 0; notifySel(); buildLines(); draw(true); }
      };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointerleave", onUp);
      canvas.addEventListener("contextmenu", onContext);

      // ---- vector SVG (same warped polylines, same clip) ----------------------
      function snapshotSVG() {
        const col = lineColor();
        const mask = maskShape(STAGE, true);
        const proj = projectAll();
        const hasFill = proj.bands && proj.bands.length;
        let paths = "";
        if (hasFill) {
          // same per-step quads as the live view (see draw): subpaths union under
          // nonzero without the fold cancelling to checkered holes
          const q = (pt) => { const [x, y] = mapUV(pt, STAGE); return `${x.toFixed(1)} ${y.toFixed(1)}`; };
          const bandD = ([A, B]) => {
            const n = Math.min(A.length, B.length);
            let d = "";
            for (let s = 0; s + 1 < n; s++) d += `M ${q(A[s])} L ${q(A[s + 1])} L ${q(B[s + 1])} L ${q(B[s])} Z `;
            return d.trim();
          };
          const bandPaths = (op, stride) => proj.bands.filter((_, bi) => bi % stride === 0).map((b) =>
            `<path d="${bandD(b)}" fill="${col}" fill-opacity="${op}" fill-rule="nonzero" stroke="none"/>`).join("");
          paths += bandPaths(P.fillOpacity, 1);
          if (P.moire > 0) {
            // striped ghost, rotated + scaled about center — see draw()
            const c = STAGE / 2, deg = (P.moire * 0.1 * 180 / Math.PI).toFixed(2), k = (1 + P.moire * 0.05).toFixed(3);
            paths += `<g transform="translate(${c} ${c}) rotate(${deg}) scale(${k}) translate(${-c} ${-c})">${bandPaths(P.fillOpacity * 0.7, 2)}</g>`;
          }
        }
        if (P.render !== "fill" || !hasFill) {
          paths += proj.plines.map((ln) => {
            // Catmull-Rom → cubic Bézier, same smoothing family as the live view: the
            // exported vector is genuinely smooth curves, not faceted polylines.
            const d = smoothPath(ln.map((pt) => { const [x, y] = mapUV(pt, STAGE); return { x, y }; }), { tension: 0.5 });
            return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${P.weight}" stroke-opacity="${P.opacity}" stroke-linejoin="round" stroke-linecap="round"/>`;
          }).join("");
        }
        if (proj.breaker && proj.breaker.length > 1) {
          const bcol = colors.length ? colors[0] : ink;
          const d = smoothPath(proj.breaker.map((pt) => { const [x, y] = mapUV(pt, STAGE); return { x, y }; }), { tension: 0.5 });
          paths += `<path d="${d}" fill="none" stroke="${bcol}" stroke-width="${P.breakWeight}" stroke-linejoin="round" stroke-linecap="round"/>`;
        }
        if (!mask) return paths;
        const cid = "warpclip";
        return `<defs><clipPath id="${cid}"><path d="${mask.d}" clip-rule="${mask.evenodd ? "evenodd" : "nonzero"}"/></clipPath></defs><g clip-path="url(#${cid})">${paths}</g>`;
      }

      function thumb() {
        draw(false);
        const t = document.createElement("canvas"); t.width = t.height = 96;
        t.getContext("2d").drawImage(canvas, 0, 0, 96, 96); draw(true);
        return t.toDataURL("image/png");
      }
      engine._active = {
        mutate() { const r = rng((seed * 7 + pts.length * 131 + lastTouched) >>> 0); pts.forEach((m) => { m.x = clamp01(m.x + (r() - 0.5) * 0.18); m.y = clamp01(m.y + (r() - 0.5) * 0.18); m.s *= 0.8 + 0.4 * r(); if (m.type === "twist") m.a = (m.a || 0) + (r() - 0.5) * 0.7; }); buildLines(); draw(true); },
        addPoint() { if (pts.length >= 8) return; pts.push({ x: 0.5, y: 0.5, type: "well", s: -0.9, dz: 1 }); lastTouched = pts.length - 1; notifySel(); buildLines(); draw(true); },
        flipType() {
          const m = pts[lastTouched]; if (!m) return;
          m.type = m.type === "well" ? "vortex" : m.type === "vortex" ? "twist" : "well";   // ○ → ◐ → ⌁ → ○
          if (m.type === "twist" && m.a === undefined) m.a = 0;
          m.s = (m.type === "well" ? -1 : 1) * Math.max(0.7, Math.abs(m.s));
          buildLines(); draw(true);
        },
        setSelDepth(v) { const m = pts[lastTouched]; if (!m) return; m.dz = v; draw(true); },   // z is applied at projection — no rebuild needed
        makeWells() {
          pts.forEach((m) => { if (m.type !== "well") { m.type = "well"; m.s = -Math.max(0.7, Math.abs(m.s)); } });
          if (pts.length === 1) { pts[0].x = 0.5; pts[0].y = 0.52; }   // single-point marks read best centered
          buildLines(); draw(true);
        },
        bankPose() {
          engine._poses.unshift({ thumb: thumb(), seed, pts: pts.map((m) => ({ ...m })), params: { ...P } });
          engine._poses = engine._poses.slice(0, 12);
        },
        restore(pose) { seed = pose.seed; pts = pose.pts.map((m) => ({ ...m })); Object.assign(P, pose.params); pointsParam = Math.round(P.points); lastTouched = 0; notifySel(); buildLines(); draw(true); },
      };

      return {
        viewBox: `0 0 ${STAGE} ${STAGE}`,
        update(nc) {
          const reseed = nc.seed !== seed;
          P = nc.params; colors = nc.colors; ink = nc.ink; ground = nc.ground;
          // Regenerate points only when the seed OR the Singularities slider itself
          // changes — never because pts.length drifted from a manual add/delete
          // (that comparison used to resurrect right-click-deleted points on any tweak).
          if (reseed) { seed = nc.seed; pointsParam = Math.round(P.points); rebuild(true); }
          else if (Math.round(P.points) !== pointsParam) { pointsParam = Math.round(P.points); makePoints(); buildLines(); draw(true); }
          else { buildLines(); draw(true); }
        },
        snapshotSVG,
        snapshotCanvas() { draw(false); setTimeout(() => draw(true), 0); return canvas; },   // clean read now, handles back after
        destroy() {
          ro.disconnect();
          canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointerleave", onUp);
          canvas.removeEventListener("contextmenu", onContext);
          canvas.remove(); engine._active = null;
        },
      };
    },
  };
  return engine;
})();
