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
function asset(rel) {
  if (assetMap.has(rel)) return assetMap.get(rel);
  const from = path.join(SRC, rel);
  if (!fs.existsSync(from)) fail("нет файла " + rel);
  let buf = fs.readFileSync(from);
  let ext = path.extname(rel);
  if (/\.(jpe?g|png)$/i.test(ext)) {
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
function scopeSelector(sel) {
  if (DROP.test(sel)) return null;
  let m;
  if ((m = sel.match(/^(:root|html|body)(?![\w-])(.*)$/))) return P + m[2];
  for (const c of ROOT_CLASSES) if (sel.startsWith("." + c + " ")) return P + sel;
  return P + " " + sel;
}
function scopeCss(css) {
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
      const inner = scopeCss(body);
      if (inner.trim()) out += `${head}{${inner}}`;
    } else if (/^@keyframes\s+/.test(head)) {
      out += head.replace(/@keyframes\s+([\w-]+)/, "@keyframes pfh-$1") + `{${body}}`;
    } else if (head.startsWith("@")) {
      out += `${head}{${body}}`;
    } else {
      const sels = splitTop(head, ",").map(scopeSelector).filter(Boolean);
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

  body = typo(rewriteUrls(body));
  const html = minifyHtml(`<div class="pfh" data-sales="${variant}">${body}</div>`);

  // CSS: шрифты остаются как есть (font-face глобальные, имена Involve/Manrope), остальное — под .pfh
  let css = rewriteUrls(css0.replace(/\/\*[\s\S]*?\*\//g, ""));
  const fontFaces = css.match(/@font-face\{[^}]*\}/g).join("");
  // защита от глобальных стилей Тильды: цвет заголовков и ссылок — от родителя (ставим первым, правила страницы перекрывают)
  const guard = `${P} :is(h1,h2,h3,h4,h5,h6,p,li,a,b,small,span){color:inherit}${P} :is(ul,ol){padding-left:0}${P} h1{font-size:2em}${P} h2{font-size:1.5em}${P} h3{font-size:1.17em}${P} h4{font-size:1em}`;
  css = guard + scopeCss(css.replace(/@font-face\{[^}]*\}/g, ""))
    .replace(/animation:(\s*)(pulse|pop)\b/g, "animation:$1pfh-$2");
  // якоря внутри страницы не должны уезжать под фиксированную шапку Тильды
  css += `${P}{display:block;overflow:clip}${P} [id]{scroll-margin-top:72px}`;
  css = minifyCss(fontFaces + css);
  const preload = ["fonts/involve/Involve-600__Involve-SemiBold.woff", "fonts/Manrope-500-cyrillic.woff2"]
    .map((f) => `<link rel="preload" href="${BASE + asset(f)}" as="font" type="font/${f.endsWith("2") ? "woff2" : "woff"}" crossorigin>`).join("");
  const cssBlock = `${preload}<style>${css}</style>`;

  // JS: без меню и служебного переключателя, класс появления — на обёртку
  let js = js0;
  const jcut = (re, name) => { if (!re.test(js)) fail(`js: не нашла ${name}`); js = js.replace(re, ""); };
  jcut(/\/\* ─+ мобильное меню[\s\S]*?(?=\/\* ─+ служебный)/, "меню");
  jcut(/\/\* ─+ служебный переключатель[\s\S]*?(?=\/\* ─+ карусель)/, "переключатель продаж");
  js = js.replace("document.documentElement.classList.add('js-rv')", () => "$$('.pfh').forEach((w) => w.classList.add('js-rv'))");
  if (!js.includes("$$('.pfh')")) fail("js: не заменила js-rv");
  // метки как на живой главной: r и utm_* передаём во внутренние ссылки,
  // при r ссылка на бота курсов уходит в salebot с r в utm_content
  const UTM = `
  /* ───── метки r и utm_* ───── */
  const qs = new URLSearchParams(location.search);
  const pass = {};
  ['r', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => { const v = qs.get(k); if (v) pass[k] = v; });
  if (Object.keys(pass).length) {
    $$('.pfh a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (/^https:\\/\\/t\\.me\\/POPOVICHcourse_bot/i.test(href)) {
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
  }
`;
  if (!/\}\)\(\);\s*$/.test(js)) fail("js: не нашла конец IIFE");
  js = js.replace(/\}\)\(\);\s*$/, () => UTM + "})();");
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
const sizes = [];
for (const v of ["open", "closed"]) {
  const b = build(v);
  const rec = (c) => `<div class="r t-rec"><div class="t123"><div class="t-container_100"><div class="t-width t-width_100">${c}</div></div></div></div>`;
  const page = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="noindex"><title>POPOVICHFIT — главная (${v === "open" ? "продажи открыты" : "продажи закрыты"}) · превью Тильды</title>${TILDA_MOCK}</head><body><div class="mock-hdr">шапка Тильды</div><div class="t-records"><div class="mock-gap"></div>${rec(b.cssBlock)}${rec(b.html)}${rec(b.jsBlock)}<div class="mock-foot">подвал Тильды</div></div></body></html>`;
  fs.writeFileSync(path.join(ROOT, "docs", `${v}.html`), page);
  sizes.push([v, b.cssBlock.length, b.html.length, b.jsBlock.length]);
}
fs.writeFileSync(path.join(ROOT, "docs", "index.html"), `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>POPOVICHFIT главная · превью</title><style>body{font:16px/1.5 system-ui;margin:0;padding:24px 16px;max-width:640px;margin:auto}a{display:block;padding:14px 16px;margin:10px 0;border:1px solid #ddd;border-radius:10px;color:#2278d8;text-decoration:none}</style></head><body><h1>POPOVICHFIT — главная для Тильды</h1><a href="open.html">Продажи открыты</a><a href="closed.html">Продажи закрыты</a></body></html>`);

console.log("блоки (символов):");
for (const [v, c, h, j] of sizes) console.log(`  ${v.padEnd(7)} 1-css ${c}  2-html ${h}  3-js ${j}`);
console.log(`ассеты: ${assetMap.size}, база ${BASE}`);
