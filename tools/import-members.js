/* 从《成员信息收集表.xlsx》导入真实成员数据，并按游戏 ID 配图
   ------------------------------------------------------------
   配图规则（图片目录内按「游戏ID」命名）：
     <游戏ID>1.jpg  -> 外层卡片封面 cover
     <游戏ID>2.jpg  -> 点开后的大图   shot
     <游戏ID>.jpg   -> 没有 1/2 后缀时，内外用同一张
   用法：node tools/import-members.js [xlsx路径] [图片目录]
   ------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const XLSX = process.argv[2] ||
    './成员信息收集表.xlsx';
const IMG_DIR = process.argv[3] || './请改成你自己电脑上的路径';
const OUT_IMG = path.join(ROOT, 'assets', 'img', 'members');

/* ---------- 1. 解析 xlsx（zip + XML，无依赖） ---------- */
function readXlsx(file) {
    const tmp = path.join(ROOT, '_tmp_xlsx');
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    fs.copyFileSync(file, path.join(tmp, 'book.zip'));

    const zlib = require('zlib');
    const buf = fs.readFileSync(path.join(tmp, 'book.zip'));
    const files = {};

    /* 极简 zip 读取：定位 central directory */
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 xlsx/zip 文件');
    const count = buf.readUInt16LE(eocd + 10);
    let off = buf.readUInt32LE(eocd + 16);

    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(off) !== 0x02014b50) break;
        const method = buf.readUInt16LE(off + 10);
        const csize = buf.readUInt32LE(off + 20);
        const nameLen = buf.readUInt16LE(off + 28);
        const extraLen = buf.readUInt16LE(off + 30);
        const commentLen = buf.readUInt16LE(off + 32);
        const lho = buf.readUInt32LE(off + 42);
        const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');

        const lnLen = buf.readUInt16LE(lho + 26);
        const lxLen = buf.readUInt16LE(lho + 28);
        const dataStart = lho + 30 + lnLen + lxLen;
        const raw = buf.slice(dataStart, dataStart + csize);
        files[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
        off += 46 + nameLen + extraLen + commentLen;
    }

    const decodeEntities = s => s
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#10;/g, '\n')
        .replace(/&#39;/g, "'").replace(/&amp;/g, '&');

    const ss = files['xl/sharedStrings.xml'] ? files['xl/sharedStrings.xml'].toString('utf8') : '';
    const strs = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
        decodeEntities([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));

    const sheetName = Object.keys(files).find(k => /^xl\/worksheets\/sheet1\.xml$/.test(k));
    const sheet = files[sheetName].toString('utf8');

    const colIdx = c => c.replace(/[0-9]/g, '').split('')
        .reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

    const rows = [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(rm => {
        const r = {};
        [...rm[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)].forEach(cm => {
            const ci = colIdx(cm[1]);
            let v = '';
            const t = (cm[2].match(/t="([^"]+)"/) || [])[1];
            const vm = cm[3].match(/<v>([\s\S]*?)<\/v>/);
            if (vm) v = t === 's' ? (strs[+vm[1]] || '') : vm[1];
            else {
                const im = cm[3].match(/<t[^>]*>([\s\S]*?)<\/t>/);
                if (im) v = im[1];
            }
            if (v !== '') r[ci] = decodeEntities(String(v)).trim();
        });
        return r;
    });

    fs.rmSync(tmp, { recursive: true, force: true });
    return rows;
}

/* ---------- 2. 扫描图片目录 ---------- */
function scanImages(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp|gif|bmp)$/i.test(f));
}

/* ---------- 3. 生成 ---------- */
const rows = readXlsx(XLSX);
const imgs = scanImages(IMG_DIR);

const HEADER = rows[0] || {};
const col = name => {
    const k = Object.keys(HEADER).find(i => String(HEADER[i]).indexOf(name) >= 0);
    return k === undefined ? -1 : Number(k);
};
const C = {
    no: col('序号'), name: col('昵称'), gameId: col('游戏ID'), role: col('职位'),
    tagline: col('一句话'), bio: col('长一句'), schedule: col('作息'), sect: col('门派'),
    martial: col('武学'), base: col('常驻'), joined: col('时间'), play: col('主玩')
};

/* 图片 -> 游戏ID 映射：<ID>1 / <ID>2 / <ID> */
const picMap = {};
imgs.forEach(f => {
    const base = f.replace(/\.[^.]+$/, '');
    const m = base.match(/^(.*?)([12])$/);
    const id = m ? m[1] : base;
    const slot = m ? m[2] : '0';
    picMap[id] = picMap[id] || {};
    picMap[id][slot] = f;
});

fs.mkdirSync(OUT_IMG, { recursive: true });

const members = [];
let copied = 0;

rows.slice(1).forEach(r => {
    const name = r[C.name];
    if (!name) return;                                  /* 跳过空行 */
    if (!/^\d+$/.test(String(r[C.no] || ''))) return;    /* 跳过示例行 */

    const gameId = r[C.gameId] || '';
    const pic = picMap[gameId] || {};
    const pick = slot => {
        const f = pic[slot] || pic['0'];
        if (!f) return '';
        const src = path.join(IMG_DIR, f);
        const dst = path.join(OUT_IMG, f);
        if (fs.existsSync(src)) {
            if (!fs.existsSync(dst)) { fs.copyFileSync(src, dst); copied++; }
            return 'assets/img/members/' + f;
        }
        return '';
    };

    const cover = pick('1');
    const shot = pick('2') || cover;

    /* 长一句若是纯数字（误填年龄等）则丢弃 */
    let bio = r[C.bio] || '';
    if (/^\d+$/.test(bio.trim())) bio = '';

    members.push({
        id: members.length + 1,
        name: name,
        gameId: gameId,
        role: r[C.role] || '',
        tagline: r[C.tagline] || '',
        bio: bio,
        cover: cover,
        shot: shot,
        schedule: r[C.schedule] || '',
        sect: r[C.sect] || '',
        martial: r[C.martial] || '',
        base: r[C.base] || '',
        joined: r[C.joined] || '',
        play: r[C.play] || ''
    });
});

const banner =
    '/* 示例百业 · 成员数据（由 tools/import-members.js 从《成员信息收集表.xlsx》导入）\n' +
    '   重新导入：node tools/import-members.js\n' +
    '   图片规则：<游戏ID>1 = 卡片封面，<游戏ID>2 = 详情大图，无后缀 = 内外同一张 */\n';

fs.writeFileSync(path.join(ROOT, 'data', 'members.js'),
    banner + 'window.QN_MEMBERS = ' + JSON.stringify(members, null, 4) + ';\n', 'utf8');

console.log('导入成员 ' + members.length + ' 位，复制图片 ' + copied + ' 张 -> assets/img/members/');
members.forEach(m => {
    console.log('  ' + String(m.id).padStart(2) + ' ' + m.name.padEnd(8, '　') +
        ' 【' + m.role + '】 封面:' + (m.cover ? '有' : '无') + ' 大图:' + (m.shot ? '有' : '无'));
});
const noPic = members.filter(m => !m.cover);
if (noPic.length) console.log('⚠ 未配图: ' + noPic.map(m => m.name + '(' + m.gameId + ')').join(', '));
