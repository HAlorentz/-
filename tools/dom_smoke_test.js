/* 最小 DOM 模拟：跑一遍 calculator.js 的初始化，看 buildNote 里到底出现什么 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync('calculator.html', 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);

function mkEl(tag, id) {
    const e = {
        tagName: (tag || 'div').toUpperCase(),
        id: id || '',
        value: '',
        textContent: '',
        innerHTML: '',
        type: '',
        checked: true,
        style: {},
        children: [],
        className: '',
        classList: { add() {}, remove() {}, toggle() {} },
        appendChild(c) {
            this.children.push(c);
            registerDeep(c);
            /* 模拟原生 <select>：追加 option 后若未选过则自动选中第一项 */
            if (this.tagName === 'SELECT' && c.tagName === 'OPTION' && !this.value) {
                this.value = c.value;
            }
            return c;
        },
        _ev: {},
        addEventListener(t, fn) { (this._ev[t] = this._ev[t] || []).push(fn); },
        dispatch(t) { (this._ev[t] || []).forEach(fn => fn.call(this, { target: this })); },
        removeEventListener() {},
        setAttribute() {},
        getAttribute() { return null; },
        querySelector() { return mkEl('div'); },
        querySelectorAll() { return []; },
        focus() {}
    };
    e.classList = { add() {}, remove() {}, toggle() {} };
    Object.defineProperty(e, 'options', { get() { return e.children; } });
    Object.defineProperty(e, 'innerHTML', {
        get() { return e._html || ''; },
        set(v) { e._html = v; if (v === '') { e.children = []; e.value = ''; } }
    });
    return e;
}

const store = {};
ids.forEach(i => { store[i] = mkEl('div', i); });

/* 动态创建的元素挂进 DOM 后也要能被 getElementById 找到（含子孙） */
function registerDeep(el) {
    if (!el || typeof el !== 'object') return;
    if (el.id) store[el.id] = el;
    (el.children || []).forEach(registerDeep);
}
store['selBuild'].tagName = 'SELECT';
store['selVersion'].tagName = 'SELECT';

global.document = {
    readyState: 'complete',
    getElementById: (id) => store[id] || null,
    createElement: (t) => mkEl(t),
    querySelector: () => mkEl('div'),
    querySelectorAll: () => [],
    addEventListener() {}
};
global.window = { document: global.document };
global.fetch = (url) => {
    const f = String(url).replace(/^https?:\/\/[^/]+\//, '');
    try {
        const txt = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(txt)) });
    } catch (e) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404 ' + f)) });
    }
};

['assets/js/damage-model.js', 'assets/js/data-loader.js', 'assets/js/calculator.js'].forEach(f => {
    eval(fs.readFileSync(f, 'utf8'));
});

setTimeout(() => {
    console.log('[初始] buildNote =', JSON.stringify(store['buildNote'].textContent).slice(0, 120));
    console.log('[初始] setInfo   =', JSON.stringify(store['setInfo'].textContent));
    console.log('[初始] 流派选项 =', store['selBuild'].children.length, '｜建议块 =', store['fsAdvice'].children.length);

    /* 模拟切换流派 -> 鸣金虹 */
    store['selBuild'].value = '鸣金虹';
    store['selBuild'].dispatch('change');

    setTimeout(() => {
        console.log('[切换鸣金虹] setInfo =', JSON.stringify(store['setInfo'].textContent));
        console.log('[切换鸣金虹] buildNote =', JSON.stringify(store['buildNote'].textContent).slice(0, 120));
        console.log('[切换鸣金虹] 毕业度 =', JSON.stringify(store['resGrad'].textContent),
                    '｜总伤 =', JSON.stringify(store['resTotal'].textContent),
                    '｜乘区 =', JSON.stringify(store['resDmgMul'].textContent));
        console.log('[切换鸣金虹] 确认卡 =', JSON.stringify(store['buildConfirm'].textContent));
        console.log('[切换鸣金虹] 建议块 =', store['fsAdvice'].children.length);
    }, 600);
}, 800);
