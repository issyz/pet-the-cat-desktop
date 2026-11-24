import { CATS, assetUrl } from "./cats";
import { Purr } from "./purr";
import { Scene } from "./scene";

const STORE = "pet-the-cat-settings";
interface Settings {
  theme: "light" | "dark";
  cat: string;
  size: number;
  width: number;
  sound: boolean;
}

const defaults: Settings = { theme: "light", cat: "kuro", size: 5, width: 5, sound: false };
const settings: Settings = (() => {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORE) ?? "{}") };
  } catch {
    return { ...defaults };
  }
})();
if (!CATS.some((c) => c.id === settings.cat)) settings.cat = defaults.cat;
const save = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable; settings then last for this session only.
  }
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const stage = $<HTMLDivElement>("#stage");
const notice = $("#notice");
const retry = $<HTMLButtonElement>("#retry");
const themeBtn = $<HTMLButtonElement>("#theme");
const soundBtn = $<HTMLButtonElement>("#sound");
const expandBtn = $<HTMLButtonElement>("#expand");
const propToggle = $<HTMLButtonElement>("#proportions-toggle");
const propPanel = $<HTMLDivElement>("#proportions-panel");
const sizeInput = $<HTMLInputElement>("#cat-size");
const widthInput = $<HTMLInputElement>("#cat-width");
const choices = $<HTMLDivElement>(".choices");

const purr = new Purr();
const scene = new Scene($<HTMLCanvasElement>("#scene"), {
  onReady: () => {
    stage.dataset.ready = "true";
    retry.hidden = true;
  },
  onError: (err) => {
    console.error(err);
    retry.hidden = false;
  },
});

function applyTheme() {
  const dark = settings.theme === "dark";
  document.documentElement.dataset.theme = settings.theme;
  themeBtn.setAttribute("aria-checked", String(dark));
  scene.setDark(dark);
}

function applyProportions() {
  sizeInput.value = String(settings.size);
  widthInput.value = String(settings.width);
  sizeInput.setAttribute("aria-valuetext", `${75 + settings.size * 5}%`);
  widthInput.setAttribute("aria-valuetext", `${80 + settings.width * 4}%`);
  scene.setProportions(settings.size, settings.width);
}

function selectCat(id: string) {
  settings.cat = id;
  save();
  for (const b of choices.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.cat === id));
  const cat = CATS.find((c) => c.id === id)!;
  stage.setAttribute("aria-label", `摸摸${cat.name}`);
  notice.textContent = `已选择${cat.name}`;
  void scene.setCat(id);
}

for (const cat of CATS) {
  const b = document.createElement("button");
  b.dataset.cat = cat.id;
  b.setAttribute("aria-label", cat.name);
  b.title = cat.name;
  b.setAttribute("aria-pressed", "false");
  const coat = document.createElement("span");
  coat.className = "coat";
  coat.style.backgroundImage = `url(${assetUrl(`${cat.id}-swatch`)})`;
  b.append(coat);
  b.addEventListener("click", () => selectCat(cat.id));
  choices.append(b);
}

themeBtn.addEventListener("click", () => {
  settings.theme = settings.theme === "dark" ? "light" : "dark";
  save();
  applyTheme();
});

soundBtn.addEventListener("click", () => {
  settings.sound = !settings.sound;
  save();
  soundBtn.setAttribute("aria-checked", String(settings.sound));
  purr.setEnabled(settings.sound);
});

propToggle.addEventListener("click", () => {
  propPanel.hidden = !propPanel.hidden;
  propToggle.setAttribute("aria-expanded", String(!propPanel.hidden));
});
document.addEventListener("pointerdown", (e) => {
  if (!propPanel.hidden && !propPanel.contains(e.target as Node) && !propToggle.contains(e.target as Node)) {
    propPanel.hidden = true;
    propToggle.setAttribute("aria-expanded", "false");
  }
});
for (const input of [sizeInput, widthInput])
  input.addEventListener("input", () => {
    settings.size = Number(sizeInput.value);
    settings.width = Number(widthInput.value);
    save();
    applyProportions();
  });

async function tauriWindow() {
  if (!("__TAURI_INTERNALS__" in window)) return null;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

async function isFullscreen() {
  const win = await tauriWindow();
  return win ? win.isFullscreen() : Boolean(document.fullscreenElement);
}

async function setFullscreen(on: boolean) {
  const win = await tauriWindow();
  if (win) await win.setFullscreen(on);
  else if (on) await document.documentElement.requestFullscreen?.();
  else if (document.fullscreenElement) await document.exitFullscreen();
  expandBtn.setAttribute("aria-pressed", String(on));
  expandBtn.setAttribute("aria-label", on ? "退出全屏" : "全屏");
}

expandBtn.addEventListener("click", async () => setFullscreen(!(await isFullscreen())));
document.addEventListener("fullscreenchange", () => expandBtn.setAttribute("aria-pressed", String(Boolean(document.fullscreenElement))));

stage.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    scene.strokeBack();
  } else if (e.key.toLowerCase() === "t") {
    e.preventDefault();
    scene.strokeTail();
  }
});
document.addEventListener("keydown", async (e) => {
  if (e.key === "Escape" && (await isFullscreen())) void setFullscreen(false);
});

retry.addEventListener("click", () => {
  retry.hidden = true;
  void start();
});

function tick() {
  purr.setIntensity(scene.purrLevel);
  requestAnimationFrame(tick);
}

async function start() {
  try {
    await scene.init(settings.cat);
    scene.preload(CATS.map((c) => c.id).filter((id) => id !== settings.cat));
  } catch (err) {
    console.error(err);
    retry.hidden = false;
  }
}

applyTheme();
applyProportions();
selectCat(settings.cat);
soundBtn.setAttribute("aria-checked", String(settings.sound));
if (settings.sound) {
  const resume = () => {
    purr.setEnabled(true);
    window.removeEventListener("pointerdown", resume);
  };
  window.addEventListener("pointerdown", resume);
}
stage.focus();
tick();
void start();
