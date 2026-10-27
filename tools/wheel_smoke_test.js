/* 规则转盘冒烟测试（Node + 最小 DOM/Canvas 模拟）
   用法：node tools/wheel_smoke_test.js
   验证：PVP 21 项 / PVE 34 项均分角度、随机停止能命中全部扇区、
        字号自适应与折行、旋转期间禁用 GO、结果弹窗与关闭重置 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const stub = require('./dom_stub');
const env = stub.create({ ids: [] });
const mkEl = stub.mkEl;

const ctxStub = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (typeof k === 'string' ? (t[k] = () => {}) : undefined)),
    set: (t, k, v) => { t[k] = v; return true; }
});

let now = 0;
global.window = env.window;
global.window.devicePixelRatio = 1;
global.window.performance = { now: () => now };
global.window.requestAnimationFrame = fn => setTimeout(() => { now += 99999; fn(now); }, 0);
global.document = env.document;

eval(fs.readFileSync(path.join(ROOT, 'assets', 'js', 'wheel.js'), 'utf8'));

const W = global.window.QNWheel;
const pass = [], fail = [];
const check = (name, ok, got) => (ok ? pass : fail).push(name + (ok ? '' : ' => ' + got));

check('PVP 21 项', W.PVP_DATA.length === 21, W.PVP_DATA.length);
check('PVE 34 项', W.PVE_DATA.length === 34, W.PVE_DATA.length);

[['PVP', W.PVP_DATA], ['PVE', W.PVE_DATA]].forEach(pair => {
    const [name, data] = pair;
    const n = data.length, seg = Math.PI * 2 / n;

    /* 随机停止应能覆盖全部扇区 */
    const hit = new Set();
    for (let i = 0; i < n * 100; i++) hit.add(W.indexAtRotation(i * 0.003, n));
    check(name + ' 可命中全部扇区', hit.size === n, hit.size + '/' + n);

    /* 每个扇区可被精确命中 */
    let ok = true;
    for (let i = 0; i < n; i++) {
        const rot = -(i + 0.5) * seg - Math.PI / 2;
        if (W.indexAtRotation(rot, n) !== i) ok = false;
    }
    check(name + ' 每扇区可精确命中', ok, '部分对不上');

    /* 字号自适应 + 折行 */
    const R = 215, rIn = R * 0.26, rOut = R * 0.965;
    let min = 99, max = 0, bad = [];
    data.forEach(text => {
        const lay = W.layoutText(text, rIn, rOut, seg);
        min = Math.min(min, lay.fs); max = Math.max(max, lay.fs);
        if (!(lay.fs >= 9 && lay.fs <= 22 && lay.lines.length <= 3 && lay.lines.join('') === text)) bad.push(text);
    });
    check(name + ' 排版合法', bad.length === 0, bad.join(','));
    check(name + ' 字号区间', min >= 9 && max <= 22, min + '~' + max);
});

/* 实例级：点 GO -> 旋转中禁用 -> 弹出规则 -> 确认关闭重置 */
function makeInstance() {
    const canvas = mkEl('canvas');
    canvas.clientWidth = 430;
    canvas.getContext = () => ctxStub;
    const btn = mkEl('button');
    const modal = mkEl('div');
    const mask = mkEl('div'); mask.className = 'wm-mask'; modal.appendChild(mask);
    const rule = mkEl('div');
    const confirm = mkEl('button');
    return { inst: W.create({ canvas, btn, modal, rule, confirm, data: W.PVE_DATA, palette: W.PALETTES.pve }), btn, modal, rule, confirm };
}

const a = makeInstance();
check('实例创建成功（34 项）', a.inst && a.inst.count === 34, a.inst ? a.inst.count : 'null');
a.btn.dispatch('click');
check('旋转中禁用 GO', a.btn.disabled === true, String(a.btn.disabled));

setTimeout(() => {
    check('弹窗打开', a.modal.classList.contains('show'), a.modal.className);
    check('结果文案格式', /^本局规则：【.+】$/.test(a.rule.textContent), a.rule.textContent);
    check('结果来自 PVE 数据', W.PVE_DATA.some(t => a.rule.textContent.indexOf(t) >= 0), a.rule.textContent);

    a.confirm.dispatch('click');
    check('确认后关闭弹窗', !a.modal.classList.contains('show'), a.modal.className);
    check('确认后重置 GO', a.btn.disabled === false && a.btn.textContent === 'GO',
        a.btn.disabled + '/' + a.btn.textContent);

    /* 两个转盘互不干扰 */
    const b = makeInstance();
    b.btn.dispatch('click');
    check('第二个实例独立运行', b.btn.disabled === true && a.btn.disabled === false,
        'b:' + b.btn.disabled + ' a:' + a.btn.disabled);

    setTimeout(() => {
        check('第二实例结果正常', /^本局规则：【.+】$/.test(b.rule.textContent), b.rule.textContent);
        b.confirm.dispatch('click');
        check('第二实例关闭后重置', b.btn.disabled === false, String(b.btn.disabled));

        console.log('通过 ' + pass.length + ' 项');
        if (fail.length) {
            console.log('失败 ' + fail.length + ' 项：');
            fail.forEach(f => console.log('  ✗ ' + f));
            process.exitCode = 1;
        } else {
            console.log('✔ 规则转盘冒烟测试全部通过');
        }
    }, 60);
}, 60);
