/* ============================================================
   竞速毕业计算器 · 页面逻辑（数据驱动）
   ------------------------------------------------------------
   表单全部由 data/*.json 动态生成：
     换版本 / 换流派 / 换数值结构  =>  只改数据，不动这里。
   ============================================================ */
(function () {
    'use strict';

    var el = function (id) { return document.getElementById(id); };

    /* 元素缺失时安静跳过，避免页面结构调整导致整页刷新中断 */
    function setTxt(id, txt) { var e = el(id); if (e) e.textContent = txt; }

    /* 读输入框（元素不存在时用表内默认值） */
    function iv(id, d) { var e = el(id); return num(e ? e.value : undefined, d === undefined ? 0 : d); }

    /* ---------- 增益加成文案 ---------- */
    var BUFF_DESC = [
        { key: 'gen', label: '通用增伤' },
        { key: 'atkBonus', label: '外功加成' },
        { key: 'pen', label: '外功穿透' },
        { key: 'physDmg', label: '外攻伤害' },
        { key: 'elemAtk', label: '属性攻击' },
        { key: 'critRate', label: '会心率' },
        { key: 'critDmg', label: '会心伤害' },
        { key: 'overRate', label: '会意率' },
        { key: 'overDmg', label: '会意伤害' },
        { key: 'special', label: '特殊增伤' },
        { key: 'settle', label: '结算增伤' }
    ];

    var state = { build: null };

    function num(v, d) {
        if (v === null || v === undefined || typeof v === 'boolean') return d || 0;
        var n = parseFloat(v);
        return isNaN(n) ? (d || 0) : n;
    }

    function fmt(n, d) {
        if (!isFinite(n)) return '0';
        return Number(n).toLocaleString('zh-CN', {
            minimumFractionDigits: d || 0, maximumFractionDigits: d || 0
        });
    }

    function round4(n) { return Math.round(num(n) * 10000) / 10000; }

    function mk(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function field(labelText, inputId, value, unit, attrs) {
        var w = mk('div', 'field');
        var lb = mk('label', null, labelText);
        lb.setAttribute('for', inputId);
        w.appendChild(lb);

        var iw = mk('div', 'input-wrap');
        var inp = document.createElement('input');
        inp.type = 'number';
        inp.id = inputId;
        inp.step = '0.01';
        inp.value = value === undefined || value === null ? 0 : value;
        if (attrs) Object.keys(attrs).forEach(function (a) { inp.setAttribute(a, attrs[a]); });
        iw.appendChild(inp);
        if (unit) iw.appendChild(mk('span', 'unit', unit));
        w.appendChild(iw);
        return w;
    }

    /* ---------------- 渲染输入表单 ---------------- */

    /* 基础属性里直接给出的 raw 键（不在「增效效果」区重复渲染） */
    var RAW_SKIP = {
        '精准率': 1, '会心率': 1, '会意率': 1,
        '直接会心率': 1, '直接会意率': 1, '食物加成': 1
    };

    /* raw 键 -> 内核同名全局键（概率类 / 伤害加成类） */
    var RAW_TO_GLOBAL = {
        '精准率': 'accRate',
        '会心率': 'critRate',
        '会意率': 'overRate',
        '直接会心率': 'directCritRate',
        '直接会意率': 'directOverRate',
        '会心伤害加成': 'critDmg',
        '会意伤害加成': 'overDmg',
        '固伤加成': 'fixedDmg'
    };

    /* raw 键 -> 展示名（参照原版小助手的叫法） */
    function rawLabel(k) {
        if (k === '全武增') return '全武学增效';
        if (k === '首领增') return '对首领单位增伤';
        if (k.indexOf('定音') >= 0) return k.replace(/定音$/, '定音增伤');
        if (/增$/.test(k) && k.length <= 3) return k.replace(/增$/, '武学增伤');
        if (/增$/.test(k)) return k.replace(/增$/, '增伤');
        return k;
    }

    function buildForm(b) {
        var fsPanel = el('fsPanel'), fsGlobal = el('fsGlobal'),
            fsExtra = el('fsExtra'), fsBuff = el('fsBuff');
        [fsPanel, fsGlobal, fsExtra, fsBuff].forEach(function (f) { f.innerHTML = ''; });

        /* ===== 1. 基础属性（只含人物面板内容） ===== */
        fsPanel.appendChild(mk('legend', 'fieldset-title', '基础属性'));

        var pw = mk('div', 'grid-3');
        pw.appendChild(field('外功攻击（最小）', 'panel_min_外功', round4(b.panel['外功'].min)));
        pw.appendChild(field('外功攻击（最大）', 'panel_max_外功', round4(b.panel['外功'].max)));
        pw.appendChild(field('外功穿透（定音+非定音）', 'panel_pen_外功',
                            round4(b.panel['外功'].pen)));
        fsPanel.appendChild(pw);

        var rate = mk('div', 'grid-3');
        rate.appendChild(field('精准率', 'raw_精准率', round4(num(b.global.raw['精准率']) * 100), '%'));
        rate.appendChild(field('会心率', 'raw_会心率', round4(num(b.global.raw['会心率']) * 100), '%'));
        rate.appendChild(field('会意率', 'raw_会意率', round4(num(b.global.raw['会意率']) * 100), '%'));
        fsPanel.appendChild(rate);

        var direct = mk('div', 'grid-2');
        direct.appendChild(field('直接会心率', 'raw_直接会心率',
                                round4(num(b.global.raw['直接会心率']) * 100), '%'));
        direct.appendChild(field('直接会意率', 'raw_直接会意率',
                                round4(num(b.global.raw['直接会意率']) * 100), '%'));
        fsPanel.appendChild(direct);

        /* 属种攻击（流派自适应：鸣金虹=鸣金+无相，破竹尘=破竹+无相…） */
        Object.keys(b.panel).forEach(function (k) {
            if (k === '外功') return;
            var p = b.panel[k] || {};
            var grp = mk('div', 'attr-group');
            var isWu = k === '无相';
            grp.appendChild(mk('div', 'attr-group-head', k + '攻击'));

            if (isWu) {
                var rowWu = mk('div', 'grid-2');
                rowWu.appendChild(field('最小攻击', 'panel_min_' + k, round4(p.min)));
                rowWu.appendChild(field('最大攻击', 'panel_max_' + k, round4(p.max)));
                grp.appendChild(rowWu);
            } else {
                var rowA = mk('div', 'grid-3');
                rowA.appendChild(field('最小攻击', 'panel_min_' + k, round4(p.min)));
                rowA.appendChild(field('最大攻击', 'panel_max_' + k, round4(p.max)));
                rowA.appendChild(field('属攻穿透（定音+非定音）', 'panel_pen_' + k, round4(p.pen)));
                grp.appendChild(rowA);
                var rowB = mk('div', 'grid-2');
                rowB.appendChild(field('属伤加成', 'panel_dmg_' + k, round4(num(p.dmg) * 100), '%'));
                grp.appendChild(rowB);
            }
            fsPanel.appendChild(grp);
        });

        /* ===== 2. 增效效果（流派自适应：来自原表全局区） ===== */
        fsGlobal.appendChild(mk('legend', 'fieldset-title', '增效效果（流派自适应 · 来自原表）'));
        var g3 = mk('div', 'grid-3');
        Object.keys(b.global.raw || {}).forEach(function (k) {
            if (RAW_SKIP[k]) return;
            g3.appendChild(field(rawLabel(k), 'raw_' + k,
                                round4(num(b.global.raw[k]) * 100), '%'));
        });
        fsGlobal.appendChild(g3);

        /* 3. 额外叠加增伤（不含表内已有） */
        fsExtra.appendChild(mk('legend', 'fieldset-title', '额外叠加增伤（不含表内已有）'));
        var e3 = mk('div', 'grid-3');
        e3.appendChild(field('通用增伤', 'extraGeneral', 0, '%'));
        e3.appendChild(field('首领增伤', 'extraBoss', 0, '%'));
        e3.appendChild(field('特殊增伤', 'extraSpecial', 0, '%'));
        fsExtra.appendChild(e3);

        /* 4. 增益开关：只列竞速轴里真正用到的 */
        fsBuff.appendChild(mk('legend', 'fieldset-title', '增益开关（默认全开）'));
        var bg = mk('div', 'buff-grid');
        var used = [];
        b.rotation.forEach(function (r) {
            r.buffs.forEach(function (n) { if (used.indexOf(n) < 0) used.push(n); });
        });
        used.forEach(function (n) {
            var item = mk('label', 'buff-item is-on');
            var box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = true;
            box.setAttribute('data-buff', n);
            box.addEventListener('change', function () {
                item.classList.toggle('is-on', box.checked);
                update();
            });
            item.appendChild(box);
            item.appendChild(mk('span', 'b-name', n));
            item.appendChild(mk('span', 'b-val', buffDesc(b.buffs[n])));
            bg.appendChild(item);
        });
        fsBuff.appendChild(bg);
    }

    function buffDesc(b) {
        if (!b) return '';
        var out = [];
        BUFF_DESC.forEach(function (d) {
            if (num(b[d.key])) out.push(d.label + '+' + round4(num(b[d.key]) * 100) + '%');
        });
        return out.slice(0, 2).join(' ');
    }

    /* ---------------- 收集表单 -> override ---------------- */
    function collect(b) {
        var o = { panel: {}, global: {}, toggles: {}, buffsOff: {} };

        Object.keys(b.panel).forEach(function (k) {
            var p = b.panel[k] || {};
            o.panel[k] = {
                min: iv('panel_min_' + k, num(p.min)),
                max: iv('panel_max_' + k, num(p.max)),
                pen: iv('panel_pen_' + k, num(p.pen)),
                dmg: iv('panel_dmg_' + k, num(p.dmg) * 100) / 100
            };
        });

        /* 增效效果（raw 字段）-> 内核参数
           规则（与原表公式一致）：
             全武增  Δ  => 所有 typeDmg += Δ   （typeDmg[X] = 全武增 + X增）
             首领增  Δ  => setGeneralDmg += Δ  （G3 = 首领增 + 1.5% + 开关）
             X增    Δ   => typeDmg[X] += Δ     （伞/鼓/剑/陌刀…）
             奇术增  Δ  => 单体奇术 & 群体奇术 += Δ
             *定音      => tunings 对应项 bonus
             其余       => 同名全局键（会心伤害加成/固伤加成…）           */
        var baseGen = num(b.global.setGeneralDmg);
        var typeDmg = {};
        for (var tk in (b.typeDmg || {})) {
            if (Object.prototype.hasOwnProperty.call(b.typeDmg, tk)) typeDmg[tk] = num(b.typeDmg[tk]);
        }
        var tunings = (b.constants.tunings || []).map(function (t) {
            return { keyword: t.keyword, bonus: num(t.bonus) };
        });
        var rawNow = b.global.raw || {};

        Object.keys(rawNow).forEach(function (k) {
            var input = el('raw_' + k);
            if (!input) return;
            var v = num(input.value, num(rawNow[k]) * 100) / 100;
            var delta = v - num(rawNow[k]);

            /* 概率类 / 伤害类：直接写同名全局键 */
            if (RAW_TO_GLOBAL[k]) { o.global[RAW_TO_GLOBAL[k]] = v; return; }
            if (k.indexOf('定音') >= 0) {
                var kw = k.replace(/定音$/, '');
                tunings.forEach(function (t) { if (t.keyword === kw) t.bonus = v; });
                if (tunings.length === 1 && tunings[0].keyword === kw) {
                    o.global.tuningBonus = v;
                    o.global.umbrellaTuning = v;
                }
                return;
            }
            if (k === '全武增') {
                for (var d1 in typeDmg) typeDmg[d1] += delta;
                return;
            }
            if (k === '首领增') { o.global.setGeneralDmg = baseGen + delta; return; }
            if (k === '奇术增') {
                if (typeDmg['单体奇术'] !== undefined) typeDmg['单体奇术'] += delta;
                if (typeDmg['群体奇术'] !== undefined) typeDmg['群体奇术'] += delta;
                return;
            }
            if (/增$/.test(k)) {
                var tkey = k.replace(/增$/, '');
                if (typeDmg[tkey] !== undefined) typeDmg[tkey] += delta;
            }
        });

        o.typeDmg = typeDmg;
        o.tunings = tunings;

        o.extraGeneral = num(iv('extraGeneral'), 0) / 100;
        o.extraBoss = num(iv('extraBoss'), 0) / 100;
        o.extraSpecial = num(iv('extraSpecial'), 0) / 100;

        document.querySelectorAll('#fsBuff input[type="checkbox"]').forEach(function (box) {
            if (!box.checked) o.buffsOff[box.getAttribute('data-buff')] = true;
        });

        return o;
    }

    /* ---------------- 渲染结果 ---------------- */
    function renderResult(res, b) {
        var grad = res.graduation;
        setTxt('resGrad', fmt(grad, 2));
        setTxt('resTarget', fmt(res.graduationBase, 0));
        setTxt('resAdps', fmt(res.adps, 0));
        setTxt('resTotal', fmt(res.total, 0));
        setTxt('resPerSec', fmt(res.adps, 0));
        setTxt('resDef', fmt(res.defense, 1));

        var bar = el('gradBar');
        if (bar) bar.style.width = Math.min(100, Math.max(0, grad)) + '%';

        /* 各乘区按伤害加权平均 */
        var sw = 0, a = { pen: 0, crit: 0, over: 0, critDmg: 0, overDmg: 0, mul: 0 };
        res.rows.forEach(function (r) {
            if (r.settle) return;
            var w = num(r.expect);
            sw += w;
            a.pen += w * num(r.penRate);
            a.crit += w * num(r.pCrit);
            a.over += w * num(r.pOver);
            a.critDmg += w * num(r.critDmg);
            a.overDmg += w * num(r.overDmg);
            a.mul += w * num(r.dmgMul);
        });
        if (sw > 0) {
            setTxt('resPenRate', fmt(a.pen / sw * 100, 2) + '%');
            setTxt('resCrit', fmt(a.crit / sw * 100, 2) + '%');
            setTxt('resOver', fmt(a.over / sw * 100, 2) + '%');
            setTxt('resCritDmg', fmt(a.critDmg / sw * 100, 2) + '%');
            setTxt('resOverDmg', fmt(a.overDmg / sw * 100, 2) + '%');
            setTxt('resDmgMul', fmt(a.mul / sw, 4));
        } else {
            ['resPenRate', 'resCrit', 'resOver', 'resCritDmg', 'resOverDmg', 'resDmgMul'].forEach(function (id) {
                setTxt(id, '-');
            });
        }

        var tip = res.graduation >= 100 ? '已达标 · 恭喜毕业，可以考虑冲榜了'
            : res.graduation >= 85 ? '接近毕业 · 差一点点，建议查漏补缺'
            : res.graduation >= 60 ? '中后期 · 优先堆穿透与会心收益更高'
            : '养成中 · 建议先补齐外功与增伤词条';
        setTxt('gradTip', tip);

        /* 面板数据确认卡（对照原版小助手） */
        if (b) {
            setTxt('buildConfirm', b.meta.name + ' · ' + (b.meta.setName || '-') + '套装 · v'
                + b.meta.version + ' · 毕业度 ' + fmt(grad, 2) + '%');
        }
    }

    /* ---------------- 主流程 ---------------- */
    function update() {
        if (!state.build) return;
        var res = window.QNModel.compute(state.build, collect(state.build));
        renderResult(res, state.build);
        renderAdvice(state.build, res);
        renderSelfCheck(res, state.build);
    }

    /* ---------------- 装备优化建议（实测边际收益） ---------------- */
    function cloneOvr(o) {
        var n = {
            panel: {}, global: {}, typeDmg: {}, tunings: [],
            extraGeneral: o.extraGeneral, extraBoss: o.extraBoss,
            extraSpecial: o.extraSpecial, buffsOff: o.buffsOff
        };
        Object.keys(o.panel || {}).forEach(function (k) {
            n.panel[k] = { min: o.panel[k].min, max: o.panel[k].max,
                           pen: o.panel[k].pen, dmg: o.panel[k].dmg };
        });
        Object.keys(o.global || {}).forEach(function (k) { n.global[k] = o.global[k]; });
        Object.keys(o.typeDmg || {}).forEach(function (k) { n.typeDmg[k] = o.typeDmg[k]; });
        (o.tunings || []).forEach(function (t) {
            n.tunings.push({ keyword: t.keyword, bonus: t.bonus });
        });
        return n;
    }

    function renderAdvice(b, res) {
        var box = el('fsAdvice');
        if (!box) return;
        box.innerHTML = '';

        var base = collect(b);
        var t0 = res.total;
        if (!t0) return;

        var main = b.meta.attrType;
        var items = [];

        function probe(label, unit, apply) {
            var o = cloneOvr(base);
            if (apply(o) === false) return;
            var t = window.QNModel.compute(b, o).total;
            items.push({ label: label, unit: unit, pct: (t - t0) / t0 * 100 });
        }

        probe('外功攻击', '+100', function (o) {
            if (!o.panel['外功']) return false;
            o.panel['外功'].min += 100; o.panel['外功'].max += 100;
        });
        probe(main + '攻击（主属种）', '+100', function (o) {
            if (!o.panel[main]) return false;
            o.panel[main].min += 100; o.panel[main].max += 100;
        });
        probe('无相攻击', '+10', function (o) {
            if (!o.panel['无相']) return false;
            o.panel['无相'].min += 10; o.panel['无相'].max += 10;
        });
        probe('外功穿透', '+10', function (o) { o.panel['外功'].pen += 10; });
        probe(main + '穿透（主属种）', '+10', function (o) {
            if (!o.panel[main]) return false;
            o.panel[main].pen += 10;
        });
        probe('精准率', '+1%', function (o) {
            o.global.accRate = num(o.global.accRate, num(b.global.accRate)) + 0.01;
        });
        probe('会心率', '+1%', function (o) {
            o.global.critRate = num(o.global.critRate, num(b.global.critRate)) + 0.01;
        });
        probe('会意率', '+1%', function (o) {
            o.global.overRate = num(o.global.overRate, num(b.global.overRate)) + 0.01;
        });
        probe('会心伤害加成', '+1%', function (o) {
            o.global.critDmg = num(o.global.critDmg, num(b.global.critDmg)) + 0.01;
        });
        probe('会意伤害加成', '+1%', function (o) {
            o.global.overDmg = num(o.global.overDmg, num(b.global.overDmg)) + 0.01;
        });
        probe('全武学增效', '+1%', function (o) {
            Object.keys(o.typeDmg).forEach(function (k) { o.typeDmg[k] += 0.01; });
        });
        probe('对首领单位增伤', '+1%', function (o) {
            o.global.setGeneralDmg = num(o.global.setGeneralDmg,
                                         num(b.global.setGeneralDmg)) + 0.01;
        });
        /* 主武器类型增伤：取表内数值最高的那一项 */
        var mainType = null, bestV = -1;
        Object.keys(b.typeDmg || {}).forEach(function (k) {
            if (num(b.typeDmg[k]) > bestV) { bestV = num(b.typeDmg[k]); mainType = k; }
        });
        if (mainType) {
            probe(mainType + '增伤（主武器）', '+1%', function (o) {
                if (o.typeDmg[mainType] === undefined) return false;
                o.typeDmg[mainType] += 0.01;
            });
        }
        if (base.tunings && base.tunings.length) {
            probe(base.tunings[0].keyword + '定音增伤', '+1%', function (o) {
                o.tunings[0].bonus += 0.01;
            });
        }

        items.sort(function (x, y) { return y.pct - x.pct; });

        /* 表格：按实测收益排序 */
        var tb = mk('div', 'table-scroll');
        var table = mk('table', 'act-table');
        var thead = mk('thead');
        var htr = mk('tr');
        ['词条', '模拟投入', '总伤提升', '优先级'].forEach(function (h) {
            htr.appendChild(mk('th', null, h));
        });
        thead.appendChild(htr);
        table.appendChild(thead);
        var tbody = mk('tbody');
        items.forEach(function (it, i) {
            var tr = mk('tr');
            tr.appendChild(mk('td', 'act-name', it.label));
            tr.appendChild(mk('td', 'act-time', it.unit));
            tr.appendChild(mk('td', null, (it.pct >= 0 ? '+' : '') + it.pct.toFixed(3) + '%'));
            tr.appendChild(mk('td', i < 3 ? 'act-name' : null,
                              i === 0 ? '★★★ 最高' : (i === 1 ? '★★ 次优' : (i === 2 ? '★ 可选' : '—'))));
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tb.appendChild(table);
        box.appendChild(tb);

        /* 结论 */
        var tips = mk('div', 'notice');
        var top = items.slice(0, 3).map(function (it) {
            return it.label + '（' + it.unit + ' → +' + it.pct.toFixed(2) + '%）';
        }).join('、');

        var gapTxt = '';
        if (res.graduationBase && res.adps > 0 && res.graduation < 100) {
            var need = (res.graduationBase / res.adps - 1) * 100;   // 还需要的 ADPS 增幅
            var perUnit = items.length ? items[0].pct : 0;
            gapTxt = '距离毕业还差 <code>' + need.toFixed(2) + '%</code> 的秒伤；'
                   + '按当前边际收益，约等于再堆 <code>'
                   + (perUnit > 0 ? Math.ceil(need / perUnit * 10) / 10 : 0)
                   + '</code> 份「' + (items.length ? items[0].label + ' ' + items[0].unit : '-')
                   + '」（理论值，仅供参考）。';
        } else if (res.graduation >= 100) {
            gapTxt = '当前已达标毕业基准，优先保持手感与循环完整性即可。';
        }

        tips.innerHTML = '在当前面板下收益最高的词条依次是：<b>' + top + '</b>。' + gapTxt
            + '<br><span style="opacity:.75;">口径说明：每项都是在「其他数值不变」的前提下单独叠加后重算总伤，'
            + '属于边际收益实测；实际养成请结合词条获取成本与上限（如会心/会意上限）综合判断。</span>';
        box.appendChild(tips);
    }

    function renderSelfCheck(res, b) {
        var exp = b.expected || {};
        var node = el('selfCheck');
        if (!exp.total) {
            node.textContent = '数据表未提供 Excel 汇总值，跳过自检。';
            return;
        }
        var base = window.QNModel.compute(b, {});
        var dev = Math.abs(base.total - exp.total) / exp.total * 100;
        node.innerHTML =
            '数据自检（用表内原始数据回算）：内核总伤 <code>' + fmt(base.total, 2) +
            '</code> ｜ Excel 总伤 <code>' + fmt(exp.total, 2) +
            '</code> ｜ 偏差 <code>' + dev.toFixed(6) + '%</code> ' +
            (dev < 0.001 ? '✔ 与数据表完全对齐' : '⚠ 公式或数据存在漂移');
    }

    function renderBuild(b) {
        state.build = b;
        buildForm(b);
        setTxt('setInfo', (b.setName || '-') + ' · ' + (b.meta.attrType || '-'));
        setTxt('buildNote',
            '来源：' + (b.meta.source || '-') +
            ' ｜ 数据版本 ' + b.meta.version +
            ' ｜ 主属种 ' + b.meta.attrType +
            ' ｜ ' + (b.meta.stage || '') +
            ' ｜ 技能库 ' + Object.keys(b.skills).length + ' 条' +
            ' ｜ 竞速轴 ' + b.rotation.length + ' 行' +
            ' ｜ 导出 ' + b.meta.generatedAt);
        update();
    }

    /* 流派是一级选择：列出全部已导入流派（不再按版本过滤） */
    function fillBuilds() {
        var sel = el('selBuild');
        var names = window.QNData.getBuildNames();
        var keep = sel.value;

        sel.innerHTML = '';
        names.forEach(function (b) {
            var op = document.createElement('option');
            op.value = b.id;
            op.textContent = b.name + (b.attrType ? '（' + b.attrType + '）' : '');
            sel.appendChild(op);
        });

        var has = names.some(function (b) { return b.id === keep; });
        var target = has ? keep : (names.length ? names[0].id : '');
        if (!target) return;
        sel.value = target;              /* 显式选中，不依赖浏览器隐式行为 */
        fillVersions(target);
    }

    /* 版本跟随流派：只列该流派现有的版本（新 -> 旧） */
    function fillVersions(id) {
        var sel = el('selVersion');
        var vers = window.QNData.getVersionsOf(id);

        sel.innerHTML = '';
        vers.forEach(function (v) {
            var op = document.createElement('option');
            op.value = v;
            op.textContent = 'v' + v;
            sel.appendChild(op);
        });
        if (!vers.length) return;
        sel.value = vers[0];             /* 默认该流派的最新版本 */
        load(vers[0], id);
    }

    function load(ver, id) {
        window.QNData.loadBuild(ver, id)
            .then(renderBuild)
            .catch(function (e) { el('buildNote').textContent = '数据加载失败：' + e.message; });
    }

    function init() {
        window.QNData.init().then(fillBuilds).catch(function (e) {
            el('buildNote').textContent =
                '数据加载失败：' + e.message +
                '（若用 file:// 打开，请确认 data/builds.js 已生成；或部署到服务器后用 http 访问）';
        });

        el('selBuild').addEventListener('change', function () { fillVersions(this.value); });
        el('selVersion').addEventListener('change', function () {
            load(this.value, el('selBuild').value);
        });

        var form = el('calcForm');
        form.addEventListener('input', update);
        form.addEventListener('change', update);
        form.addEventListener('submit', function (e) { e.preventDefault(); });

        el('btnRestore').addEventListener('click', function () {
            if (state.build) { buildForm(state.build); update(); }
        });
        el('btnClear').addEventListener('click', function () {
            document.querySelectorAll('#calcForm input[type="number"]').forEach(function (i) { i.value = 0; });
            update();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
