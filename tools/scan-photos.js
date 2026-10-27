/**
 * 扫描 photos 图片目录 -> 生成 data/photos.js
 * ------------------------------------------------------------
 * 用法：node tools/scan-photos.js
 *
 * 这是「本地加图」的路径：
 *   把图片丢进 assets/img/photos/ -> 跑一次本脚本 -> 上传 data/photos.js + 图片目录
 *   照片墙就会多出这些照片，全程不需要服务器上传接口。
 *
 * 文件名支持的写法（都是可选的）：
 *   示例甲.jpg              -> 标题「示例甲」，投稿人自动匹配成员表里的昵称
 *   百业战合影.jpg          -> 标题「百业战合影」，投稿人「示例百业」
 *   百业战合影@示例乙.jpg   -> 标题「百业战合影」，投稿人「示例乙」（@ 后面是投稿人）
 *
 * 排列顺序：文件修改时间倒序（新放的排前面）。
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var IMG_DIR = path.join(ROOT, 'assets', 'img', 'photos');
var OUT = path.join(ROOT, 'data', 'photos.js');
var MEMBERS_FILE = path.join(ROOT, 'data', 'members.js');

/* 允许的图片后缀 */
var EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/* 默认的投稿人名字（文件名里没写、成员表里也没匹配到时使用） */
var DEFAULT_UPLOADER = '示例百业';


/* ------------------------------------------------------------
   读取成员表：用文件名去反查这位成员是谁
   成员表里的 cover / shot 形如 assets/img/members/示例甲.jpg
   ------------------------------------------------------------ */
function loadMembers() {
    var map = {};                       // 文件名(不含路径) -> {name, gameId}
    try {
        global.window = {};
        eval(fs.readFileSync(MEMBERS_FILE, 'utf8'));   // 载入 window.QN_MEMBERS
        var list = global.window.QN_MEMBERS || [];
        list.forEach(function (m) {
            [m.cover, m.shot].forEach(function (p) {
                if (!p) return;
                var base = String(p).split('/').pop();
                if (base) map[base] = { name: m.name || '', gameId: m.gameId || '' };
            });
        });
    } catch (e) {
        console.log('  （未读到成员表，投稿人将使用默认名）');
    }
    return map;
}

/* 把文件名解析成标题 + 投稿人
   「百业战合影@示例乙.jpg」-> {title:'百业战合影', uploader:'示例乙'} */
function parseName(fileName) {
    var base = fileName.replace(/\.[^.]+$/, '');     // 去掉后缀
    var title = base, uploader = '';

    var at = base.lastIndexOf('@');
    if (at > 0) {
        title = base.slice(0, at).trim();
        uploader = base.slice(at + 1).trim();
    }
    return { title: title, uploader: uploader };
}


/* ---------- 主流程 ---------- */
function main() {
    if (!fs.existsSync(IMG_DIR)) {
        fs.mkdirSync(IMG_DIR, { recursive: true });
        console.log('已创建图片目录：assets/img/photos/');
        console.log('把照片放进去后再重新运行本脚本。');
        return;
    }

    var files = fs.readdirSync(IMG_DIR).filter(function (f) {
        return EXTS.indexOf(path.extname(f).toLowerCase()) >= 0;
    });

    if (!files.length) {
        console.log('assets/img/photos/ 里还没有图片。把照片放进去后再运行。');
        return;
    }

    var memberMap = loadMembers();

    var photos = files.map(function (f) {
        var full = path.join(IMG_DIR, f);
        var stat = fs.statSync(full);
        var info = parseName(f);

        /* 投稿人优先级：文件名 @ 后面写的 > 成员表匹配到的昵称 > 默认 */
        var uploader = info.uploader;
        if (!uploader) {
            var hit = memberMap[f];
            if (hit) uploader = hit.name || hit.gameId || DEFAULT_UPLOADER;
        }
        if (!uploader) uploader = DEFAULT_UPLOADER;

        /* 标题：文件名 @ 前面的部分。
           如果成员表里能匹配到这位，标题写成「游戏ID · 昵称」更好认 */
        var title = info.title;
        var mHit = memberMap[f];
        if (!info.uploader && mHit && mHit.gameId) {
            title = mHit.gameId + (mHit.name ? ' · ' + mHit.name : '');
        }

        return {
            id: 0,                                   // 下面统一编号
            title: title,
            uploader: uploader,
            image_url: 'assets/img/photos/' + f,     // 页面里用的相对路径
            created_at: fmtDate(stat.mtime),
            _mtime: stat.mtime.getTime()
        };
    });

    /* 按文件修改时间倒序：新放进去的排最前面 */
    photos.sort(function (a, b) { return b._mtime - a._mtime; });

    /* 编号 + 去掉内部排序用的临时字段 */
    photos = photos.map(function (p, i) {
        return {
            id: i + 1,
            title: p.title,
            uploader: p.uploader,
            image_url: p.image_url,
            created_at: p.created_at
        };
    });

    /* 写成 JS 文件（和成员的 data/members.js 一个套路，
       这样本地双击打开照片墙也能看到图片，不依赖 PHP） */
    var head = '/* 示例百业 · 照片墙本地图库（由 tools/scan-photos.js 生成）\n' +
               '   重新生成：node tools/scan-photos.js\n' +
               '   图片目录：assets/img/photos/\n' +
               '   命名：标题.jpg 或 标题@投稿人.jpg */\n';
    fs.writeFileSync(OUT, head + 'window.QN_PHOTOS = ' + JSON.stringify(photos, null, 4) + ';\n', 'utf8');

    console.log('已生成 data/photos.js：' + photos.length + ' 张照片');
    photos.slice(0, 8).forEach(function (p) {
        console.log('  · ' + p.title + '  —— ' + p.uploader + '  (' + p.created_at + ')');
    });
    if (photos.length > 8) console.log('  …… 其余 ' + (photos.length - 8) + ' 张');
}

/* 2026-10-26 14:03 */
function fmtDate(d) {
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

main();
