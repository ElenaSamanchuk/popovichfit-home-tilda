/**
 * Главная POPOVICHFIT → блоки T123 для Тильды (popovichfit.ru)
 *
 *   node scripts/build-tilda.mjs [--base=URL]
 *
 * Вход: source/home-sales-open.html, source/home-sales-closed.html (+ img/, fonts/)
 * Выход:
 *   tilda/<open|closed>/1-css.html  — стили (под обёрткой .pfh) + preload шрифтов
 *   tilda/<open|closed>/2-html.html — разметка без шапки и подвала (они с Тильды)
 *   tilda/<open|closed>/3-js.html   — скрипт в IIFE
 *   assets/…                        — картинки и шрифты с хешем в имени (отдаёт jsDelivr)
 *   docs/<open|closed>.html         — превью: три блока подряд, как на Тильде
 *
 * Правила (как в энциклопедии и аудиоклубе): без iframe, всё минифицировано esbuild,
 * селекторы под префиксом .pfh, html/body/:root → .pfh, чтобы не задеть стили Тильды
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "source");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=").slice(1).join("=") || d;
const BASE = arg("base", "https://cdn.jsdelivr.net/gh/ElenaSamanchuk/popovichfit-home-tilda@main/assets/");
const P = ".pfh";
const fail = (m) => { console.error("✖ " + m); process.exit(1); };

function esbuild(code, args) {
  const bin = path.join(ROOT, "node_modules/.bin/esbuild");
  if (!fs.existsSync(bin)) fail("нет esbuild — выполните один раз: npm i");
  return execFileSync(bin, args, { input: code, maxBuffer: 64 << 20 }).toString().trim();
}
const minifyJs = (c) => esbuild(c, ["--minify", "--target=es2020", "--charset=utf8", "--loader=js"]);
const minifyCss = (c) => esbuild(c, ["--minify", "--charset=utf8", "--loader=css"]);

/* ───── ассеты: копия с хешем, jpg/png → webp ───── */
const assetMap = new Map(); // "img/x.jpg" → "img/x.<hash>.webp"
fs.rmSync(path.join(ROOT, "assets"), { recursive: true, force: true });
// картинки, которые показываются намного мельче исходника: ширина = 3 × размер на экране
const RESIZE = {
  "img/t/t61373034-__2_page-0001.webp": 252, // сертификаты 84×62
  "img/t/t37316635-photo_2024-03-16_130.webp": 252,
  "img/t/t31343238-__2023-11-10__185929.webp": 252,
};
function asset(rel) {
  if (assetMap.has(rel)) return assetMap.get(rel);
  const from = path.join(SRC, rel);
  if (!fs.existsSync(from)) fail("нет файла " + rel);
  let buf = fs.readFileSync(from);
  let ext = path.extname(rel);
  if (RESIZE[rel]) {
    const tmp = path.join(ROOT, "node_modules/.tmp.webp");
    execFileSync("cwebp", ["-quiet", "-q", "86", "-m", "6", "-resize", String(RESIZE[rel]), "0", from, "-o", tmp]);
    buf = fs.readFileSync(tmp); fs.rmSync(tmp);
  } else if (/\.(jpe?g|png)$/i.test(ext)) {
    const tmp = path.join(ROOT, "node_modules/.tmp.webp");
    execFileSync("cwebp", ["-quiet", "-q", "86", "-m", "6", from, "-o", tmp]);
    buf = fs.readFileSync(tmp); fs.rmSync(tmp); ext = ".webp";
  }
  const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8);
  const out = path.join(path.dirname(rel), path.basename(rel, path.extname(rel)) + "." + hash + ext);
  fs.mkdirSync(path.join(ROOT, "assets", path.dirname(out)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "assets", out), buf);
  assetMap.set(rel, out);
  return out;
}
const rewriteUrls = (s) => s.replace(/(["'(])((?:img|fonts)\/[^"')\s]+)/g, (_, q, rel) => q + BASE + asset(rel));

/* ───── CSS: префикс .pfh для каждого селектора ───── */
// разделы шапки, меню и подвала с Тильды не нужны — их правила выбрасываем
const DROP = /^(\.hdr|\.menu|\.burger|\.skip|\.salesw|\.foot|\.soc|body\.is-locked)\b/;
const ROOT_CLASSES = ["js-rv"]; // классы, которые скрипт вешает на обёртку

function splitTop(s, ch) {
  const out = []; let depth = 0, cur = "";
  for (const c of s) {
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === ch && depth === 0) { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
const keepPage = (sel) => !DROP.test(sel);
// для отдельных блоков шапки и подвала: их правила + база (переменные, сбросы) + общие .wrap/.ic
const keepFor = (re) => (sel) => re.test(sel) || /^[^.\[#]/.test(sel);
const keepMenu = keepFor(/^(\.hdr|\.menu|\.burger|body\.is-locked|\.ic)\b/);
const keepFoot = keepFor(/^(\.foot|\.soc|\.wrap)\b/);
function scopeSelector(sel, keep) {
  if (!keep(sel)) return null;
  if (sel === "body.is-locked") return sel; // скрипт меню вешает класс на body Тильды
  let m;
  if ((m = sel.match(/^(:root|html|body)(?![\w-])(.*)$/))) return P + m[2];
  for (const c of ROOT_CLASSES) if (sel.startsWith("." + c + " ")) return P + sel;
  return P + " " + sel;
}
function scopeCss(css, keep = keepPage) {
  let out = "", i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    // найти парную скобку
    let depth = 1, j = open + 1;
    while (depth && j < css.length) { if (css[j] === "{") depth++; else if (css[j] === "}") depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    if (/^@(media|supports)/.test(head)) {
      const inner = scopeCss(body, keep);
      if (inner.trim()) out += `${head}{${inner}}`;
    } else if (/^@keyframes\s+/.test(head)) {
      out += head.replace(/@keyframes\s+([\w-]+)/, "@keyframes pfh-$1") + `{${body}}`;
    } else if (head.startsWith("@")) {
      out += `${head}{${body}}`;
    } else {
      const sels = splitTop(head, ",").map((x) => scopeSelector(x, keep)).filter(Boolean);
      if (sels.length) out += `${sels.join(",")}{${body}}`;
    }
    i = j;
  }
  return out;
}

/* ───── типографика: неразрывный пробел после коротких слов ───── */
const SHORT = "а|в|во|и|к|ко|о|об|обо|от|с|со|у|до|за|из|над|на|не|ни|но|да|ли|бы|по|под|для|без|или|при|про|что|как|мы|ты|я|он|её|ее|их|же|все|это|из-за";
const nbspRe = new RegExp(`(^|[\\s(«„"—])(${SHORT})[ \\t\\n]+(?=[^\\s&])`, "giu");
// текстовые элементы, где не должно быть точки в конце и одного слова в последней строке
const END = "p|li|dd|h[1-4]|figcaption|small|span|b|u";
function typo(html) {
  return html.replace(/>([^<]+)</g, (all, text) => {
    if (!/[а-яё]/i.test(text)) return all;
    let t = text;
    for (let k = 0; k < 2; k++) t = t.replace(nbspRe, (_, pre, w) => pre + w + "&nbsp;");
    t = t.replace(/(\S)[ \t\n]+(—|–)/g, "$1&nbsp;$2"); // тире не уходит в начало строки
    return ">" + t + "<";
  })
    // точки в конце абзацев убираем (многоточия и сокращения «т. д.» не трогаем)
    .replace(new RegExp(`(?<![\\s.;][а-яё])([^.\\s])\\.(\\s*<\\/(?:${END})>)`, "giu"), "$1$2")
    // последнее слово не остаётся одно в строке: склеиваем с предыдущим
    // (только короткие слова — длинная склейка не помещается на 320 px)
    .replace(new RegExp(`(>[^<]*?(?:^|[\\s>;])[^\\s<>&;]{1,10})[ \\t\\n]+([^\\s<&]{1,7})(\\s*<\\/(?:${END})>)`, "giu"), "$1&nbsp;$2$3");
}

function minifyHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/>\s+</g, (m) => (/\n/.test(m) ? "><" : "> <"))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/* ───── оптика: заглавные Involve стоят выше центра плашки — сдвигаем текст вниз ───── */
// величины замерены по шрифту 29.10 (смещение центра заглавных от центра плашки, в em)
const OPTICAL = { btn: 0.066, tag: 0.055, buy__btn: 0.066, hdr__lk: 0.07, cl__n: 0.1, buy__i: 0.07, soc__vk: 0.033 };
const opticalRe = new RegExp(`(<(?:a|button|span|i|b)\\b[^>]*class="(?:[^"]*\\s)?(${Object.keys(OPTICAL).join("|")})(?:\\s[^"]*)?"[^>]*>)(\\s*)([^<]*[^<\\s])`, "g");
const optical = (html) => html.replace(opticalRe, (_, open, cls, ws, text) => `${open}${ws}<span class="pfh-t">${text}</span>`);
const OPTICAL_CSS = `${P} .pfh-t{position:relative}` + Object.entries(OPTICAL).map(([c, v]) => `${P} .${c}>.pfh-t{top:${v}em}`).join("");

/* ───── плавное открытие и закрытие: модалки и вопросы-ответы ───── */
const MOTION_CSS = `@keyframes pfh-fade{from{opacity:0}}@keyframes pfh-out{to{opacity:0;transform:translateY(14px) scale(.97)}}@keyframes pfh-fade-out{to{opacity:0}}
${P} .modal[open]{animation:pfh-pop .35s var(--ease),pfh-fade .25s ease-out}
${P} .modal[open]::backdrop{animation:pfh-fade .3s ease-out}
${P} .modal.is-closing{animation:pfh-out .24s var(--ease) forwards}
${P} .modal.is-closing::backdrop{animation:pfh-fade-out .24s ease-in forwards}
@media (prefers-reduced-motion:reduce){${P} .modal[open],${P} .modal.is-closing,${P} .modal::backdrop{animation:none!important}}`;
const MOTION_JS = `
  /* ───── плавное закрытие модалок ───── */
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shut = (dlg) => {
    if (!dlg.open || dlg.classList.contains('is-closing')) return;
    if (still) { dlg.close(); return; }
    dlg.classList.add('is-closing');
    setTimeout(() => { dlg.classList.remove('is-closing'); dlg.close(); }, 240);
  };
  $$('.pfh dialog.modal').forEach((dlg) => {
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); shut(dlg); });
    $$('form[method="dialog"]', dlg).forEach((f) => f.addEventListener('submit', (e) => { e.preventDefault(); shut(dlg); }));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) shut(dlg); });
  });

  /* ───── плавное раскрытие вопросов-ответов ───── */
  const slide = (d, open) => {
    const a = d.querySelector('.qa__a');
    if (!a || still || !a.animate) { d.open = open; return; }
    if (d._anim) d._anim.cancel();
    if (open) d.open = true;
    d._closing = !open;
    const h = a.offsetHeight, pb = getComputedStyle(a).paddingBottom;
    a.style.overflow = 'hidden';
    const full = { height: h + 'px', paddingBottom: pb, opacity: 1 }, none = { height: '0px', paddingBottom: '0px', opacity: 0 };
    d._anim = a.animate(open ? [none, full] : [full, none],
      { duration: open ? 320 : 240, easing: 'cubic-bezier(.2,.7,.2,1)' });
    d._anim.onfinish = () => { if (!open) d.open = false; a.style.overflow = ''; d._anim = null; d._closing = false; };
  };
  $$('.pfh details.qa > summary').forEach((sm) => sm.addEventListener('click', (e) => {
    e.preventDefault();
    const d = sm.parentElement;
    const willOpen = !d.open || d._closing;
    const group = d.getAttribute('name');
    if (willOpen && group) $$('.pfh details.qa').forEach((o) => { if (o !== d && o.open && o.getAttribute('name') === group) slide(o, false); });
    slide(d, willOpen);
  }));
`;

/* ───── сборка одной страницы ───── */
function build(variant) {
  const src = fs.readFileSync(path.join(SRC, `home-sales-${variant}.html`), "utf8");
  const css0 = src.match(/<style>([\s\S]*?)<\/style>/)[1];
  const js0 = src.match(/<script>([\s\S]*?)<\/script>/)[1];
  let body = src.match(/<body>([\s\S]*?)<script>/)[1];

  // вырезаем шапку, мобильное меню и подвал — они на стороне Тильды
  const cut = (re, name) => { if (!re.test(body)) fail(`${variant}: не нашла ${name}`); body = body.replace(re, ""); };
  cut(/<a class="skip"[^>]*>[\s\S]*?<\/a>/, "skip");
  cut(/<header class="hdr"[\s\S]*?<\/header>/, "шапку");
  cut(/<!-- мобильное меню[\s\S]*?(?=<main)/, "меню");
  cut(/<footer class="foot">[\s\S]*?<\/footer>/, "подвал");
  if (/href="\/new\/"/.test(body)) fail(`${variant}: осталась ссылка /new/ (на сайте 404)`);
  // продажи открыты: кнопки покупки ведут на страницы предзаказа (решение Елены 29.10)
  if (variant === "open") body = body.replace(/href="\/course_correction"/g, 'href="/predcor"').replace(/href="\/course_power"/g, 'href="/predpow"');

  // анимация клуба ниже первого экрана — грузим по мере прокрутки
  body = body.replace('class="club__vid" src=', 'class="club__vid" loading="lazy" src=');
  // первые два блока (первый экран и «Подход») грузятся сразу, без отложенной загрузки
  body = body.replace(/(<section class="sec sec--join" id="approach">[\s\S]*?<\/section>)/, (sec) => sec.replace(/ loading="lazy"/g, ""));
  body = optical(typo(rewriteUrls(body)));
  const html = minifyHtml(`<div class="pfh" data-sales="${variant}">${body}</div>`);

  // CSS: шрифты остаются как есть (font-face глобальные, имена Involve/Manrope), остальное — под .pfh
  let css = rewriteUrls(css0.replace(/\/\*[\s\S]*?\*\//g, ""));
  const fontFaces = css.match(/@font-face\{[^}]*\}/g).join("");
  // защита от глобальных стилей Тильды: цвет заголовков и ссылок — от родителя (ставим первым, правила страницы перекрывают)
  const guard = `${P} :is(h1,h2,h3,h4,h5,h6,p,li,a,b,small,span){color:inherit}${P} :is(ul,ol){padding-left:0}${P} h1{font-size:2em}${P} h2{font-size:1.5em}${P} h3{font-size:1.17em}${P} h4{font-size:1em}`;
  css = guard + scopeCss(css.replace(/@font-face\{[^}]*\}/g, ""))
    .replace(/animation:(\s*)(pulse|pop)\b/g, "animation:$1pfh-$2");
  // якоря внутри страницы не должны уезжать под фиксированную шапку Тильды
  css += `${P}{display:block;overflow:clip}${P} [id]{scroll-margin-top:72px}` + OPTICAL_CSS + MOTION_CSS;
  css = minifyCss(fontFaces + css);
  const preload = ["fonts/involve/Involve-600__Involve-SemiBold.woff", "fonts/Manrope-500-cyrillic.woff2"]
    .map((f) => `<link rel="preload" href="${BASE + asset(f)}" as="font" type="font/${f.endsWith("2") ? "woff2" : "woff"}" crossorigin>`).join("");
  const heroImg = (f, extra = "") => `<link rel="preload" href="${BASE + asset(f)}" as="image" type="image/webp" fetchpriority="high"${extra}>`;
  const cssBlock = `${preload}${heroImg("img/t/t65633034-group_1321319637.webp")}${heroImg("img/t/t64376362-popovich_fit_2025040.webp")}<style>${css}</style>`;

  // JS: без меню и служебного переключателя, класс появления — на обёртку
  let js = js0;
  const jcut = (re, name) => { if (!re.test(js)) fail(`js: не нашла ${name}`); js = js.replace(re, ""); };
  jcut(/\/\* ─+ мобильное меню[\s\S]*?(?=\/\* ─+ служебный)/, "меню");
  jcut(/\/\* ─+ служебный переключатель[\s\S]*?(?=\/\* ─+ карусель)/, "переключатель продаж");
  jcut(/\s*dlg\.addEventListener\('click', \(e\) => \{ if \(e\.target === dlg\) dlg\.close\(\); \}\);/, "мгновенное закрытие по фону");
  js = js.replace("document.documentElement.classList.add('js-rv')", () => "$$('.pfh').forEach((w) => w.classList.add('js-rv'))");
  if (!js.includes("$$('.pfh')")) fail("js: не заменила js-rv");
  // метки как на живой главной: r и utm_* передаём во внутренние ссылки,
  // при r ссылка на бота курсов уходит в salebot с r в utm_content (как на живой главной, решение Елены 29.10)
  const UTM = `
  /* ───── метки r и utm_* ───── */
  const qs = new URLSearchParams(location.search);
  const pass = {};
  ['r', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => { const v = qs.get(k); if (v) pass[k] = v; });
  const tag = () => $$('.pfh a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (/^https:\\/\\/t\\.me\\/(POPOVICHcourse_bot|popovichfitcourse_bot)/i.test(href)) {
        if (pass.r) a.setAttribute('href', 'https://salebot.site/62b5cbabae0fe1409f44ce65d9274be9_1?utm_content=r%3D' + encodeURIComponent(pass.r));
        return;
      }
      if (href.startsWith('#')) return;
      let url;
      try { url = new URL(href, location.href); } catch (e) { return; }
      const own = url.hostname === location.hostname || /^(www\\.)?popovichfit\\.ru$/.test(url.hostname);
      if (!own) return;
      Object.entries(pass).forEach(([k, v]) => url.searchParams.set(k, v));
      a.setAttribute('href', url.toString());
    });
  // после загрузки всей страницы — чтобы попали и блоки ниже скрипта (подвал)
  if (Object.keys(pass).length) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tag); else tag();
  }
`;
  if (!/\}\)\(\);\s*$/.test(js)) fail("js: не нашла конец IIFE");
  js = js.replace(/\}\)\(\);\s*$/, () => UTM + MOTION_JS + "})();");
  const jsBlock = `<script>${minifyJs(js)}</script>`;

  const dir = path.join(ROOT, "tilda", variant);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "1-css.html"), cssBlock);
  fs.writeFileSync(path.join(dir, "2-html.html"), html);
  fs.writeFileSync(path.join(dir, "3-js.html"), jsBlock);
  return { cssBlock, html, jsBlock };
}

/* ───── превью: имитация Тильды (её глобальные стили, шапка-заглушка) ───── */
const TILDA_MOCK = `<style>body{margin:0;font-family:Arial,sans-serif}:where(.t-records) a{color:#ff8562}.t-records ul{padding-left:20px}.t-records h1,.t-records h2{font-size:40px;color:red}
.mock-hdr{position:fixed;top:0;left:0;right:0;height:56px;z-index:90;background:#fff;border-bottom:1px solid #ddd;display:flex;align-items:center;justify-content:center;font:600 13px Arial;color:#888}
.mock-gap{height:56px}.mock-foot{padding:40px;text-align:center;background:#222;color:#aaa;font:13px Arial}</style>`;
fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
/* ───── отдельные блоки: шапка с мобильным меню и подвал из дизайна ───── */
function buildChrome() {
  const src = fs.readFileSync(path.join(SRC, "home-sales-open.html"), "utf8");
  const css0 = rewriteUrls(src.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, ""));
  const js0 = src.match(/<script>([\s\S]*?)<\/script>/)[1];
  const fontFaces = css0.match(/@font-face\{[^}]*\}/g).join("");
  const rules = css0.replace(/@font-face\{[^}]*\}/g, "");
  const menuCss = scopeCss(rules, keepMenu) + OPTICAL_CSS, footCss = scopeCss(rules, keepFoot) + OPTICAL_CSS;
  const pick = (re, name) => { const m = src.match(re); if (!m) fail("chrome: не нашла " + name); return m[0]; };
  const fix = (h) => optical(typo(rewriteUrls(h))).replace(/href="\/new\/"/g, 'href="/"');
  const sprite = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><symbol id="i-close" viewBox="0 0 16 16"><path d="m3.5 3.5 9 9m0-9-9 9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></symbol></svg>';

  // шапка: в блоке Тильды sticky не держится — закрепляем fixed и оставляем под ней место
  const hdr = fix(pick(/<header class="hdr"[\s\S]*?<\/header>/, "шапку") + pick(/<div class="menu" id="sheet"[\s\S]*?(?=<main)/, "меню"));
  const hdrCss = minifyCss(fontFaces + menuCss + `${P} .hdr{position:fixed;left:0;right:0;top:0}${P} .pfh-gap{height:var(--hdr)}`);
  let menuJs = (js0.match(/\/\* ─+ мобильное меню[\s\S]*?(?=\/\* ─+ служебный)/) || [])[0];
  if (!menuJs) fail("chrome: нет скрипта меню");
  menuJs = minifyJs(`(() => { const $ = (s, r = document) => r.querySelector(s);\n${menuJs}\n})();`);
  const menuBlock = minifyHtml(`<style>${hdrCss}</style><div class="pfh pfh-hdr">${sprite}${hdr}<div class="pfh-gap"></div></div><script>${menuJs}</script>`);

  const foot = fix(pick(/<footer class="foot">[\s\S]*?<\/footer>/, "подвал"));
  const footBlock = minifyHtml(`<style>${minifyCss(fontFaces + footCss)}</style><div class="pfh pfh-foot">${foot}</div>`);

  const dir = path.join(ROOT, "tilda", "menu-footer");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "0-menu.html"), menuBlock);
  fs.writeFileSync(path.join(dir, "4-footer.html"), footBlock);
  return { menuBlock, footBlock };
}

const sizes = [];
const ch = buildChrome();
for (const v of ["open", "closed"]) {
  const b = build(v);
  const rec = (c) => `<div class="r t-rec"><div class="t123"><div class="t-container_100"><div class="t-width t-width_100">${c}</div></div></div></div>`;
  const page = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="noindex"><title>POPOVICHFIT — главная (${v === "open" ? "продажи открыты" : "продажи закрыты"}) · превью Тильды</title>${TILDA_MOCK}</head><body><div class="mock-hdr">шапка Тильды</div><div class="t-records"><div class="mock-gap"></div>${rec(b.cssBlock)}${rec(b.html)}${rec(b.jsBlock)}<div class="mock-foot">подвал Тильды</div></div></body></html>`;
  fs.writeFileSync(path.join(ROOT, "docs", `${v}.html`), page);
  const full = page.replace('<div class="mock-hdr">шапка Тильды</div>', "").replace('<div class="mock-gap"></div>', rec(ch.menuBlock))
    .replace('<div class="mock-foot">подвал Тильды</div>', rec(ch.footBlock)).replace("· превью Тильды", "· с меню и подвалом");
  fs.writeFileSync(path.join(ROOT, "docs", `${v}-full.html`), full);
  sizes.push([v, b.cssBlock.length, b.html.length, b.jsBlock.length]);
}
fs.writeFileSync(path.join(ROOT, "docs", "index.html"), `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>POPOVICHFIT главная · превью</title><style>body{font:16px/1.5 system-ui;margin:0;padding:24px 16px;max-width:640px;margin:auto}a{display:block;padding:14px 16px;margin:10px 0;border:1px solid #ddd;border-radius:10px;color:#2278d8;text-decoration:none}</style></head><body><h1>POPOVICHFIT — главная для Тильды</h1><a href="open.html">Продажи открыты</a><a href="closed.html">Продажи закрыты</a><a href="open-full.html">Открыты + меню и подвал из дизайна</a><a href="closed-full.html">Закрыты + меню и подвал из дизайна</a></body></html>`);

console.log("блоки (символов):");
for (const [v, c, h, j] of sizes) console.log(`  ${v.padEnd(7)} 1-css ${c}  2-html ${h}  3-js ${j}`);
console.log(`  menu    0-menu ${ch.menuBlock.length}  4-footer ${ch.footBlock.length}`);
console.log(`ассеты: ${assetMap.size}, база ${BASE}`);
