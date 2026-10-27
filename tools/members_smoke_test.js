/* 百业成员模块冒烟测试（Node + 最小 DOM 模拟）
   用法：node tools/members_smoke_test.js
   断言全部按 data/members.js 的真实数据动态计算，改数据不会误报 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);

const stub = require('./dom_stub');
const env = stub.create({ ids });
const store = env.store;
const mkEl = stub.mkEl;

/* 组装弹窗子树：modal > (.mm-mask, .mm-panel > mmShot/...) */
const modal = store['memberModal'];
const mask = mkEl('div'); mask.className = 'mm-mask';
const panel = mkEl('div'); panel.className = 'mm-panel';
modal.appendChild(mask); modal.appendChild(panel);
['mmShot', 'mmName', 'mmRole', 'mmTagline', 'mmBio', 'mmInfo', 'mmBack', 'mmClose'].forEach(id => panel.appendChild(store[id]));

global.document = env.document;
global.window = env.window;

eval(fs.readFileSync(path.join(ROOT, 'data', 'members.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'assets', 'js', 'members.js'), 'utf8'));

const M = global.window.QN_MEMBERS;
const grid = store['membersGrid'];
const pass = [], fail = [];
function check(name, ok, got) {
    (ok ? pass : fail).push(name + (ok ? '' : ' => ' + got));
}

const PAGE = 14;
const total = M.length;
const pages = Math.max(1, Math.ceil(total / PAGE));
const first = M[0];

check('统计数据加载', total > 0, total);
check('统计文案', store['membersStat'].textContent === total + ' 位 · ' + pages + ' 页',
    store['membersStat'].textContent);
check('首页卡数', (grid._html.match(/member-card/g) || []).length === Math.min(PAGE, total),
    (grid._html.match(/member-card/g) || []).length);
check('页码显示', store['membersCur'].textContent === '01' && store['membersTotal'].textContent === String(pages).padStart(2, '0'),
    store['membersCur'].textContent + '/' + store['membersTotal'].textContent);
check('圆点数', store['membersDots'].children.length === pages, store['membersDots'].children.length);
check('首页上一页禁用', store['membersPrev'].disabled === true, String(store['membersPrev'].disabled));
check('单页时下一页也禁用', pages === 1 ? store['membersNext'].disabled === true : true,
    String(store['membersNext'].disabled));

/* 卡片结构：真实截图 + 简介 + 查看更多 */
check('卡片用真实截图', grid._html.indexOf('assets/img/members/') >= 0, grid._html.slice(0, 120));
check('卡片无占位图', grid._html.indexOf('data:image/svg+xml') < 0, '仍是占位图');
check('卡片含查看更多', grid._html.indexOf('查看更多') >= 0, '无');
check('卡片含职位角标', grid._html.indexOf('mc-badge') >= 0, '无');
check('卡片显示游戏ID', grid._html.indexOf(first.gameId) >= 0, grid._html.slice(0, 160));
check('卡片不把昵称当标题', grid._html.indexOf('>' + first.name + '<') < 0, '仍是昵称');

/* 打开弹窗：模拟点击第一张卡 */
const card = mkEl('article');
card.className = 'member-card';
card.setAttribute('data-id', String(first.id));
grid.appendChild(card);
grid.dispatch('click', { target: card });

check('弹窗打开', modal.classList.contains('show'), modal.className);
check('弹窗大标题为游戏ID', store['mmName'].textContent === first.gameId, store['mmName'].textContent);
check('弹窗职位', store['mmRole'].textContent === first.role, store['mmRole'].textContent);
check('弹窗简介', store['mmTagline'].textContent === (first.tagline || ''), store['mmTagline'].textContent);
check('弹窗大图', String(store['mmShot'].src).indexOf('assets/img/members/') >= 0 || !first.shot,
    String(store['mmShot'].src).slice(0, 60));

const info = store['mmInfo']._html;
check('身份显示作息', !first.schedule || info.indexOf('作息') >= 0, info.slice(0, 80));
check('身份显示门派', !first.sect || info.indexOf('门派') >= 0, info.slice(0, 80));
check('身份显示武学', !first.martial || info.indexOf('武学') >= 0, info.slice(0, 80));
check('身份显示常驻', !first.base || info.indexOf('常驻') >= 0, info.slice(0, 80));
check('身份显示入游', !first.joined || info.indexOf('入游') >= 0, info.slice(0, 80));
check('身份表显示昵称', !first.name || info.indexOf(first.name) >= 0, info.slice(0, 200));

/* 「回到江湖」关闭弹窗 */
store['mmBack'].dispatch('click', { preventDefault() {} });
check('回到江湖关闭弹窗', !modal.classList.contains('show'), modal.className);

/* 再次打开后用 ESC 关闭 */
grid.dispatch('click', { target: card });
document.dispatch('keydown', { key: 'Escape' });
check('ESC 关闭弹窗', !modal.classList.contains('show'), modal.className);

console.log('通过 ' + pass.length + ' 项');
if (fail.length) {
    console.log('失败 ' + fail.length + ' 项：');
    fail.forEach(f => console.log('  ✗ ' + f));
    process.exitCode = 1;
} else {
    console.log('✔ 百业成员模块冒烟测试全部通过（' + total + ' 位真实成员 / ' + pages + ' 页）');
}
