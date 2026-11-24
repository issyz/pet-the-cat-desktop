import { alphaMap, compile, loadImage, shadowMask, texture } from "./gl";
import { assetUrl } from "./cats";

const BASIC_VS = `#version 300 es
in vec2 a_pos; in vec2 a_uv;
uniform vec2 u_res;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  vec2 c = a_pos / u_res * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;

const BASIC_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec4 u_color;
uniform vec3 u_tint;
uniform int u_shadow;
out vec4 o;
void main() {
  vec4 t = texture(u_tex, v_uv);
  if (u_shadow == 1) o = vec4(u_color.rgb * u_color.a, u_color.a) * t.a;
  else o = vec4(t.rgb * u_tint, t.a) * u_color.a;
}`;

const BODY_VS = `#version 300 es
in vec2 a_uv;
uniform vec2 u_res;
uniform vec4 u_rect;
uniform sampler2D u_nap;
uniform float u_time;
uniform float u_disp;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  vec4 n = texture(u_nap, a_uv);
  vec2 d = n.rg * 2.0 - 1.0;
  vec2 p = a_uv;
  float breathe = sin(u_time * 1.9) * 0.014 * max(0.0, 1.0 - abs(a_uv.x - 0.6) * 1.4);
  p.y = 0.5 + (p.y - 0.5) * (1.0 + breathe);
  vec2 pos = u_rect.xy + p * u_rect.zw + d * u_disp;
  vec2 c = pos / u_res * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;

const BODY_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_nap;
uniform vec3 u_tint;
uniform vec2 u_comb;
out vec4 o;
vec3 unpremul(vec4 c, vec3 fallback) { return c.a > 0.01 ? c.rgb / c.a : fallback; }
void main() {
  vec4 n = texture(u_nap, v_uv);
  vec2 d = n.rg * 2.0 - 1.0;
  float press = n.b;
  float len = length(d);
  vec4 base = texture(u_tex, v_uv);
  vec2 off = d * u_comb;
  vec4 comb = (texture(u_tex, v_uv - off) + texture(u_tex, v_uv - off * 2.0)) * 0.5;
  vec3 baseC = unpremul(base, vec3(0.0));
  vec3 col = mix(baseC, unpremul(comb, baseC), clamp(comb.a * 1.2, 0.0, 1.0) * smoothstep(0.0, 0.2, len));
  float sheen = dot(d, vec2(0.8, 0.6));
  col *= 1.0 + 0.16 * sheen - 0.14 * press;
  o = vec4(col * u_tint * base.a, base.a);
}`;

const NX = 96;
const NY = 40;
const GX = 56;
const GY = 24;
const TAIL_SEGMENTS = 48;

interface CatAssets {
  body: WebGLTexture;
  tail: WebGLTexture;
  bodyShadow: WebGLTexture;
  bodyShadowPad: [number, number];
  bodyAspect: number;
  tailAspect: number;
  alpha: (u: number, v: number) => number;
}

type Mode = "idle" | "pet" | "tail";
type Vec = { x: number; y: number };

interface AutoStroke {
  kind: "back" | "tail";
  t: number;
  duration: number;
}

export interface SceneOptions {
  onReady?: () => void;
  onError?: (err: unknown) => void;
}

export class Scene {
  private gl: WebGL2RenderingContext;
  private basic: WebGLProgram;
  private bodyProg: WebGLProgram;
  private quadBuf: WebGLBuffer;
  private gridBuf: WebGLBuffer;
  private gridIdx: WebGLBuffer;
  private gridCount: number;
  private napTex: WebGLTexture;
  private nap = new Float32Array(NX * NY * 3);
  private napBytes = new Uint8Array(NX * NY * 4);
  private room?: { tex: WebGLTexture; aspect: number };
  private hand?: { tex: WebGLTexture; shadow: WebGLTexture; pad: [number, number]; aspect: number };
  private cats = new Map<string, Promise<CatAssets>>();
  private cat?: CatAssets;
  private catId = "";
  private w = 1;
  private h = 1;
  private time = 0;
  private last = 0;
  private pointer: Vec & { inside: boolean; down: boolean } = { x: 0, y: 0, inside: false, down: false };
  private mode: Mode = "idle";
  private handAlpha = 0;
  private handPress = 0;
  private energy = 0;
  private tailPull = { w: 0, v: 0, s0: 0.6, tip: { x: 0, y: 0 } as Vec };
  private tailPoints: Vec[] = [];
  private auto?: AutoStroke;
  private sizeF = 1;
  private widthF = 1;
  private dark = false;
  private opts: SceneOptions;

  constructor(private canvas: HTMLCanvasElement, opts: SceneOptions = {}) {
    this.opts = opts;
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: true });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    this.basic = compile(gl, BASIC_VS, BASIC_FS);
    this.bodyProg = compile(gl, BODY_VS, BODY_FS);
    this.quadBuf = gl.createBuffer()!;

    const uv: number[] = [];
    const idx: number[] = [];
    for (let y = 0; y <= GY; y++)
      for (let x = 0; x <= GX; x++) {
        uv.push(x / GX, y / GY);
        if (x < GX && y < GY) {
          const n = y * (GX + 1) + x;
          idx.push(n, n + 1, n + GX + 1, n + 1, n + GX + 2, n + GX + 1);
        }
      }
    this.gridBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    this.gridIdx = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.gridIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    this.gridCount = idx.length;

    this.napTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.napTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.uploadNap();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  async init(catId: string) {
    const gl = this.gl;
    const [room, hand] = await Promise.all([loadImage(assetUrl("room")), loadImage(assetUrl("hand"))]);
    this.room = { tex: texture(gl, room), aspect: room.width / room.height };
    const hs = shadowMask(hand, 10);
    this.hand = { tex: texture(gl, hand), shadow: texture(gl, hs.canvas), pad: [hs.pad, hs.padY], aspect: hand.width / hand.height };
    await this.setCat(catId);
  }

  async setCat(id: string) {
    this.catId = id;
    const assets = await this.loadCat(id);
    if (this.catId !== id) return;
    this.cat = assets;
    this.nap.fill(0);
    this.opts.onReady?.();
  }

  preload(ids: string[]) {
    ids.reduce((p, id) => p.then(() => this.loadCat(id).then(() => undefined, () => undefined)), Promise.resolve());
  }

  setProportions(size: number, width: number) {
    this.sizeF = 0.75 + size * 0.05;
    this.widthF = 0.8 + width * 0.04;
  }

  setDark(dark: boolean) {
    this.dark = dark;
  }

  get purrLevel() {
    return Math.min(1, this.energy * 1.6);
  }

  strokeBack() {
    this.auto = { kind: "back", t: 0, duration: 1.6 };
  }

  strokeTail() {
    this.auto = { kind: "tail", t: 0, duration: 1.8 };
  }

  private loadCat(id: string) {
    let p = this.cats.get(id);
    if (!p) {
      p = (async () => {
        const [body, tail] = await Promise.all([loadImage(assetUrl(id)), loadImage(assetUrl(`${id}-tail`))]);
        const gl = this.gl;
        const bs = shadowMask(body, 16);
        return {
          body: texture(gl, body),
          tail: texture(gl, tail),
          bodyShadow: texture(gl, bs.canvas),
          bodyShadowPad: [bs.pad, bs.padY] as [number, number],
          bodyAspect: body.width / body.height,
          tailAspect: tail.width / tail.height,
          alpha: alphaMap(body),
        };
      })();
      p.catch((err) => {
        this.cats.delete(id);
        this.opts.onError?.(err);
      });
      this.cats.set(id, p);
    }
    return p;
  }

  // ---- layout -------------------------------------------------------------

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
  }

  private layout() {
    const cat = this.cat!;
    const bodyW = Math.min(this.w * 0.5, this.h * 0.95) * this.sizeF;
    const bodyH = (bodyW / cat.bodyAspect) * this.widthF;
    const cx = this.w * 0.42;
    const cy = this.h * 0.47;
    const tailLen = bodyW * 0.6;
    return {
      bodyW,
      bodyH,
      left: cx - bodyW / 2,
      top: cy - bodyH / 2,
      base: { x: cx + bodyW * 0.43, y: cy + bodyH * 0.06 },
      tailLen,
      tailT: (tailLen / cat.tailAspect) * 0.95,
    };
  }

  // ---- input --------------------------------------------------------------

  private bindPointer() {
    const c = this.canvas;
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener("pointerenter", (e) => {
      Object.assign(this.pointer, pos(e), { inside: true });
    });
    c.addEventListener("pointerleave", () => {
      if (!this.pointer.down) this.pointer.inside = false;
    });
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      this.auto = undefined;
      this.press(pos(e));
    });
    c.addEventListener("pointermove", (e) => this.move(pos(e)));
    const up = (e: PointerEvent) => {
      this.release();
      if (e.pointerType !== "mouse") this.pointer.inside = false;
    };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
  }

  private press(p: Vec) {
    Object.assign(this.pointer, p, { inside: true, down: true });
    this.mode = "idle";
    if (!this.cat) return;
    const s = this.bodyAlphaAt(p) < 0.5 ? this.tailHit(p) : null;
    if (s !== null) {
      this.mode = "tail";
      this.tailPull.s0 = Math.max(0.35, s);
      this.updateTailTarget(p);
    } else if (this.bodyAlphaAt(p) > 0.4) {
      this.mode = "pet";
    }
  }

  private move(p: Vec) {
    const dx = p.x - this.pointer.x;
    const dy = p.y - this.pointer.y;
    Object.assign(this.pointer, p, { inside: true });
    if (!this.pointer.down || !this.cat) return;
    const L = this.layout();
    if (this.mode === "tail") {
      if (p.x < L.base.x - L.bodyW * 0.04 && this.bodyAlphaAt(p) > 0.5) {
        this.mode = "pet";
      } else {
        this.updateTailTarget(p);
        this.energy = Math.min(1.5, this.energy + Math.hypot(dx, dy) / L.bodyW);
        return;
      }
    }
    if (this.mode === "idle" && this.bodyAlphaAt(p) > 0.4) this.mode = "pet";
    if (this.mode === "pet") this.stroke(p, dx, dy, L);
  }

  private release() {
    this.pointer.down = false;
    this.mode = "idle";
  }

  private bodyAlphaAt(p: Vec) {
    const L = this.layout();
    return this.cat!.alpha((p.x - L.left) / L.bodyW, (p.y - L.top) / L.bodyH);
  }

  private tailHit(p: Vec): number | null {
    const L = this.layout();
    let best = Infinity;
    let at = 0;
    this.tailPoints.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < best) {
        best = d;
        at = i / TAIL_SEGMENTS;
      }
    });
    return best < L.tailT * 0.7 && at > 0.08 ? at : null;
  }

  private updateTailTarget(p: Vec) {
    const L = this.layout();
    const dx = (p.x - L.base.x) / this.tailPull.s0;
    const dy = (p.y - L.base.y) / this.tailPull.s0;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(Math.max(len, L.tailLen * 0.6), L.tailLen * 1.8);
    this.tailPull.tip = { x: L.base.x + (dx / len) * clamped, y: L.base.y + (dy / len) * clamped };
  }

  private stroke(p: Vec, dx: number, dy: number, L: ReturnType<Scene["layout"]>) {
    const speed = Math.hypot(dx, dy);
    if (speed < 0.01) return;
    const cu = (p.x - L.left) / L.bodyW;
    const cv = (p.y - L.bodyW * 0.05 - L.top) / L.bodyH;
    const ru = 0.09;
    const rv = (L.bodyW * 0.08) / L.bodyH;
    const gain = 1 / (L.bodyW * 0.045);
    const x0 = Math.max(0, Math.floor((cu - ru * 2) * NX));
    const x1 = Math.min(NX - 1, Math.ceil((cu + ru * 2) * NX));
    const y0 = Math.max(0, Math.floor((cv - rv * 2) * NY));
    const y1 = Math.min(NY - 1, Math.ceil((cv + rv * 2) * NY));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const u = (x + 0.5) / NX - cu;
        const v = (y + 0.5) / NY - cv;
        const wgt = Math.exp(-((u * u) / (ru * ru) + (v * v) / (rv * rv)));
        if (wgt < 0.02) continue;
        const i = (y * NX + x) * 3;
        let nx = this.nap[i] + dx * gain * wgt;
        let ny = this.nap[i + 1] + dy * gain * wgt;
        const m = Math.hypot(nx, ny);
        if (m > 1) {
          nx /= m;
          ny /= m;
        }
        this.nap[i] = nx;
        this.nap[i + 1] = ny;
        this.nap[i + 2] = Math.max(this.nap[i + 2], wgt);
      }
    this.energy = Math.min(1.5, this.energy + speed / L.bodyW);
  }

  // ---- animation ----------------------------------------------------------

  private runAuto(dt: number) {
    const a = this.auto;
    if (!a || !this.cat) return;
    const L = this.layout();
    a.t += dt;
    const k = Math.min(1, a.t / a.duration);
    const ease = k * k * (3 - 2 * k);
    let p: Vec;
    if (a.kind === "back") {
      p = { x: L.left + L.bodyW * (0.2 + 0.68 * ease), y: L.top + L.bodyH * (0.45 - 0.08 * Math.sin(ease * Math.PI)) + L.bodyW * 0.05 };
    } else {
      const start = this.tailPoints[Math.round(TAIL_SEGMENTS * 0.4)] ?? L.base;
      const end = { x: L.base.x + L.tailLen * 1.45, y: L.base.y + L.tailLen * 0.35 };
      p = { x: start.x + (end.x - start.x) * ease, y: start.y + (end.y - start.y) * ease };
    }
    if (a.t <= dt) this.press(p);
    else this.move(p);
    if (k >= 1) {
      this.release();
      this.auto = undefined;
    }
  }

  private step(dt: number) {
    this.runAuto(dt);
    const decay = Math.exp(-dt / 9);
    const pressDecay = Math.exp(-dt / 0.35);
    for (let i = 0; i < this.nap.length; i += 3) {
      this.nap[i] *= decay;
      this.nap[i + 1] *= decay;
      this.nap[i + 2] *= pressDecay;
    }
    this.uploadNap();
    this.energy *= Math.exp(-dt / 1.6);

    const target = this.pointer.inside ? 1 : 0;
    this.handAlpha += (target - this.handAlpha) * Math.min(1, dt * 10);
    const pressTarget = this.pointer.down ? 1 : 0;
    this.handPress += (pressTarget - this.handPress) * Math.min(1, dt * 14);

    const tp = this.tailPull;
    if (this.mode === "tail") {
      tp.w += (1 - tp.w) * Math.min(1, dt * 18);
      tp.v = 0;
    } else {
      const acc = -70 * tp.w - 7 * tp.v;
      tp.v += acc * dt;
      tp.w += tp.v * dt;
      if (Math.abs(tp.w) < 0.001 && Math.abs(tp.v) < 0.01) tp.w = tp.v = 0;
    }
  }

  private uploadNap() {
    const gl = this.gl;
    const b = this.napBytes;
    for (let i = 0, j = 0; i < this.nap.length; i += 3, j += 4) {
      b[j] = Math.round((this.nap[i] * 0.5 + 0.5) * 255);
      b[j + 1] = Math.round((this.nap[i + 1] * 0.5 + 0.5) * 255);
      b[j + 2] = Math.round(this.nap[i + 2] * 255);
      b[j + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.napTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NX, NY, 0, gl.RGBA, gl.UNSIGNED_BYTE, b);
  }

  private computeTail(L: ReturnType<Scene["layout"]>) {
    const n = TAIL_SEGMENTS;
    const rest: Vec[] = [{ ...L.base }];
    const seg = L.tailLen / n;
    let x = L.base.x;
    let y = L.base.y;
    for (let i = 1; i <= n; i++) {
      const s = i / n;
      const a = 0.12 + 2.7 * Math.pow(s, 1.7) + Math.sin(this.time * 0.9 + s * 2.2) * 0.1 * s;
      x += Math.cos(a) * seg;
      y += Math.sin(a) * seg;
      rest.push({ x, y });
    }
    const w = this.tailPull.w;
    if (Math.abs(w) < 0.0005) return rest;
    const tip = this.tailPull.tip;
    const reach = Math.hypot(tip.x - L.base.x, tip.y - L.base.y);
    const c = { x: L.base.x + Math.cos(0.12) * reach * 0.4, y: L.base.y + Math.sin(0.12) * reach * 0.4 };
    return rest.map((r, i) => {
      const t = i / n;
      const mt = 1 - t;
      const px = mt * mt * L.base.x + 2 * mt * t * c.x + t * t * tip.x;
      const py = mt * mt * L.base.y + 2 * mt * t * c.y + t * t * tip.y;
      return { x: r.x + (px - r.x) * w, y: r.y + (py - r.y) * w };
    });
  }

  // ---- drawing ------------------------------------------------------------

  private frame(t: number) {
    const dt = Math.min(0.05, this.last ? (t - this.last) / 1000 : 0.016);
    this.last = t;
    this.time += dt;
    try {
      this.step(dt);
      this.draw();
    } catch (err) {
      this.opts.onError?.(err);
    }
    requestAnimationFrame((n) => this.frame(n));
  }

  private useBasic(tint = true) {
    const gl = this.gl;
    gl.useProgram(this.basic);
    gl.uniform2f(gl.getUniformLocation(this.basic, "u_res"), this.w, this.h);
    const k = this.dark && tint ? [0.4, 0.46, 0.62] : [1, 1, 1];
    gl.uniform3f(gl.getUniformLocation(this.basic, "u_tint"), k[0], k[1], k[2]);
  }

  private drawVerts(data: Float32Array, mode: number, tex: WebGLTexture, color: [number, number, number, number], shadow: boolean) {
    const gl = this.gl;
    const p = this.basic;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    const aPos = gl.getAttribLocation(p, "a_pos");
    const aUv = gl.getAttribLocation(p, "a_uv");
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(p, "u_tex"), 0);
    gl.uniform4f(gl.getUniformLocation(p, "u_color"), ...color);
    gl.uniform1i(gl.getUniformLocation(p, "u_shadow"), shadow ? 1 : 0);
    gl.drawArrays(mode, 0, data.length / 4);
  }

  private quad(x: number, y: number, w: number, h: number, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
    return new Float32Array([x, y, u0, v0, x + w, y, u1, v0, x, y + h, u0, v1, x + w, y + h, u1, v1]);
  }

  private draw() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.room || !this.cat || !this.hand) return;
    const L = this.layout();
    const cat = this.cat;
    const shadowA = this.dark ? 0.55 : 0.4;

    this.useBasic();
    const sa = this.w / this.h;
    const ra = this.room.aspect;
    const [u0, v0, u1, v1] = sa > ra ? [0, (1 - ra / sa) / 2, 1, 1 - (1 - ra / sa) / 2] : [(1 - sa / ra) / 2, 0, 1 - (1 - sa / ra) / 2, 1];
    this.drawVerts(this.quad(0, 0, this.w, this.h, u0, v0, u1, v1), gl.TRIANGLE_STRIP, this.room.tex, [1, 1, 1, 1], false);

    // body shadow
    const [px, py] = cat.bodyShadowPad;
    const sw = L.bodyW * (1 + px * 2);
    const sh = L.bodyH * (1 + py * 2);
    this.drawVerts(
      this.quad(L.left - L.bodyW * px + L.bodyW * 0.02, L.top - L.bodyH * py + L.bodyH * 0.08, sw, sh),
      gl.TRIANGLE_STRIP, cat.bodyShadow, [0.18, 0.11, 0.05, shadowA], true);

    // tail (shadow then fur)
    this.tailPoints = this.computeTail(L);
    const stretch = this.tailLength() / L.tailLen;
    const thick = L.tailT * Math.min(1, Math.max(0.8, 1 / Math.sqrt(stretch)));
    const strip = this.tailStrip(thick, 0, 0);
    const shadowStrip = this.tailStrip(thick * 1.05, L.bodyW * 0.012, L.bodyW * 0.03);
    this.drawVerts(shadowStrip, gl.TRIANGLE_STRIP, cat.tail, [0.18, 0.11, 0.05, shadowA * 0.7], true);
    this.useBasic();
    this.drawVerts(strip, gl.TRIANGLE_STRIP, cat.tail, [1, 1, 1, 1], false);

    this.drawBody(L);
    this.drawHand(L);
  }

  private tailLength() {
    let len = 0;
    for (let i = 1; i < this.tailPoints.length; i++)
      len += Math.hypot(this.tailPoints[i].x - this.tailPoints[i - 1].x, this.tailPoints[i].y - this.tailPoints[i - 1].y);
    return len;
  }

  private tailStrip(thick: number, ox: number, oy: number) {
    const pts = this.tailPoints;
    const n = pts.length - 1;
    const out = new Float32Array((n + 1) * 8);
    for (let i = 0; i <= n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l;
      const ny = dx / l;
      const half = thick / 2;
      const u = i / n;
      const p = pts[i];
      out.set([p.x - nx * half + ox, p.y - ny * half + oy, u, 0, p.x + nx * half + ox, p.y + ny * half + oy, u, 1], i * 8);
    }
    return out;
  }

  private drawBody(L: ReturnType<Scene["layout"]>) {
    const gl = this.gl;
    const p = this.bodyProg;
    gl.useProgram(p);
    gl.uniform2f(gl.getUniformLocation(p, "u_res"), this.w, this.h);
    gl.uniform4f(gl.getUniformLocation(p, "u_rect"), L.left, L.top, L.bodyW, L.bodyH);
    gl.uniform1f(gl.getUniformLocation(p, "u_time"), this.time);
    gl.uniform1f(gl.getUniformLocation(p, "u_disp"), L.bodyW * 0.006);
    gl.uniform2f(gl.getUniformLocation(p, "u_comb"), 0.006, (0.006 * L.bodyW) / L.bodyH);
    const k = this.dark ? [0.4, 0.46, 0.62] : [1, 1, 1];
    gl.uniform3f(gl.getUniformLocation(p, "u_tint"), k[0], k[1], k[2]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cat!.body);
    gl.uniform1i(gl.getUniformLocation(p, "u_tex"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.napTex);
    gl.uniform1i(gl.getUniformLocation(p, "u_nap"), 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuf);
    const aUv = gl.getAttribLocation(p, "a_uv");
    for (let i = 0; i < 4; i++) gl.disableVertexAttribArray(i);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 8, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.gridIdx);
    gl.drawElements(gl.TRIANGLES, this.gridCount, gl.UNSIGNED_SHORT, 0);
    gl.activeTexture(gl.TEXTURE0);
  }

  private drawHand(L: ReturnType<Scene["layout"]>) {
    if (this.handAlpha < 0.01) return;
    const gl = this.gl;
    const hand = this.hand!;
    const lift = 1 - this.handPress;
    const scale = 1 + 0.06 * lift;
    const hh = L.bodyW * 0.95 * scale;
    const hw = hh * hand.aspect;
    const anchor = { x: 0.5, y: 0.34 };
    const p = this.pointer;
    const angle = Math.atan2(p.x - this.w * 0.62, this.h * 1.7 - p.y) * 0.85;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const xf = (lx: number, ly: number, ox: number, oy: number) => {
      const x = (lx - anchor.x) * hw;
      const y = (ly - anchor.y) * hh;
      return [p.x + ox + x * cos - y * sin, p.y + oy + x * sin + y * cos];
    };
    const extend = 1 + (this.h * 2) / hh;
    const verts = (padX: number, padY: number, ox: number, oy: number, sleeve: boolean) => {
      const out: number[] = [];
      const push = (lx: number, ly: number, u: number, v: number) => out.push(...xf(lx, ly, ox, oy), u, v);
      const l = -padX;
      const r = 1 + padX;
      const top = -padY;
      const bottom = 1 + padY;
      push(l, top, 0, 0);
      push(r, top, 1, 0);
      if (sleeve) {
        push(l, 0.985, 0, 0.985);
        push(r, 0.985, 1, 0.985);
        push(l, extend, 0, 0.995);
        push(r, extend, 1, 0.995);
      } else {
        push(l, bottom, 0, 1);
        push(r, bottom, 1, 1);
      }
      return new Float32Array(out);
    };
    const off = L.bodyW * (0.012 + 0.05 * lift);
    this.useBasic();
    this.drawVerts(verts(hand.pad[0], hand.pad[1], off * 0.6, off, false), gl.TRIANGLE_STRIP, hand.shadow,
      [0.18, 0.11, 0.05, (0.42 - 0.18 * lift) * this.handAlpha], true);
    this.drawVerts(verts(0, 0, 0, 0, true), gl.TRIANGLE_STRIP, hand.tex, [1, 1, 1, this.handAlpha], false);
  }
}
