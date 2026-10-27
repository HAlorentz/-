/* ============================================================
   示例百业 · 百业活动模块（展示逻辑）
   ------------------------------------------------------------
   数据来源：data/activities.json（后台可直接产出/替换这个文件）
             file:// 打开时退回 data/activities.js（由 sync 脚本生成）
   负责：卡片渲染 / 分页（4 项一页）/ 顶部页码同步
   技术栈：原生 JS，无任何依赖
   ============================================================ */
(function () {
    'use strict';

    var PAGE_SIZE = 4;               /* 每页活动数 */

    var list = [], page = 0, totalPages = 1;
    var box, dotsBox, statEl, curEl, totalEl, prevBtn, nextBtn;

    /* ---------- 工具 ---------- */
    function el(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    /* 没有游戏截图时的占位图：墨蓝夜色 + 远山 + 大号编号 */
    function placeholder(a, w, h) {
        var no = esc(a.no || pad(a.id));
        var svg =
            "<svg xmlns='http://www.w3.org/2000/svg' width='" + w + "' height='" + h + "'>" +
            "<defs><linearGradient id='g' x1='0' y1='0' x2='0.4' y2='1'>" +
            "<stop offset='0' stop-color='#1c2430'/><stop offset='0.6' stop-color='#232a2e'/>" +
            "<stop offset='1' stop-color='#2c241f'/></linearGradient></defs>" +
            "<rect width='100%' height='100%' fill='url(#g)'/>" +
            "<circle cx='" + (w * 0.8) + "' cy='" + (h * 0.24) + "' r='" + (h * 0.1) +
            "' fill='#e6c894' opacity='0.4'/>" +
            "<path d='M0 " + (h * 0.78) + " L" + (w * 0.22) + " " + (h * 0.52) +
            " L" + (w * 0.44) + " " + (h * 0.7) + " L" + (w * 0.66) + " " + (h * 0.46) +
            " L" + (w * 0.88) + " " + (h * 0.8) + " L" + w + " " + (h * 0.66) +
            " L" + w + " " + h + " L0 " + h + " Z' fill='#101214' opacity='0.85'/>" +
            "<text x='50%' y='48%' text-anchor='middle' dominant-baseline='middle' " +
            "font-family='Songti SC,STSong,SimSun,serif' font-size='" + Math.round(h * 0.42) +
            "' fill='#e6c894' opacity='0.28'>" + no + "</text>" +
            "<text x='50%' y='" + (h - 14) + "' text-anchor='middle' " +
            "font-family='sans-serif' font-size='12' fill='#8a8279'>待插入游戏图片</text>" +
            "</svg>";
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    function shotSrc(a) { return a.image || placeholder(a, 800, 450); }

    function bindFallback(scope) {
        var imgs = scope.querySelectorAll ? scope.querySelectorAll('img[data-id]') : [];
        Array.prototype.forEach.call(imgs, function (img) {
            img.addEventListener('error', function () {
                var hit = list.filter(function (x) { return Number(x.id) === Number(img.getAttribute('data-id')); });
                if (hit[0]) { img.classList.add('is-placeholder'); img.src = placeholder(hit[0], 800, 450); }
            });
        });
    }

    /* ---------- 渲染 ---------- */
    function render() {
        var items = list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

        box.classList.add('is-fading');

        setTimeout(function () {
            box.innerHTML = items.map(function (a, i) {
                return '<article class="act-card" style="animation-delay:' + (i * 60) + 'ms">' +
                    '<div class="act-shot">' +
                    '<img src="' + esc(shotSrc(a)) + '" alt="' + esc(a.title || '') + ' 活动截图"' +
                    ' data-id="' + Number(a.id) + '" loading="lazy">' +
                    '<span class="act-no">' + esc(a.no || pad(a.id)) + '</span>' +
                    '</div>' +
                    '<div class="act-body">' +
                    '<span class="act-host">主持 · ' + esc(a.host || '待定') + '</span>' +
                    '<h3 class="act-title">「' + esc(a.title || '') + '」</h3>' +
                    '<p class="act-desc">' + esc(a.desc || '') + '</p>' +
                    '</div>' +
                    '</article>';
            }).join('');
            bindFallback(box);
            box.classList.remove('is-fading');
        }, 160);

        /* 顶部统计 + 底部分页同步 */
        if (statEl) statEl.textContent = pad(list.length) + ' 项 · ' + pad(page + 1) + ' / ' + pad(totalPages) + ' 页';
        if (curEl) curEl.textContent = pad(page + 1);
        if (totalEl) totalEl.textContent = pad(totalPages);

        if (dotsBox && dotsBox.children.length !== totalPages) {
            dotsBox.innerHTML = '';
            for (var i = 0; i < totalPages; i++) {
                (function (idx) {
                    var b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'ap-dot';
                    b.textContent = pad(idx + 1);
                    b.setAttribute('aria-label', '第 ' + (idx + 1) + ' 页');
                    b.addEventListener('click', function () { go(idx); });
                    dotsBox.appendChild(b);
                })(i);
            }
        }
        if (dotsBox) {
            Array.prototype.forEach.call(dotsBox.children, function (b, i) {
                b.classList.toggle('active', i === page);
            });
        }

        if (prevBtn) prevBtn.disabled = (page === 0);
        if (nextBtn) nextBtn.disabled = (page >= totalPages - 1);
    }

    function go(p) {
        var target = Math.max(0, Math.min(totalPages - 1, p));
        if (target === page) return;
        page = target;
        render();
    }

    /* ---------- 数据加载 ---------- */
    function start(data) {
        list = (data || []).slice();
        if (!list.length) {
            box.innerHTML = '<p class="act-empty">暂无活动数据</p>';
            return;
        }
        totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
        render();
    }

    function load() {
        /* 后台化：把这里换成接口地址即可，页面逻辑不用改 */
        fetch('data/activities.json', { cache: 'no-cache' })
            .then(function (r) { return r.json(); })
            .then(start)
            .catch(function () {
                if (window.QN_ACTIVITIES && window.QN_ACTIVITIES.length) {
                    start(window.QN_ACTIVITIES);
                } else {
                    box.innerHTML = '<p class="act-empty">活动数据加载失败，请用本地服务器打开页面</p>';
                }
            });
    }

    function init() {
        box = el('actList');
        if (!box) return;

        statEl = el('actStat');
        curEl = el('actCur');
        totalEl = el('actTotal');
        dotsBox = el('actDots');
        prevBtn = el('actPrev');
        nextBtn = el('actNext');

        prevBtn.addEventListener('click', function () { go(page - 1); });
        nextBtn.addEventListener('click', function () { go(page + 1); });

        box.innerHTML = '<p class="act-empty">正在载入活动…</p>';
        load();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
