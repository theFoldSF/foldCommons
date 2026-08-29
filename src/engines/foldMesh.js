// foldMesh.js — the identity's core mark language, ported whole from the
// brand studio's Warp Lab: a sheet of space warped by seeded singularities
// (gravity wells that pinch, vortices that swirl, twists that flip the plane
// like a ribbon), given real depth by funnels in z, tilted and projected.
// Four line families (lattice / contours / polar / streamlines) and four
// renders (wireframe / translucent fills / both / dithered grain). The
// projection normalizes to the slot, so the mark always sits centered and
// bounded — it cannot spill. Pure deterministic SVG.
import { rng, smoothPath, round, clamp } from "./util.js";

const TAU = Math.PI * 2;
const SUB = 3;
const RES = 84;

export default {
  id: "mesh",
  label: "Fold mesh",
  blurb:
    "The Warp Lab language: a sheet pinched by wells, swirled by vortices, flipped by ribbon twists — as wireframe, translucent folds, or photographic grain.",
  params: [
    { key: "field", label: "Field (0 lattice · 1 contours · 2 polar · 3 streams)", min: 0, max: 3, step: 1, default: 0 },
    { key: "render", label: "Render (0 lines · 1 fills · 2 both · 3 grain)", min: 0, max: 3, step: 1, default: 0 },
    { key: "lines", label: "Line count", min: 5, max: 48, step: 1, default: 18 },
    { key: "warp", label: "Warp depth", min: 0.1, max: 1.2, step: 0.01, default: 0.75 },
    { key: "radius", label: "Well radius", min: 0.08, max: 0.3, step: 0.01, default: 0.24 },
    { key: "swirl", label: "Vortex swirl", min: 0, max: 2.5, step: 0.01, default: 1 },
    { key: "depth", label: "Funnel depth", min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: "tilt", label: "View tilt", min: 0, max: 1.3, step: 0.01, default: 0.5 },
    { key: "persp", label: "Perspective", min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: "sing", label: "Singularities", min: 1, max: 5, step: 1, default: 3 },
    { key: "weight", label: "Line weight", min: 0.5, max: 3, step: 0.05, default: 1.2 },
    { key: "grain", label: "Grain density", min: 0.4, max: 1.6, step: 0.05, default: 1 },
  ],

  render({ w, h, p, colors, ink, seed }) {
    const r = rng((seed >>> 0) * 2654435761 >>> 0);
    const col = colors[0] || ink;
    const N = Math.round(p.lines);
    const field = Math.round(p.field);
    const mode = Math.round(p.render);

    // seeded singularities — wells pull in, vortices swirl, twists fold over
    const pts = [];
    for (let i = 0; i < Math.round(p.sing); i++) {
      const roll = r();
      const type = roll < 0.45 ? "well" : roll < 0.8 ? "vortex" : "twist";
      pts.push({
        x: 0.2 + 0.6 * r(),
        y: 0.2 + 0.6 * r(),
        type,
        s: (type === "well" ? -1 : 1) * (0.5 + 0.8 * r()),
        a: r() * Math.PI,
      });
    }

    // smooth space deformation: rotations + clamped radial scales can bunch
    // lines but never tear them (Warp Lab's logomark-quality guarantee)
    const warpUV = (u, v) => {
      let x = u, y = v;
      const rad = p.radius;
      for (let s = 0; s < SUB; s++) {
        let dx = 0, dy = 0;
        for (const m of pts) {
          if (m.type === "twist") continue;
          const vx = x - m.x, vy = y - m.y;
          const g = Math.exp(-(vx * vx + vy * vy) / (2 * rad * rad));
          if (m.type === "vortex") {
            const ang = (m.s * p.swirl * 2.2 * g) / SUB;
            const ca = Math.cos(ang), sa = Math.sin(ang);
            dx += vx * ca - vy * sa - vx;
            dy += vx * sa + vy * ca - vy;
          } else {
            const k = Math.max(-0.94, Math.min(0.94, m.s * p.warp * g)) / SUB;
            dx += vx * k;
            dy += vy * k;
          }
        }
        x += dx;
        y += dy;
      }
      // ribbon twists: rotate about an in-plane axis — the sheet pinches
      // edge-on at the point and comes out mirrored, carrying real z
      let zt = 0;
      for (const m of pts) {
        if (m.type !== "twist") continue;
        const axc = Math.cos(m.a), axs = Math.sin(m.a);
        const vx = x - m.x, vy = y - m.y;
        const along = vx * axc + vy * axs;
        const q = -vx * axs + vy * axc;
        const ramp = 0.5 * (1 + Math.tanh(along / (p.radius * 0.55)));
        const win = Math.exp(-(q * q) / (2 * Math.pow(p.radius * 1.7, 2)));
        const phi = m.s * Math.PI * ramp * win;
        const q2 = q * Math.cos(phi);
        zt += q * Math.sin(phi) * (0.35 + 0.65 * p.depth);
        x = m.x + axc * along - axs * q2;
        y = m.y + axs * along + axc * q2;
      }
      return [x, y, zt];
    };

    // funnels in z — what lets the sheet genuinely fold over itself
    const zAt = (x, y) => {
      let z = 0;
      const rz = p.radius * 0.72;
      for (const m of pts) {
        if (m.type === "twist") continue;
        const dx = x - m.x, dy = y - m.y;
        const g = Math.exp(-(dx * dx + dy * dy) / (2 * rz * rz));
        z -= Math.abs(m.s) * p.depth * 0.9 * g * (m.type === "vortex" ? 0.85 : 1);
      }
      return z;
    };

    const place = (pt) => {
      const z = zAt(pt[0], pt[1]) + (pt[2] || 0);
      const cx = pt[0] - 0.5, cy = pt[1] - 0.5;
      const ct = Math.cos(p.tilt), st = Math.sin(p.tilt);
      const y2 = cy * ct - z * st;
      const z2 = cy * st + z * ct;
      const f = 1 / Math.max(0.2, 1 + z2 * p.persp * 1.1);
      return [0.5 + cx * f, 0.5 + y2 * f];
    };

    // velocity field, used only to trace streamlines
    const fieldVec = (u, v) => {
      let du = 0, dv = 0;
      for (const m of pts) {
        const vx = u - m.x, vy = v - m.y, d = Math.hypot(vx, vy) + 1e-4;
        const g = Math.exp(-(d * d) / (2 * p.radius * p.radius)) * m.s;
        if (m.type === "vortex") {
          du += (-vy / d) * g * p.swirl + (vx / d) * g * -0.35;
          dv += (vx / d) * g * p.swirl + (vy / d) * g * -0.35;
        } else if (m.type === "twist") {
          const axc = Math.cos(m.a), axs = Math.sin(m.a);
          const q = -vx * axs + vy * axc;
          const sh = Math.tanh(q / (p.radius * 0.6)) * g;
          du += axc * sh;
          dv += axs * sh;
        } else {
          du += (vx / d) * g;
          dv += (vy / d) * g;
        }
      }
      return [du, dv];
    };

    // ---- build warped polylines in UV space --------------------------------
    const uvLines = [];
    const fam = []; // ordered family — adjacent pairs become fill bands
    if (field === 0) {
      for (let i = 0; i <= N; i++) {
        const c = i / N, hl = [], vl = [];
        for (let s = 0; s <= RES; s++) {
          const t = s / RES;
          hl.push(warpUV(t, c));
          vl.push(warpUV(c, t));
        }
        uvLines.push(hl, vl);
        fam.push(hl);
      }
    } else if (field === 1) {
      for (let i = 0; i <= N; i++) {
        const c = i / N, hl = [];
        for (let s = 0; s <= RES; s++) hl.push(warpUV(s / RES, c));
        uvLines.push(hl);
        fam.push(hl);
      }
    } else if (field === 2) {
      for (let i = 1; i <= N; i++) {
        const rr = (i / N) * 0.5, ring = [];
        for (let s = 0; s <= RES; s++) {
          const a = (s / RES) * TAU;
          ring.push(warpUV(0.5 + Math.cos(a) * rr, 0.5 + Math.sin(a) * rr));
        }
        uvLines.push(ring);
        fam.push(ring);
      }
      const K = Math.max(6, Math.round(N * 1.4));
      for (let i = 0; i < K; i++) {
        const a = (i / K) * TAU, sp = [];
        for (let s = 0; s <= RES; s++) {
          const rr = (s / RES) * 0.5;
          sp.push(warpUV(0.5 + Math.cos(a) * rr, 0.5 + Math.sin(a) * rr));
        }
        uvLines.push(sp);
      }
    } else {
      const count = Math.round(N * 2.2);
      const steps = 118;
      const hstep = 0.0038;
      for (let i = 0; i < count; i++) {
        const sx = 0.5 + (r() - 0.5) * 0.94, sy = 0.5 + (r() - 0.5) * 0.94;
        const fwd = [];
        let x = sx, y = sy;
        for (let s = 0; s < steps; s++) {
          fwd.push(warpUVPass(x, y));
          const [du, dv] = fieldVec(x, y);
          const L = Math.hypot(du, dv) + 1e-5;
          x += (du / L) * hstep;
          y += (dv / L) * hstep;
          if (x < -0.3 || x > 1.3 || y < -0.3 || y > 1.3) break;
        }
        x = sx; y = sy;
        const back = [];
        for (let s = 0; s < steps; s++) {
          const [du, dv] = fieldVec(x, y);
          const L = Math.hypot(du, dv) + 1e-5;
          x -= (du / L) * hstep;
          y -= (dv / L) * hstep;
          if (x < -0.3 || x > 1.3 || y < -0.3 || y > 1.3) break;
          back.push(warpUVPass(x, y));
        }
        const full = back.reverse().concat(fwd);
        if (full.length > 2) uvLines.push(full);
      }
      function warpUVPass(u, v) {
        return [u, v, 0]; // streamlines already live in the field; no re-warp
      }
    }

    const uvBands = [];
    if (mode === 1 || mode === 2) {
      for (let i = 0; i < fam.length - 1; i++) uvBands.push([fam[i], fam[i + 1]]);
    }

    // dither: sample the sheet, light it, stipple — density is tone
    const ditherUV = [];
    if (mode === 3) {
      const RD = 108;
      const rr = rng((seed >>> 0) * 40503 + 77);
      const eps = 1 / RD;
      const zOf = (q) => zAt(q[0], q[1]) + (q[2] || 0);
      const Lx = -0.42, Ly = -0.55, Lz = 0.72;
      const Ln = Math.hypot(Lx, Ly, Lz);
      for (let j = 0; j <= RD; j++) {
        for (let i = 0; i <= RD; i++) {
          const u = i / RD + (rr() - 0.5) * eps, v = j / RD + (rr() - 0.5) * eps;
          if (u < 0 || u > 1 || v < 0 || v > 1) continue;
          const q = warpUV(u, v);
          const z = zOf(q);
          const sx = (zOf(warpUV(u + eps, v)) - z) / eps;
          const sy = (zOf(warpUV(u, v + eps)) - z) / eps;
          const nx = -sx * 1.5, ny = -sy * 1.5, nz = 1;
          const lam = Math.max(0, (nx * Lx + ny * Ly + nz * Lz) / (Math.hypot(nx, ny, nz) * Ln));
          const darkness = Math.pow(Math.max(0, Math.min(1, 1 - lam * 0.92)), 1.25);
          if (rr() < darkness * p.grain * 0.8) ditherUV.push(q);
        }
      }
    }

    // ---- project + normalize into the slot (bounded by construction) -------
    const raw = uvLines.map((ln) => ln.map(place));
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const ln of raw)
      for (const [x, y] of ln) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    const pad = Math.min(w, h) * 0.06;
    const s = Math.min((w - pad * 2) / Math.max(1e-6, maxX - minX), (h - pad * 2) / Math.max(1e-6, maxY - minY));
    const ox = (w - s * (maxX - minX)) / 2 - s * minX;
    const oy = (h - s * (maxY - minY)) / 2 - s * minY;
    const fit = (q) => [q[0] * s + ox, q[1] * s + oy];
    const plines = raw.map((ln) => ln.map(fit));

    const wgt = p.weight * (Math.min(w, h) / 700);
    let out = "";
    if (uvBands.length) {
      // per-step quads so the fold can't cancel to checkered holes
      const bandD = ([A, B]) => {
        const a = A.map((q) => fit(place(q)));
        const b = B.map((q) => fit(place(q)));
        const n = Math.min(a.length, b.length);
        let d = "";
        for (let i = 0; i + 1 < n; i++)
          d += `M${round(a[i][0])} ${round(a[i][1])}L${round(a[i + 1][0])} ${round(a[i + 1][1])}L${round(b[i + 1][0])} ${round(b[i + 1][1])}L${round(b[i][0])} ${round(b[i][1])}Z`;
        return d;
      };
      for (const band of uvBands)
        out += `<path d="${bandD(band)}" fill="${col}" fill-opacity="0.26" fill-rule="nonzero" stroke="none"/>`;
    }
    if (ditherUV.length) {
      const ds = Math.max(1, wgt * 1.6);
      let d = "";
      for (const q of ditherUV) {
        const [x, y] = fit(place(q));
        d += `M${round(x)} ${round(y)}h0`;
      }
      out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${round(ds)}" stroke-linecap="round" stroke-opacity="0.9"/>`;
    }
    if (mode === 0 || mode === 2) {
      for (const ln of plines) {
        const d = smoothPath(ln.map(([x, y]) => ({ x, y })), { tension: 0.5 });
        out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${round(wgt)}" stroke-linejoin="round" stroke-linecap="round"/>`;
      }
    }
    return `<g>${out}</g>`;
  },
};
