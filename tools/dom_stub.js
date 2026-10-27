/* Node 最小 DOM 模拟：供前端模块冒烟测试使用
   用法：
     const env = require('./dom_stub').create({
         ids: [...HTML 里出现的所有 id...],
         tree: { memberModal: ['mmShot', 'mmName', ...] }   // 可选，组装父子关系
     });
     env.store['xxx'] 取元素；env.document / env.window 供被测脚本使用 */
function mkEl(tag, id) {
    const cls = new Set();
    const e = {
        tagName: (tag || 'div').toUpperCase(),
        id: id || '', value: '', textContent: '', _html: '',
        type: '', checked: true, disabled: false,
        style: {}, children: [], dataset: {}, parentNode: null,
        _attr: {}, _ev: {},
        classList: {
            add: (...c) => c.forEach(x => cls.add(x)),
            remove: (...c) => c.forEach(x => cls.delete(x)),
            toggle: (c, on) => (on === undefined
                ? (cls.has(c) ? cls.delete(c) : cls.add(c))
                : (on ? cls.add(c) : cls.delete(c))),
            contains: c => cls.has(c)
        },
        appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
        replaceChild(n, o) {
            const i = this.children.indexOf(o);
            if (i >= 0) this.children[i] = n;
            n.parentNode = this;
            return n;
        },
        addEventListener(t, fn) { (this._ev[t] = this._ev[t] || []).push(fn); },
        removeEventListener() {},
        dispatch(t, extra) {
            (this._ev[t] || []).forEach(fn => fn.call(this, Object.assign({ target: this }, extra || {})));
        },
        setAttribute(k, v) { this._attr[k] = String(v); },
        getAttribute(k) { return this._attr[k] === undefined ? null : this._attr[k]; },
        focus() {},
        scrollIntoView() {},
        closest(sel) {
            const key = sel.replace('.', '');
            let n = this;
            while (n) {
                if (n.classList && n.classList.contains(key)) return n;
                n = n.parentNode;
            }
            return null;
        },
        querySelector(sel) {
            const key = sel.replace('.', '');
            const walk = (n) => {
                for (const c of n.children || []) {
                    if (c.classList && c.classList.contains(key)) return c;
                    const r = walk(c);
                    if (r) return r;
                }
                return null;
            };
            return walk(this);
        },
        querySelectorAll(sel) {
            const out = [];
            const key = sel.replace('.', '').split('[')[0];
            const walk = (n) => {
                (n.children || []).forEach(c => {
                    if (c.tagName === 'IMG' && key === 'img') out.push(c);
                    if (c.classList && c.classList.contains(key)) out.push(c);
                    walk(c);
                });
            };
            walk(this);
            return out;
        }
    };
    Object.defineProperty(e, 'className', {
        get() { return [...cls].join(' '); },
        set(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach(x => cls.add(x)); }
    });
    Object.defineProperty(e, 'innerHTML', {
        get() { return e._html; },
        set(v) { e._html = v; if (v === '') e.children = []; }
    });
    Object.defineProperty(e, 'options', { get() { return e.children; } });
    return e;
}

function create(opt) {
    const ids = (opt && opt.ids) || [];
    const tree = (opt && opt.tree) || {};
    const store = {};
    ids.forEach(i => { store[i] = mkEl('div', i); });

    Object.keys(tree).forEach(parentId => {
        const p = store[parentId] || (store[parentId] = mkEl('div', parentId));
        tree[parentId].forEach(childId => {
            const c = store[childId] || (store[childId] = mkEl('div', childId));
            p.appendChild(c);
        });
    });

    const doc = {
        readyState: 'complete',
        activeElement: null,
        getElementById: id => store[id] || null,
        createElement: t => mkEl(t),
        querySelector: () => mkEl('div'),
        querySelectorAll: () => [],
        _ev: {},
        addEventListener(t, fn) { (this._ev[t] = this._ev[t] || []).push(fn); },
        removeEventListener() {},
        dispatch(t, ev) { (this._ev[t] || []).forEach(fn => fn(ev)); }
    };

    const win = {
        document: doc,
        _ev: {},
        addEventListener(t, fn) { (this._ev[t] = this._ev[t] || []).push(fn); }
    };

    return { store, document: doc, window: win, mkEl };
}

module.exports = { create, mkEl };
