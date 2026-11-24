export function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
}

export function texture(gl: WebGL2RenderingContext, source: TexImageSource) {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

// Soft shadow mask: downscale then upscale the silhouette (works without ctx.filter).
export function shadowMask(img: HTMLImageElement, softness = 14) {
  const pad = Math.ceil(Math.max(img.width, img.height) * 0.08);
  const w = img.width + pad * 2;
  const h = img.height + pad * 2;
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(w / softness));
  small.height = Math.max(1, Math.round(h / softness));
  const sc = small.getContext("2d")!;
  sc.drawImage(img, (pad / w) * small.width, (pad / h) * small.height, (img.width / w) * small.width, (img.height / h) * small.height);
  sc.globalCompositeOperation = "source-in";
  sc.fillStyle = "#000";
  sc.fillRect(0, 0, small.width, small.height);
  const out = document.createElement("canvas");
  out.width = Math.round(w / 2);
  out.height = Math.round(h / 2);
  const oc = out.getContext("2d")!;
  oc.imageSmoothingQuality = "high";
  oc.drawImage(small, 0, 0, out.width, out.height);
  return { canvas: out, pad: pad / img.width, padY: pad / img.height };
}

export function alphaMap(img: HTMLImageElement, width = 240) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.round((img.height / img.width) * width);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  return (u: number, v: number) => {
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    const x = Math.min(c.width - 1, Math.floor(u * c.width));
    const y = Math.min(c.height - 1, Math.floor(v * c.height));
    return data[(y * c.width + x) * 4 + 3] / 255;
  };
}
