/* ============================================================
   竞速毕业计算器 · 伤害模型内核
   ------------------------------------------------------------
   ★ 本文件是与 Excel 表一一对应的纯计算内核，不含任何 DOM 操作。
   ★ 公式链已按《破竹尘115阶竞速轴属性毕业率进阶计算.xlsx》还原，
     用表内原始数据回算，总伤 / ADPS / 毕业率 与 Excel 完全一致。
   ★ 换版本 / 换流派：只换 data/*.json，不改这里。
   ============================================================ */
window.QNModel = (function () {
    'use strict';

    /* 五种属性攻击：外功 + 四属种 */
    var ATTRS = [
        { name: '鸣金', py: 'Jin' },
        { name: '裂石', py: 'Lie' },
        { name: '牵丝', py: 'Qian' },
        { name: '破竹', py: 'Po' }
    ];

    function num(v, d) {
        if (v === null || v === undefined || typeof v === 'boolean') return d || 0;
        var n = parseFloat(v);
        return isNaN(n) ? (d || 0) : n;
    }

    /* ----------------------------------------------------------
       实际属性：原始面板 -> Excel 公式真正读取的"实际属性"
         外功 : min = 面板min + 食物min ; max = MAX(面板min+食物min, 面板max+食物max)
         属种 : min = 面板min + 无相min(仅主属种) ; max = MAX(面板min,max) + 无相max
       ---------------------------------------------------------- */
    function effOf(panel, main, wu, food, setMul, wuMul, name) {
        var r = panel[name] || {};
        var mn, mx;
        if (name === '外功') {
            mn = (num(r.min) + num(food.min)) * setMul;
            mx = Math.max(num(r.min) + num(food.min), num(r.max) + num(food.max)) * setMul;
        } else {
            /* 飞隼类（无相不乘套装系数）: B3*1.1+B7 ; 撼天类: (B5+B7)*1.06 */
            mn = num(r.min) * setMul + (name === main ? num(wu.min) * wuMul : 0);
            mx = Math.max(num(r.min), num(r.max)) * setMul
               + (name === main ? num(wu.max) * wuMul : 0);
        }
        return {
            min: mn,
            max: mx,
            pen: num(r.pen),
            dmg: num(r.dmg)
        };
    }

    /* ----------------------------------------------------------
       主计算
       build   : 由 tools/xlsx_to_json.py 生成的流派数据
       override: { panel:{属种:{min,max,pen,dmg}}, global:{...},
                   toggles:{team:{},gear:{}}, buffsOff:{ buffName:true } }
       ---------------------------------------------------------- */
    function compute(build, override) {
        override = override || {};

        var G = {}, k;
        for (k in build.global) {
            if (k !== 'raw' && Object.prototype.hasOwnProperty.call(build.global, k)) {
                G[k] = build.global[k];
            }
        }
        if (override.global) {
            for (k in override.global) G[k] = override.global[k];
        }

        var M = build.monster;
        var C = build.constants;
        var T = override.toggles || build.toggles;
        var panel = override.panel || build.panel;
        var main = build.meta.attrType;
        var wu = panel['无相'] || {};
        var food = build.foodBonus || {};
        /* 套装加成模式：从原表 D10/D11 公式解析（constants.setMul / constants.wuMul），
           飞隼 ×1.1 且无相不乘、撼天 ×1.06 无相也乘、无加成表 ×1 */
        var setMul = num(C.setMul, 1.0);
        var wuMul = C.wuMul !== undefined ? num(C.wuMul) : setMul;

        var eff = {};
        Object.keys(panel).forEach(function (n) {
            if (n !== '无相') eff[n] = effOf(panel, main, wu, food, setMul, wuMul, n);
        });
        if (!eff['外功']) eff['外功'] = { min: 0, max: 0, pen: 0, dmg: 0 };

        /* 怪物防御：基础 687，逐项减防开关（加性） */
        var cut = 0;
        (C.defReductions || []).forEach(function (rule) {
            var on = (T.gear && T.gear[rule.toggle]) || (T.team && T.team[rule.toggle]);
            if (on) cut += num(rule.value);
        });
        var defense = (override.defense !== undefined && override.defense !== null)
            ? num(override.defense)
            : C.baseDefense * (1 - cut);

        var buffsOff = override.buffsOff || {};

        function bsum(names, key) {
            var s = 0;
            names.forEach(function (n) {
                if (buffsOff[n]) return;
                var b = build.buffs[n];
                if (b && b[key] !== undefined) s += num(b[key]);
            });
            return s;
        }

        var rows = [];
        var total = 0.0;

        build.rotation.forEach(function (row) {
            /* 「结算」是聚合行（引用其它行做 SUM），内核无法按通用公式重算，
               先记录 Excel 的原始值，最后按整体增幅等比缩放 */
            if (row.settle) {
                rows.push({ skill: row.skill, count: row.count,
                            buffs: row.buffs, expect: row.exp, settle: true });
                return;
            }

            var sk = build.skills[row.skill] || {};
            var b = row.buffs;
            var styp = sk.type;

            var isFixed = (C.fixedDmgTypes || []).indexOf(styp) >= 0;
            var elemAtk = num(sk.elemAtk) + bsum(b, 'elemAtk');
            var atkBonus = num(sk.atkBonus) + bsum(b, 'atkBonus');

            /* 外功段 */
            var pmin = eff['外功'].min * (1 + atkBonus) + num(sk.minAtk) + bsum(b, 'minAtk') - defense;
            var pmax = eff['外功'].max * (1 + atkBonus) + num(sk.maxAtk) + bsum(b, 'maxAtk') - defense;
            var penP = eff['外功'].pen - M.physResist + num(sk.pen) + bsum(b, 'pen');
            var penRate = penP > 0 ? penP / C.penDivisor : penP / C.penDivisorNegative;
            var physDmg = eff['外功'].dmg + num(sk.physDmg) + bsum(b, 'physDmg');
            var coefP = num(sk.coefPhys);
            var fixedP = num(sk.fixedPhys) * (isFixed ? 1 + num(G.fixedDmg) : 1);
            var fixedE = num(sk.fixedElem) * (isFixed ? 1 + num(G.fixedDmg) : 1);

            var physMean = (((pmin + pmax) / 2) * coefP + fixedP) * (1 + penRate) * (1 + physDmg);
            var physMax = (pmax * coefP + fixedP) * (1 + penRate) * (1 + physDmg);
            var physMin = (pmin * coefP + fixedP) * (1 + penRate) * (1 + physDmg);

            /* 属种段 */
            function attrPart(ename) {
                var e = eff[ename] || { min: 0, max: 0, pen: 0, dmg: 0 };
                var py = '';
                ATTRS.forEach(function (a) { if (a.name === ename) py = a.py; });
                var mn = num(e.min) * (1 + elemAtk);
                var mx = num(e.max) * (1 + elemAtk);
                var pen = num(e.pen) - M.elemResist + num(sk['pen' + py]) + bsum(b, 'pen' + py);
                var prate = pen > 0 ? pen / C.penDivisor : pen / C.penDivisorNegative;
                var dmgb = num(e.dmg) + num(sk['dmg' + py]) + bsum(b, 'dmg' + py);
                var coef = (main === ename) ? num(sk.coefElem) : coefP;
                var fixed = (main === ename) ? fixedE * 1.5 : 0.0;
                var tail = (1 + prate) * (1 + dmgb);
                return {
                    mean: (((mn + mx) / 2) * coef + fixed) * tail,
                    max: (mx * coef + fixed) * tail,
                    min: (mn * coef + fixed) * tail
                };
            }

            var baseMean = physMean, baseMax = physMax, baseMin = physMin;
            ATTRS.forEach(function (a) {
                var p = attrPart(a.name);
                baseMean += p.mean;
                baseMax += p.max;
                baseMin += p.min;
            });

            /* 生效概率 */
            var forceCrit = num(sk.forceCrit) === 1;
            var forceOver = num(sk.forceOver) === 1;
            var forceAcc = num(sk.forceAcc) === 1;

            var accEff = Math.min(forceCrit ? 1.0 : num(G.accRate), 1.0);
            var critEff = ((forceCrit ? 1.0 : Math.min(C.critCap,
                            num(G.critRate) + num(sk.critRate) + bsum(b, 'critRate')))
                        + num(G.directCritRate) + bsum(b, 'directCritRate')) *
                        (forceOver ? 0.0 : 1.0);
            var overEff = ((forceOver ? 1.0 : Math.min(C.overCap,
                            num(G.overRate) + num(sk.overRate) + bsum(b, 'overRate')))
                        + num(G.directOverRate) + bsum(b, 'directOverRate')) *
                        (forceCrit ? 0.0 : 1.0);

            var pCrit = Math.min((1 - overEff) * accEff, accEff * critEff);
            var pOver = overEff;
            var pGraze = (forceAcc ? 0.0 : (1 - accEff)) * (1 - overEff);
            var pNormal = 1 - pOver - pCrit - pGraze;

            /* 伤害乘区 */
            var typeDmg = {};
            (function (src) {
                for (var tk in (src || {})) {
                    if (Object.prototype.hasOwnProperty.call(src, tk)) typeDmg[tk] = num(src[tk]);
                }
            })(build.typeDmg);
            if (override.typeDmg) {
                for (var ok in override.typeDmg) {
                    if (Object.prototype.hasOwnProperty.call(override.typeDmg, ok)) {
                        typeDmg[ok] = num(override.typeDmg[ok], typeDmg[ok]);
                    }
                }
            }
            var gen = num(G.setGeneralDmg, num(build.setGeneralDmg)) +
                      num(typeDmg[styp]) +
                      num(sk.gen) + bsum(b, 'gen') + num(override.extraGeneral);
            var special = bsum(b, 'special') + num(M.instanceTalent) + num(override.extraSpecial);
            /* 「特定增伤/结算增伤」：优先增益库；鸣金虹等表把增益行登记在
               武学奇术里，则回退查技能库 */
            var specific = num(sk.special);
            b.forEach(function (n) {
                if (buffsOff[n]) return;
                var bv = (build.buffs[n] || {}).settle;
                if (!bv) bv = (build.skills[n] || {}).special;
                specific += num(bv);
            });
            /* 定音加成：触发词与数值因流派而异，破竹风等多定音项 */
            var tune = 1.0;
            (override.tunings || C.tunings || []).forEach(function (t) {
                if (t.keyword === sk.tuning) tune += num(t.bonus);
            });
            var tail = num(row.count, 1.0) * tune * (1 + special) *
                       (1 + specific) * (1 + num(override.extraBoss));

            var critDmgMult = 1 + num(G.critDmg) + num(sk.critDmg) + bsum(b, 'critDmg');
            var overDmgMult = 1 + num(G.overDmg) + num(sk.overDmg) + bsum(b, 'overDmg');
            var core = 1 + gen;

            var mVal = baseMean * core * critDmgMult * tail;
            var nVal = baseMax * core * overDmgMult * tail;
            var oVal = baseMean * core * tail;
            var pVal = baseMin * core * tail;

            var expect = mVal * pCrit + nVal * pOver + oVal * pNormal + pVal * pGraze;
            total += expect;

            rows.push({
                skill: row.skill, count: num(row.count, 1.0), buffs: row.buffs,
                expect: expect, settle: false,
                M: mVal, N: nVal, O: oVal, P: pVal,
                pCrit: pCrit, pOver: pOver, pNormal: pNormal, pGraze: pGraze,
                baseMean: baseMean, baseMax: baseMax, baseMin: baseMin,
                gen: gen, critDmg: critDmgMult, overDmg: overDmgMult,
                special: special, specific: specific, tune: tune,
                penRate: penRate, physDmg: physDmg, elemAtk: elemAtk,
                dmgMul: core * (1 + special) * (1 + specific)
            });
        });

        /* 结算行按"非结算行的整体增幅"等比缩放，保证默认状态与 Excel 一致 */
        var normBase = 0.0;
        build.rotation.forEach(function (r) { if (!r.settle) normBase += num(r.exp); });
        var ratio = normBase ? (total / normBase) : 1.0;
        rows.forEach(function (r) {
            if (r.settle) {
                r.expect = r.expect * ratio;
                total += r.expect;
            }
        });

        var time = num(M.battleTime, 96.1);
        var adps = time ? total / time : 0;
        var graduation = num(M.graduationBase, 1) ? (adps / num(M.graduationBase, 1)) * 100 : 0;

        return {
            total: total,
            adps: adps,
            graduation: graduation,
            graduationBase: num(M.graduationBase, 173431.74),
            battleTime: time,
            defense: defense,
            rows: rows
        };
    }

    return { compute: compute, num: num };
})();
