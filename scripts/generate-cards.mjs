#!/usr/bin/env node
/**
 * 生成 Profile README 用到的卡片 SVG —— 输出到仓库 assets/ 目录。
 *
 * 为什么不用现成服务：
 *   github-readme-stats / github-profile-trophy / github-readme-activity-graph
 *   这些 *.vercel.app 域名在国内网络无法直连，README 里的图片会一直加载失败。
 *   所以这里按 GitHub 公开接口取数据，本地绘制成 SVG，提交进仓库后用
 *   jsDelivr（国内可访问）引用：
 *
 *     https://cdn.jsdelivr.net/gh/<owner>/<repo>@main/assets/top-langs.svg
 *     https://cdn.jsdelivr.net/gh/<owner>/<repo>@main/assets/activity.svg
 *
 * 用法：
 *   node scripts/generate-cards.mjs            # 本地生成
 *   GITHUB_TOKEN=xxx node scripts/generate-cards.mjs   # 带 token 提高配额
 *
 * 定时刷新见 .github/workflows/update-cards.yml
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USER = process.env.GH_USER || 'Aprils-lies';
const TOKEN = process.env.GITHUB_TOKEN || '';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets');
const MAX_LANG_REPOS = 8; // 限制语言接口调用次数，避免未登录配额被打满

/* ---------------- 通用工具 ---------------- */

function headers() {
  const h = { 'User-Agent': 'profile-cards-generator', Accept: 'application/vnd.github+json' };
  if (TOKEN) h.Authorization = 'Bearer ' + TOKEN;
  return h;
}

async function fetchJSON(url, extraHeaders) {
  const res = await fetch(url, { headers: extraHeaders || headers() });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.json();
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;');
}

function truncate(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function niceMax(v) {
  if (!(v > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
  const m = v / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e;
}

function formatBytes(b) {
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' kB';
  return b + ' B';
}

/* ---------------- 语言配色（github-linguist） ---------------- */

const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Vue: '#41b883', HTML: '#e34c26',
  CSS: '#563d7c', SCSS: '#c6538c', Less: '#1d365d', Stylus: '#ff6347',
  Python: '#3572a5', Java: '#b07219', Kotlin: '#a97bff', Swift: '#f05138',
  Go: '#00add8', Rust: '#dea584', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
  PHP: '#4f5d95', Ruby: '#701516', Shell: '#89e051', PowerShell: '#012456',
  Dart: '#00b4ab', 'Objective-C': '#438eff', Lua: '#000080', Perl: '#0298c3',
  R: '#198ce7', Scala: '#c22d40', Haskell: '#5e5086', Elixir: '#6e4a7e',
  Astro: '#ff5a03', Svelte: '#ff3e00', Markdown: '#083fa1', Dockerfile: '#384d54',
  'Jupyter Notebook': '#da5b0b', EJS: '#a91e50', Pug: '#a86454', Zig: '#ec915c'
};

function langColor(name) {
  if (LANG_COLORS[name]) return LANG_COLORS[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return 'hsl(' + h + ',50%,62%)';
}

/* ---------------- SVG 外壳 ---------------- */

function svgWrap(w, h, body) {
  return (
    "<svg xmlns='http://www.w3.org/2000/svg' width='" + w + "' height='" + h +
    "' viewBox='0 0 " + w + " " + h + "' role='img' " +
    "font-family=\"'Segoe UI',system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif\">" +
    "<rect width='" + w + "' height='" + h + "' fill='#150e1c'/>" +
    body + '</svg>'
  );
}

/* ---------------- 1. 最常使用语言（900 x 240） ---------------- */

function langsSvg(list, totalBytes, repoCount) {
  const W = 900, H = 240, padX = 44, out = [];
  const top = list.slice(0, 6);

  out.push("<g fill='#f4568f'>");
  out.push("<path d='M8 6h20v14h-5l-5 4v-4H8V6zM13 11.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'/>");
  out.push('</g>');
  out.push("<text x='40' y='21' font-size='16' font-weight='700' fill='#f4568f'>" + list.length + ' Languages</text>');

  out.push("<text x='" + (W / 2) + "' y='54' text-anchor='middle' font-size='17' font-weight='600' fill='#ffffff'>Most used languages</text>");
  const desc = 'estimation from ' + formatBytes(totalBytes) + ' of code across ' + repoCount + ' repositories';
  out.push("<text x='" + (W / 2) + "' y='78' text-anchor='middle' font-size='12' fill='#a99bc0'>" + esc(desc) + '</text>');

  const barY = 98, barH = 14, barW = W - padX * 2;
  let x = padX;
  top.forEach((it) => {
    const w = barW * it.bytes / totalBytes;
    out.push("<rect x='" + x.toFixed(1) + "' y='" + barY + "' width='" + Math.max(1, w).toFixed(1) +
             "' height='" + barH + "' rx='4' fill='" + langColor(it.name) + "'/>");
    x += w;
  });
  if (x < padX + barW - 0.5) {
    out.push("<rect x='" + x.toFixed(1) + "' y='" + barY + "' width='" + (padX + barW - x).toFixed(1) +
             "' height='" + barH + "' rx='4' fill='#2a1f38'/>");
  }

  const perCol = Math.ceil(top.length / 2);
  const colW = (W - padX * 2) / 2 - 24;
  top.forEach((it, i) => {
    const col = i < perCol ? 0 : 1;
    const row = i < perCol ? i : i - perCol;
    const cx = padX + col * (colW + 32);
    const cy = 142 + row * 32;
    const pct = totalBytes > 0 ? (it.bytes / totalBytes * 100).toFixed(1) + '%' : '0%';
    out.push("<circle cx='" + (cx + 6) + "' cy='" + (cy - 5) + "' r='5' fill='" + langColor(it.name) + "'/>");
    out.push("<text x='" + (cx + 20) + "' y='" + cy + "' font-size='13' font-weight='500' fill='#c4b8d6'>" + esc(it.name) + '</text>');
    out.push("<text x='" + (cx + 160) + "' y='" + cy + "' font-size='12' fill='#a99bc0'>" + pct + '</text>');
    out.push("<text x='" + (cx + colW - 4) + "' y='" + cy + "' text-anchor='end' font-size='12' fill='#6b5c82'>" + formatBytes(it.bytes) + '</text>');
  });

  return svgWrap(W, H, out.join(''));
}

async function buildLangs() {
  const repos = await fetchJSON('https://api.github.com/users/' + encodeURIComponent(USER) + '/repos?per_page=100&sort=pushed');
  if (!Array.isArray(repos) || !repos.length) throw new Error('no repos');

  const nonForks = repos.filter((r) => r && !r.fork);
  const targets = nonForks.slice(0, MAX_LANG_REPOS);

  const results = await Promise.all(targets.map(async (r) => {
    try {
      const langs = await fetchJSON('https://api.github.com/repos/' + encodeURIComponent(USER) + '/' + encodeURIComponent(r.name) + '/languages');
      return { langs };
    } catch (e) {
      // 配额不足时退回主语言 + 仓库体积，避免整张卡片失败
      return { langs: r.language ? { [r.language]: r.size || 0 } : {} };
    }
  }));

  const by = {};
  let totalBytes = 0, repoCount = 0;
  results.forEach(({ langs }) => {
    if (!langs || !Object.keys(langs).length) return;
    repoCount++;
    Object.keys(langs).forEach((k) => {
      const v = langs[k] || 0;
      by[k] = (by[k] || 0) + v;
      totalBytes += v;
    });
  });

  const list = Object.keys(by)
    .map((k) => ({ name: k, bytes: by[k] }))
    .sort((a, b) => b.bytes - a.bytes);

  if (!list.length) throw new Error('no language data');
  return langsSvg(list, totalBytes, repoCount);
}

/* ---------------- 2. 最近 31 天贡献趋势（900 x 280） ---------------- */

function activitySvg(days) {
  const n = days.length;
  if (n < 2) return null;

  const W = 900, H = 280, L = 56, R = 18, T = 26, B = 36;
  const pw = W - L - R, ph = H - T - B, base = T + ph;
  const counts = days.map((d) => (d && d.count) || 0);
  let sum = 0, peak = 0;
  counts.forEach((c) => { sum += c; if (c > peak) peak = c; });
  const max = niceMax(peak);

  const X = (k) => L + (k * pw) / (n - 1);
  const Y = (v) => T + ph * (1 - v / max);

  const out = ["<defs><linearGradient id='ag' x1='0' y1='0' x2='0' y2='1'>" +
               "<stop offset='0%' stop-color='#f4568f' stop-opacity='.45'/>" +
               "<stop offset='100%' stop-color='#f4568f' stop-opacity='0'/>" +
               '</linearGradient></defs>'];

  [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
    const y = Y(max * f);
    out.push("<line x1='" + L + "' y1='" + y.toFixed(1) + "' x2='" + (L + pw) + "' y2='" + y.toFixed(1) + "' stroke='#2a1f38' stroke-width='1'/>");
    out.push("<text x='" + (L - 10) + "' y='" + (y + 4).toFixed(1) + "' text-anchor='end' font-size='11' fill='#6b5c82'>" + Math.round(max * f) + '</text>');
  });

  const line = counts.map((v, k) => (k ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');

  out.push("<path d='" + line + ' L ' + X(n - 1).toFixed(1) + ' ' + base + ' L ' + X(0).toFixed(1) + ' ' + base + " Z' fill='url(#ag)'/>");
  out.push("<path d='" + line + "' fill='none' stroke='#f4568f' stroke-width='2' stroke-linejoin='round' stroke-linecap='round'/>");
  counts.forEach((v, k) => {
    if (v > 0) out.push("<circle cx='" + X(k).toFixed(1) + "' cy='" + Y(v).toFixed(1) + "' r='3' fill='#ffa8c8'/>");
  });

  const step = Math.max(1, Math.ceil(n / 6)), idxs = [];
  for (let i = 0; i < n; i += step) idxs.push(i);
  if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);
  idxs.forEach((k) => {
    out.push("<text x='" + X(k).toFixed(1) + "' y='" + (base + 20) + "' text-anchor='" + (k === n - 1 ? 'end' : 'middle') +
             "' font-size='11' fill='#6b5c82'>" + esc(String(days[k].date).slice(5)) + '</text>');
  });

  out.push("<text x='" + L + "' y='16' font-size='12' fill='#a99bc0'>最近 " + n + ' 天共 ' + sum + ' 次贡献 · 单日峰值 ' + peak + '</text>');

  return svgWrap(W, H, out.join(''));
}

async function buildActivity() {
  const data = await fetchJSON(
    'https://github-contributions-api.jogruber.de/v4/' + encodeURIComponent(USER) + '?y=last',
    { 'User-Agent': 'profile-cards-generator' }
  );
  const all = (data && data.contributions) || [];
  if (!all.length) throw new Error('no contribution data');
  return activitySvg(all.slice(-31));
}

/* ---------------- 主流程 ---------------- */

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const [langs, activity] = await Promise.all([
    buildLangs().catch((e) => { console.error('[langs] ' + e.message); return null; }),
    buildActivity().catch((e) => { console.error('[activity] ' + e.message); return null; })
  ]);

  if (langs) {
    await writeFile(join(OUT_DIR, 'top-langs.svg'), langs, 'utf8');
    console.log('已生成 assets/top-langs.svg');
  }
  if (activity) {
    await writeFile(join(OUT_DIR, 'activity.svg'), activity, 'utf8');
    console.log('已生成 assets/activity.svg');
  }
  if (!langs && !activity) {
    console.error('两张卡片都生成失败');
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
