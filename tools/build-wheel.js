/* 把规则转盘打包成单文件网页（CSS / JS 全部内联，可直接双击运行）
   ------------------------------------------------------------
   产出两个文件：
     wheel.html  —— PVP 单转盘
     wheels.html —— PVP + PVE 双转盘同页（主页入口指向它）
   两页顶部只有标题（无副标、无引导文案），底部都有「返回」按钮。
   用法：node tools/build-wheel.js */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'wheel.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'wheel.js'), 'utf8');

/* 单文件版需要自带基础变量（原来由 style.css 提供） */
const base =
    ':root{' +
    '--bg:#1a1a1a;--bg-panel:#212121;--text:#e8e2d8;--text-dim:#a8a29b;--text-mute:#6f6a64;' +
    '--gold:#cfa670;--gold-light:#e6c894;--border:rgba(207,166,112,0.22);' +
    '--border-strong:rgba(207,166,112,0.55);' +
    '--font-serif:"Songti SC","STSong","SimSun","Noto Serif SC",serif;}\n' +
    '*{margin:0;padding:0;box-sizing:border-box;}\n' +
    'body{background:var(--bg);color:var(--text);' +
    'font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;}\n' +
    '.container{width:100%;max-width:1180px;margin:0 auto;padding:0 24px;}\n' +
    '.section{padding:48px 0;position:relative;}\n' +
    '.section-head{text-align:center;margin-bottom:26px;}\n' +
    '.section-title{font-family:var(--font-serif);font-size:30px;letter-spacing:4px;color:var(--text);}\n';

const BACK =
    '        <div class="wheel-back-wrap">\n' +
    '            <a class="wheel-back" href="index.html">\n' +
    '                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n' +
    '                    <path d="M19 12H5M11 6l-6 6 6 6"/>\n' +
    '                </svg>\n' +
    '                返回主页\n' +
    '            </a>\n' +
    '        </div>';

function page(title, body) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} · 示例百业</title>
<style>
${base}
${css}
</style>
</head>
<body>
<section class="section wheel">
    <div class="container">
        <div class="section-head">
            <h2 class="section-title">${title}</h2>
        </div>
${body}
${BACK}
    </div>
</section>
<script>
${js}
<\/script>
</body>
</html>
`;
}

function unit(kind, name) {
    return `
            <div class="wheel-unit" data-wheel="${kind}">
                <h3 class="wheel-unit-title">${name}</h3>
                <div class="wheel-stage">
                    <div class="wheel-pointer"></div>
                    <canvas class="wheel-canvas"></canvas>
                    <button type="button" class="wheel-go">GO</button>
                </div>

                <div class="wheel-modal" aria-hidden="true">
                    <div class="wm-mask"></div>
                    <div class="wm-panel" role="dialog" aria-modal="true">
                        <div class="wm-icon">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 2 4 6v6c0 5 3.4 9.2 8 10 4.6-.8 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/>
                            </svg>
                        </div>
                        <div class="wm-label">本 局 规 则</div>
                        <div class="wm-rule">—</div>
                        <button type="button" class="wm-btn">确 认</button>
                    </div>
                </div>
            </div>`;
}

/* 1) wheel.html —— PVP 单转盘 */
fs.writeFileSync(path.join(ROOT, 'wheel.html'),
    page('PVP 转盘', unit('pvp', 'PVP 转盘')), 'utf8');

/* 2) wheels.html —— PVP + PVE 双转盘同页 */
const pair =
    '        <div class="wheel-pair">\n' +
    unit('pvp', 'PVP 转盘') + '\n' +
    unit('pve', 'PVE 转盘') + '\n' +
    '        </div>';
fs.writeFileSync(path.join(ROOT, 'wheels.html'),
    page('转盘', pair), 'utf8');

console.log('已生成 wheel.html（PVP 单转盘）');
console.log('已生成 wheels.html（PVP + PVE 双转盘，主页入口指向此页）');
