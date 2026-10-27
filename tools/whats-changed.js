/* ============================================================
   待上传清单：列出最近改动过的、需要同步到服务器的文件
   ------------------------------------------------------------
   用法：
     node tools/whats-changed.js            # 最近 24 小时
     node tools/whats-changed.js --hours 72 # 最近 72 小时
     node tools/whats-changed.js --all      # 列出全部需上传的文件
   ============================================================ */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');

/* 需要上传到服务器的范围（其余如 tools/、sources/ 不用传） */
var INCLUDE_DIRS = ['assets', 'data'];
var INCLUDE_EXT = ['.html', '.php', '.css', '.js', '.json', '.jpg', '.jpeg', '.png', '.webp'];
/* 根目录里出现但不该上传的文件：
   bat 是 Windows 本地工具、sql 只用于数据库导入、md 是项目文档（含配置说明） */
var SKIP_FILES = [
    '更新计算器数据.bat', '更新照片墙数据.bat', '待上传清单.bat',
    'members.sql', 'applications.sql', 'photos.sql',
    'README.md', '部署指南.md'
];

var args = process.argv.slice(2);
var hours = 24;
var all = false;
for (var i = 0; i < args.length; i++) {
    if (args[i] === '--hours') hours = Number(args[i + 1]) || 24;
    if (args[i] === '--all') all = true;
}

var now = Date.now();
var cutoff = now - hours * 3600 * 1000;

function walk(dir, out) {
    fs.readdirSync(dir).forEach(function (name) {
        var p = path.join(dir, name);
        var st = fs.statSync(p);
        if (st.isDirectory()) {
            walk(p, out);
        } else if (INCLUDE_EXT.indexOf(path.extname(name).toLowerCase()) >= 0) {
            out.push({ rel: path.relative(ROOT, p).replace(/\\/g, '/'), mtime: st.mtimeMs, size: st.size });
        }
    });
    return out;
}

var files = [];
fs.readdirSync(ROOT).forEach(function (name) {
    var p = path.join(ROOT, name);
    if (!fs.statSync(p).isFile()) return;
    if (SKIP_FILES.indexOf(name) >= 0) return;
    if (INCLUDE_EXT.indexOf(path.extname(name).toLowerCase()) >= 0) {
        files.push({ rel: name, mtime: fs.statSync(p).mtimeMs, size: fs.statSync(p).size });
    }
});
INCLUDE_DIRS.forEach(function (d) {
    var dp = path.join(ROOT, d);
    if (fs.existsSync(dp)) walk(dp, files);
});

var picked = (all ? files : files.filter(function (f) { return f.mtime >= cutoff; }))
    .sort(function (a, b) { return a.mtime - b.mtime; });

function fmtTime(ms) {
    var d = new Date(ms);
    function p(n) { return n < 10 ? '0' + n : String(n); }
    return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function fmtSize(b) {
    return b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(2) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
}

console.log('');
console.log('============================================================');
console.log('  待上传清单' + (all ? '（全部）' : '（最近 ' + hours + ' 小时改动）'));
console.log('============================================================');

if (!picked.length) {
    console.log('  没有改动的文件，服务器已是最新。');
    console.log('============================================================\n');
    return;
}

/* 按顶层目录分组 */
var groups = {};
picked.forEach(function (f) {
    var top = f.rel.indexOf('/') > 0 ? f.rel.split('/')[0] : '（站点根目录）';
    (groups[top] = groups[top] || []).push(f);
});
Object.keys(groups).forEach(function (top) {
    console.log('  [' + top + ']');
    groups[top].forEach(function (f) {
        console.log('    ' + f.rel + '   ' + fmtSize(f.size) + '   ' + fmtTime(f.mtime));
    });
});

var total = picked.reduce(function (s, f) { return s + f.size; }, 0);
console.log('------------------------------------------------------------');
console.log('  共 ' + picked.length + ' 个文件，' + (total / 1024 / 1024).toFixed(2) + 'MB');
console.log('  用 FTP 按上面的路径覆盖到站点根目录即可（目录结构保持一致）');
console.log('============================================================\n');
