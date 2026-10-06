// ZAGUMI ロゴ生成: シンボル(座組マーク) + モノラインのワードマーク
import fs from "node:fs";

const AMBER = "#F5A524";
const INK = "#121212";
const PAPER = "#FFFFFF";

// ---- シンボル: 円状に座る 8 人(座組)と、それを結ぶ Z(ZAGUMI = つながり) ----
// 100x100 の座標系。中心(50,50)、半径 36 の円周上に 8 つの点。
function mark({ ink, accent, size = 100 }) {
  const cx = 50, cy = 50, r = 37, dot = 6;
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (-90 + i * 45) * Math.PI / 180; // 0: 真上
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  // Z: 左上(7) → 右上(1) → 左下(5) → 右下(3)
  const z = [pts[7], pts[1], pts[5], pts[3]];
  const zPath = `M${z.map((p) => p.map((v) => v.toFixed(2)).join(" ")).join(" L")}`;
  const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="${i === 0 ? dot + 1.5 : dot}" fill="${i === 0 ? accent : ink}"/>`).join("\n    ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="ZAGUMI">
    <path d="${zPath}" fill="none" stroke="${ink}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
}

// ---- ワードマーク: 線だけで組んだ幾何学的な大文字。ストローク 16、キャップハイト 100 ----
const SW = 16;
// 各文字の高さを揃える: 直線の文字は y=0〜100、円の文字(G)は半径 50 で同じ高さにし、U の底も 100 に合わせる
const letters = {
  Z: { w: 72, d: (x) => `M${x} 0 H${x + 72} L${x} 100 H${x + 72}` },
  A: { w: 80, d: (x) => `M${x} 100 L${x + 40} 0 L${x + 80} 100 M${x + 17} 64 H${x + 63}` },
  G: { w: 100, d: (x) => { const c = x + 50, r = 50; const a = -0.55; const sx = c + r * Math.cos(a), sy = 50 + r * Math.sin(a); return `M${sx.toFixed(2)} ${sy.toFixed(2)} A${r} ${r} 0 1 0 ${c + r} 50 H${c + 6}`; } },
  U: { w: 76, d: (x) => `M${x} 0 V62 A38 38 0 0 0 ${x + 76} 62 V0` },
  M: { w: 84, d: (x) => `M${x} 100 V0 L${x + 42} 58 L${x + 84} 0 V100` },
  I: { w: 0, d: (x) => `M${x} 0 V100` },
};
const GAP = 28;
function wordmark({ ink, accentLetter = null, accent }) {
  let x = SW / 2 + 2;
  const paths = [];
  for (const ch of "ZAGUMI") {
    const L = letters[ch];
    paths.push(`<path d="${L.d(x)}" stroke="${accentLetter === ch ? accent : ink}"/>`);
    x += L.w + GAP;
  }
  const width = x - GAP + SW / 2 + 2;
  return { width, height: 100 + SW + 4, svg: `<g fill="none" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 ${SW / 2 + 2})">${paths.join("")}</g>` };
}

function lockup({ ink, accent, bg = null, sub = null }) {
  const wm = wordmark({ ink, accent });
  const markSize = 120;
  const pad = 24;
  const gap = 36;
  const subH = sub ? 46 : 0;
  const W = pad + markSize + gap + wm.width + pad;
  const H = pad + Math.max(markSize, wm.height + subH) + pad;
  const wmY = (H - (wm.height + subH)) / 2;
  const subSvg = sub
    ? `<text x="${pad + markSize + gap + 2}" y="${wmY + wm.height + 34}" font-family="'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif" font-weight="600" font-size="34" letter-spacing="2" fill="${ink}">${sub}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="ZAGUMI${sub ? " " + sub : ""}">
  ${bg ? `<rect width="${W}" height="${H}" fill="${bg}"/>` : ""}
  <g transform="translate(${pad} ${(H - markSize) / 2}) scale(${markSize / 100})">${mark({ ink, accent }).replace(/<svg[^>]*>|<\/svg>/g, "")}</g>
  <g transform="translate(${pad + markSize + gap} ${wmY})">${wm.svg}</g>
  ${subSvg}
</svg>`;
}

const out = "public/brand";
fs.writeFileSync(`${out}/zagumi-mark.svg`, mark({ ink: INK, accent: AMBER }));
fs.writeFileSync(`${out}/zagumi-mark-white.svg`, mark({ ink: PAPER, accent: AMBER }));
fs.writeFileSync(`${out}/zagumi-mark-mono.svg`, mark({ ink: INK, accent: INK }));
fs.writeFileSync(`${out}/zagumi-logo.svg`, lockup({ ink: INK, accent: AMBER }));
fs.writeFileSync(`${out}/zagumi-logo-white.svg`, lockup({ ink: PAPER, accent: AMBER }));
for (const [file, sub] of [["schedule", "スケジュール"], ["ticket", "チケット"], ["goods", "物販"], ["pay", "精算"]]) {
  fs.writeFileSync(`${out}/zagumi-${file}.svg`, lockup({ ink: INK, accent: AMBER, sub }));
  fs.writeFileSync(`${out}/zagumi-${file}-white.svg`, lockup({ ink: PAPER, accent: AMBER, sub }));
}
// アプリアイコン(角丸の琥珀地に黒いマーク)
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">
  <rect width="100" height="100" rx="22" fill="${AMBER}"/>
  <g transform="translate(10 10) scale(0.8)">${mark({ ink: INK, accent: INK }).replace(/<svg[^>]*>|<\/svg>/g, "")}</g>
</svg>`;
fs.writeFileSync(`${out}/zagumi-icon.svg`, icon);
fs.writeFileSync(`src/app/icon.svg`, icon);
// プレビュー
const wmOnly = (() => { const w = wordmark({ ink: INK, accent: AMBER }); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.width} ${w.height}" width="${w.width}" height="${w.height}">${w.svg}</svg>`; })();
fs.writeFileSync(`${out}/zagumi-wordmark.svg`, wmOnly);
const preview = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font-family:'Noto Sans JP','Hiragino Sans',sans-serif;background:#e9e7e2;color:#333}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:24px;width:1200px;box-sizing:border-box}
.card{border-radius:12px;padding:28px;display:flex;align-items:center;justify-content:center;min-height:170px}
.light{background:#fff}.dark{background:#111}.amber{background:${AMBER}}
.label{font-size:12px;color:#777;padding:0 24px 4px;grid-column:1/-1}
.row{display:flex;gap:28px;align-items:center}
</style></head><body><div class="grid">
<div class="label">1. 基本ロゴ(横組み)</div>
<div class="card light">${fs.readFileSync(`${out}/zagumi-logo.svg`, "utf8").replace(/width="\d+" height="\d+"/, 'width="520"')}</div>
<div class="card dark">${fs.readFileSync(`${out}/zagumi-logo-white.svg`, "utf8").replace(/width="\d+" height="\d+"/, 'width="520"')}</div>
<div class="label">2. シンボル(座組マーク)とアプリアイコン</div>
<div class="card light"><div class="row">${mark({ ink: INK, accent: AMBER, size: 140 })}${mark({ ink: INK, accent: INK, size: 140 })}<img src="data:image/svg+xml;base64,${Buffer.from(icon).toString("base64")}" width="140" height="140"><img src="data:image/svg+xml;base64,${Buffer.from(icon).toString("base64")}" width="32" height="32"></div></div>
<div class="card dark"><div class="row">${mark({ ink: PAPER, accent: AMBER, size: 140 })}${mark({ ink: AMBER, accent: PAPER, size: 140 })}</div></div>
<div class="label">3. サービスごとのロゴ</div>
<div class="card light">${fs.readFileSync(`${out}/zagumi-schedule.svg`, "utf8").replace(/width="\d+" height="\d+"/, 'width="520"')}</div>
<div class="card dark">${fs.readFileSync(`${out}/zagumi-ticket-white.svg`, "utf8").replace(/width="\d+" height="\d+"/, 'width="520"')}</div>
<div class="card light">${fs.readFileSync(`${out}/zagumi-goods.svg`, "utf8").replace(/width="\d+" height="\d+"/, 'width="520"')}</div>
<div class="card dark">${fs.readFileSync(`${out}/zagumi-pay-white.svg`, "utf8").replace(/width="\d+" height="\d+"/, 'width="520"')}</div>
</div></body></html>`;
fs.writeFileSync("/tmp/claude-0/brand/preview.html", preview);
console.log("generated", fs.readdirSync(out));
