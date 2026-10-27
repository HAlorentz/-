/* ============================================================
   示例百业 · 规则转盘（原生 JS + Canvas，支持多实例）
   ------------------------------------------------------------
   - 页面上每个 .wheel-unit[data-wheel="pvp|pve"] 自动初始化成一个转盘
   - 扇区数 = 数据数组长度，角度自动均分（PVP 21 项 / PVE 34 项）
   - 字号按扇区弧长与半径自动试算，放不下自动折行
   - 旋转：5 圈 + 随机角度，easeOutQuart 阻尼停止（约 4.5 秒）
   ============================================================ */
(function () {
    'use strict';

    /* PVP 规则 21 项 */
    var PVP_DATA = [
        "只能用普攻",
        "只能使用闪避",
        "禁止使用技能",
        "使用Q E装载",
        "改变视角习惯",
        "奇术只用解控和药叉",
        "不带药和鹰爪",
        "奇术只用解控和点穴",
        "10秒三招放一次",
        "奇术只用解控和打狗棍",
        "奇术只用解控和凌云塔",
        "只能用追命",
        "游龙击破",
        "禁轻功",
        "禁吃药",
        "禁跳",
        "只能使用一种武学",
        "只能带一个武器技能",
        "不能用移动键",
        "禁止防御",
        "只用技能进行攻击"
    ];

    /* PVE 规则 34 项 */
    var PVE_DATA = [
        "只准用特殊技打怪",
        "全程不躲机制",
        "禁止蓄力",
        "全程扮演狗勾 / 妈妈",
        "所有技能只放一级",
        "只能平A攻击",
        "正常开本",
        "全程用夹子音",
        "开怪前讲冷笑话",
        "全程用方言交流",
        "不能用任何技能",
        "全程说反话",
        "每波怪死一次",
        "死一次喊爸爸",
        "开怪前跳一支舞",
        "全程说叠词词",
        "使用特殊技的时候喊主人",
        "每死一次学猫叫",
        "死了要喊“我错了”",
        "全程只能用左手操作",
        "和前一位换账号",
        "放奇术时唱歌",
        "只能带三本心法",
        "全程0buff打本",
        "开本时使用黄金膝",
        "静止跳跃",
        "还有只能用重击和蓄力",
        "只能用易武技",
        "全程跟着队伍里前一位玩家",
        "全程使用弓箭",
        "全程使用跳劈",
        "输出要边跳边打",
        "治疗只奶自己",
        "开怪前唱首歌"
    ];

    /* 扇区配色：饱和度适中，循环交替（8 与 21 / 34 均互质，首尾不同色） */
    var PALETTES = {
        pvp: ['#c0563f', '#c99a3c', '#6fa368', '#4a7fa5', '#8a6fa8', '#b3763f', '#5f8f8a', '#a8693a'],
        pve: ['#4a7fa5', '#c99a3c', '#6fa368', '#8a6fa8', '#c0563f', '#5f8f8a', '#b3763f', '#a8693a']
    };

    var TAU = Math.PI * 2;

    /* ---------- 计算：最终角度 -> 命中的扇区 ---------- */
    function indexAtRotation(rot, n) {
        var seg = TAU / n;
        var a = (-Math.PI / 2 - rot) % TAU;          /* 指针在 12 点（盘内角度） */
        a = ((a % TAU) + TAU) % TAU;
        return Math.floor(a / seg) % n;
    }

    /* ---------- 计算：自动字号 + 折行 ---------- */
    /* 文字沿半径方向书写（右对齐外圈），行沿切向堆叠 */
    function layoutText(text, rIn, rOut, seg) {
        var radial = (rOut - rIn) * 0.92;                 /* 可用径向长度 */
        var refR = rIn + 0.5 * (rOut - rIn);              /* 参考半径（文字主要占据外段） */
        var tangential = refR * seg * 0.85;               /* 可用切向宽度（留边距） */
        var len = text.length;

        for (var fs = 22; fs >= 9; fs--) {
            for (var lines = 1; lines <= 3; lines++) {
                var per = Math.ceil(len / lines);
                if (per * fs * 1.02 > radial) continue;         /* 径向放不下 */
                if (lines * fs * 1.18 > tangential) continue;   /* 切向放不下 */
                var arr = [];
                for (var i = 0; i < lines; i++) arr.push(text.substr(i * per, per));
                return { fs: fs, lines: arr, lineH: fs * 1.18 };
            }
        }

        /* 兜底：最小字号，尽量分 3 行 */
        var fs0 = 9, per0 = Math.ceil(len / 3), out = [];
        for (var k = 0; k < 3; k++) out.push(text.substr(k * per0, per0));
        return { fs: fs0, lines: out, lineH: fs0 * 1.18 };
    }

    /* ---------- 单个转盘实例 ---------- */
    function create(opts) {
        var canvas = opts.canvas, ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
        if (!ctx) return null;

        var btn = opts.btn, modal = opts.modal, ruleEl = opts.rule, confirmBtn = opts.confirm;
        var data = opts.data, palette = opts.palette || PALETTES.pvp;
        var N = data.length, SEG = TAU / N;
        var rotation = 0, spinning = false, size = 0;

        function resize() {
            var dpr = window.devicePixelRatio || 1;
            size = Math.round(canvas.clientWidth || 460);
            canvas.width = size * dpr;
            canvas.height = size * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function draw() {
            var R = size / 2;
            var rIn = R * 0.26;
            var rOut = R * 0.965;

            ctx.clearRect(0, 0, size, size);

            ctx.beginPath();
            ctx.arc(R, R, R - 1, 0, TAU);
            ctx.fillStyle = '#1d1c1a';
            ctx.fill();
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#cfa670';
            ctx.stroke();

            ctx.save();
            ctx.translate(R, R);
            ctx.rotate(rotation);

            for (var i = 0; i < N; i++) {
                var a0 = i * SEG, a1 = a0 + SEG;

                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, rOut, a0, a1);
                ctx.closePath();
                ctx.fillStyle = palette[i % palette.length];
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
                ctx.stroke();

                var lay = layoutText(data[i], rIn, rOut, SEG);
                ctx.save();
                ctx.rotate(a0 + SEG / 2);
                ctx.font = '600 ' + lay.fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#f7f2e8';
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 3;
                for (var l = 0; l < lay.lines.length; l++) {
                    var v = (l - (lay.lines.length - 1) / 2) * lay.lineH;
                    ctx.fillText(lay.lines[l], rOut - 8, v);
                }
                ctx.restore();
            }

            ctx.restore();

            ctx.beginPath();
            ctx.arc(R, R, R * 0.245, 0, TAU);
            ctx.fillStyle = '#191817';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(207, 166, 112, 0.55)';
            ctx.stroke();
        }

        function spin() {
            if (spinning) return;
            spinning = true;
            btn.disabled = true;
            btn.textContent = '···';

            var delta = TAU * 5 + Math.random() * TAU;   /* 5 圈 + 随机角度 */
            var start = rotation;
            var dur = 4200 + Math.random() * 600;       /* 约 4.2 - 4.8 秒 */
            var t0 = (window.performance && performance.now) ? performance.now() : Date.now();

            function frame(now) {
                var t = (now === undefined ? Date.now() : now);
                var p = Math.min(1, (t - t0) / dur);
                var e = 1 - Math.pow(1 - p, 4);          /* easeOutQuart：快 -> 慢 */
                rotation = start + delta * e;
                draw();
                if (p < 1) {
                    window.requestAnimationFrame(frame);
                } else {
                    spinning = false;
                    btn.textContent = 'GO';
                    showResult(data[indexAtRotation(rotation, N)]);
                }
            }

            window.requestAnimationFrame(frame);
        }

        function showResult(text) {
            ruleEl.textContent = '本局规则：【' + text + '】';
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
            confirmBtn.focus();
        }

        function closeResult() {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
            btn.disabled = false;      /* 重置 GO */
            btn.textContent = 'GO';
            btn.focus();
        }

        btn.addEventListener('click', spin);
        confirmBtn.addEventListener('click', closeResult);
        var mask = modal.querySelector('.wm-mask');
        if (mask) mask.addEventListener('click', closeResult);

        var resizeTimer = null;
        window.addEventListener('resize', function () {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () { resize(); draw(); }, 150);
        });

        resize();
        draw();

        return { draw: draw, spin: spin, close: closeResult, data: data, count: N };
    }

    /* ---------- 按 .wheel-unit 自动初始化 ---------- */
    function initUnit(unit) {
        var kind = unit.getAttribute('data-wheel') || 'pvp';
        var data = kind === 'pve' ? PVE_DATA : PVP_DATA;
        return create({
            canvas: unit.querySelector('.wheel-canvas'),
            btn: unit.querySelector('.wheel-go'),
            modal: unit.querySelector('.wheel-modal'),
            rule: unit.querySelector('.wm-rule'),
            confirm: unit.querySelector('.wm-btn'),
            data: data,
            palette: PALETTES[kind] || PALETTES.pvp
        });
    }

    function initAll() {
        var units = document.querySelectorAll('.wheel-unit[data-wheel]');
        for (var i = 0; i < units.length; i++) initUnit(units[i]);
    }

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var open = document.querySelectorAll('.wheel-modal.show');
        for (var i = 0; i < open.length; i++) {
            var btn = open[i].querySelector('.wm-btn');
            if (btn) btn.click();
        }
    });

    window.QNWheel = {
        create: create,
        initUnit: initUnit,
        PVP_DATA: PVP_DATA,
        PVE_DATA: PVE_DATA,
        PALETTES: PALETTES,
        indexAtRotation: indexAtRotation,
        layoutText: layoutText
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAll);
    } else {
        initAll();
    }
})();
