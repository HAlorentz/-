/* ============================================================
   示例百业 · 百业成员模块（展示逻辑）
   ------------------------------------------------------------
   数据来源：data/members.js -> window.QN_MEMBERS
   负责：卡片（游戏截图封面）/ 翻页 / 详情弹窗（大图 + 身份）/ 返回
   技术栈：原生 JS，无任何依赖
   ============================================================ */
(function () {
    'use strict';

    var PAGE_SIZE = 14;              /* 每页成员数 */
    var SWIPE_MIN = 55;              /* 触发翻页的最小滑动距离(px) */
    var DRAG_CANCEL_CLICK = 10;      /* 超过该位移视为拖拽，不再触发点击 */

    var members = [];
    var page = 0;
    var totalPages = 1;

    var grid, viewport, dotsBox, curNum, totalNum, prevBtn, nextBtn;
    var modal, mmShot, mmName, mmRole, mmTagline, mmBio, mmInfo, mmBack, mmClose;
    var lastFocus = null;

    /* ---------- 工具 ---------- */
    function el(id) { return document.getElementById(id); }

    /* 展示名：以游戏 ID 为主，昵称放到详情身份表里 */
    function dispName(m) { return m.gameId || m.name || ''; }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function byId(id) {
        var hit = members.filter(function (m) { return Number(m.id) === Number(id); });
        return hit[0] || null;
    }

    /* 占位图配色：按 id 取暖色系（炉火橙 / 暖黄 / 铜棕 / 炭红） */
    var TONES = [
        ['#e0b078', '#b3763f'], ['#e6c894', '#c2955a'], ['#d9a066', '#8c5a30'],
        ['#e8c07a', '#b8863f'], ['#d68f5c', '#8f4f2e'], ['#dfae7d', '#a8693a']
    ];

    function toneOf(m) { return TONES[(Number(m.id) || 0) % TONES.length]; }

    /* 没有截图时生成的占位图：雪夜山影 + 首字 + 「截图待补」 */
    function placeholder(m, w, h) {
        var t = toneOf(m);
        var ch = esc(String(dispName(m) || '?').trim().charAt(0));
        var svg =
            "<svg xmlns='http://www.w3.org/2000/svg' width='" + w + "' height='" + h + "'>" +
            "<defs><linearGradient id='g' x1='0' y1='0' x2='0.35' y2='1'>" +
            "<stop offset='0' stop-color='#1c2430'/><stop offset='0.55' stop-color='#232a2e'/>" +
            "<stop offset='1' stop-color='#2c241f'/></linearGradient></defs>" +
            "<rect width='100%' height='100%' fill='url(#g)'/>" +
            "<circle cx='" + (w * 0.79) + "' cy='" + (h * 0.25) + "' r='" + (h * 0.09) +
            "' fill='" + t[0] + "' opacity='0.45'/>" +
            "<path d='M0 " + (h * 0.74) + " L" + (w * 0.2) + " " + (h * 0.5) +
            " L" + (w * 0.4) + " " + (h * 0.68) + " L" + (w * 0.62) + " " + (h * 0.44) +
            " L" + (w * 0.85) + " " + (h * 0.8) + " L" + w + " " + (h * 0.66) +
            " L" + w + " " + h + " L0 " + h + " Z' fill='#101214' opacity='0.88'/>" +
            "<text x='50%' y='46%' text-anchor='middle' dominant-baseline='middle' " +
            "font-family='Songti SC,STSong,SimSun,serif' font-size='" + Math.round(h * 0.34) +
            "' fill='" + t[0] + "' opacity='0.92'>" + ch + "</text>" +
            "<text x='50%' y='" + (h - 16) + "' text-anchor='middle' " +
            "font-family='sans-serif' font-size='13' fill='#8a8279'>截图待补</text>" +
            "</svg>";
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    /* 取封面图：cover -> shot -> avatar(兼容旧字段) -> 占位 */
    function coverSrc(m) {
        return m.cover || m.shot || m.avatar || placeholder(m, 640, 480);
    }

    function shotSrc(m) {
        return m.shot || m.cover || m.avatar || placeholder(m, 1280, 720);
    }

    /* 图片加载失败（文件还没放）时回退到占位图 */
    function bindFallback(scope) {
        var imgs = scope.querySelectorAll ? scope.querySelectorAll('img[data-id]') : [];
        Array.prototype.forEach.call(imgs, function (img) {
            img.addEventListener('error', function () {
                var m = byId(img.getAttribute('data-id'));
                if (!m) return;
                img.classList.add('is-placeholder');
                img.src = img.getAttribute('data-fallback') === 'wide'
                    ? placeholder(m, 1280, 720) : placeholder(m, 640, 480);
            });
        });
    }

    /* ---------- 渲染卡片 ---------- */
    function renderGrid(dir) {
        var list = members.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

        function fill() {
            grid.classList.remove('slide-out-left', 'slide-out-right');
            grid.innerHTML = list.map(function (m, i) {
                return '<article class="member-card" tabindex="0" role="button"' +
                    ' data-id="' + Number(m.id) + '" style="animation-delay:' + (i * 22) + 'ms"' +
                    ' aria-label="查看 ' + esc(dispName(m)) + ' 的详情">' +
                    '<div class="mc-shot">' +
                    '<img src="' + esc(coverSrc(m)) + '" alt="' + esc(dispName(m)) + ' 的游戏截图"' +
                    ' data-id="' + Number(m.id) + '" loading="lazy">' +
                    '<span class="mc-badge">' + esc(m.role || '成员') + '</span>' +
                    '</div>' +
                    '<div class="mc-body">' +
                    '<h3 class="mc-name">' + esc(dispName(m)) + '</h3>' +
                    '<p class="mc-tagline">' + esc(m.tagline || '') + '</p>' +
                    '<span class="mc-more">查看更多' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
                    ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '<path d="M5 12h14M13 6l6 6-6 6"/></svg></span>' +
                    '</div>' +
                    '</article>';
            }).join('');
            bindFallback(grid);
            void grid.offsetWidth;
            grid.classList.add(dir ? (dir > 0 ? 'slide-in-right' : 'slide-in-left') : 'slide-in-right');
        }

        if (dir) {
            grid.classList.remove('slide-in-left', 'slide-in-right',
                                  'slide-out-left', 'slide-out-right');
            void grid.offsetWidth;
            grid.classList.add(dir > 0 ? 'slide-out-left' : 'slide-out-right');
            setTimeout(fill, 200);
        } else {
            fill();
        }

        renderPager();
    }

    function renderPager() {
        curNum.textContent = pad(page + 1);
        totalNum.textContent = pad(totalPages);

        if (dotsBox.children.length !== totalPages) {
            dotsBox.innerHTML = '';
            for (var i = 0; i < totalPages; i++) {
                (function (idx) {
                    var b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'mp-dot';
                    b.textContent = pad(idx + 1);
                    b.setAttribute('aria-label', '第 ' + (idx + 1) + ' 页');
                    b.addEventListener('click', function () { go(idx); });
                    dotsBox.appendChild(b);
                })(i);
            }
        }
        Array.prototype.forEach.call(dotsBox.children, function (b, i) {
            b.classList.toggle('active', i === page);
        });

        prevBtn.disabled = (page === 0);
        nextBtn.disabled = (page === totalPages - 1);
    }

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    function go(p, dir) {
        var target = Math.max(0, Math.min(totalPages - 1, p));
        if (target === page) return;
        if (dir === undefined) dir = target > page ? 1 : -1;
        page = target;
        renderGrid(dir);
    }

    /* ---------- 详情弹窗：上半截图 + 下半身份 ---------- */
    var INFO_ROWS = [
        ['作息', 'schedule'],
        ['门派', 'sect'],
        ['武学', 'martial'],
        ['常驻', 'base'],
        ['入游', 'joined'],
        ['主玩', 'play'],
        ['昵称', 'name']
    ];

    function openModal(m) {
        lastFocus = document.activeElement;

        mmShot.src = shotSrc(m);
        mmShot.alt = (dispName(m) || '') + ' 的游戏截图';
        mmShot.setAttribute('data-id', Number(m.id));
        mmShot.setAttribute('data-fallback', 'wide');

        mmName.textContent = dispName(m);
        mmRole.textContent = m.role || '成员';
        mmRole.style.display = m.role ? '' : 'none';
        mmTagline.textContent = m.tagline || '';
        mmTagline.style.display = m.tagline ? '' : 'none';
        mmBio.textContent = m.bio || '';
        mmBio.style.display = m.bio ? '' : 'none';

        mmInfo.innerHTML = INFO_ROWS.map(function (r) {
            var v = m[r[1]];
            if (!v) return '';
            return '<div class="mi-row"><span class="mi-k">' + r[0] + '</span>' +
                   '<span class="mi-v">' + esc(v) + '</span></div>';
        }).join('');

        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        mmClose.focus();
    }

    function closeModal() {
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    /* ---------- 手势：触摸滑动 + 鼠标拖拽 ---------- */
    function bindSwipe() {
        var startX = 0, startY = 0, moved = 0, dragging = false;

        function down(x, y) {
            startX = x; startY = y; moved = 0; dragging = true;
            viewport.classList.add('is-dragging');
        }

        function move(x, y) {
            if (!dragging) return;
            moved = Math.abs(x - startX);
            if (Math.abs(y - startY) > moved) dragging = false;   /* 纵向滚动优先 */
        }

        function up(x) {
            if (!dragging) return;
            dragging = false;
            viewport.classList.remove('is-dragging');
            var dx = x - startX;
            if (Math.abs(dx) >= SWIPE_MIN) go(page + (dx < 0 ? 1 : -1));
        }

        viewport.addEventListener('touchstart', function (e) {
            down(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });

        viewport.addEventListener('touchmove', function (e) {
            move(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });

        viewport.addEventListener('touchend', function (e) {
            up((e.changedTouches[0] || {}).clientX || startX);
        });

        viewport.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            down(e.clientX, e.clientY);
        });

        window.addEventListener('mousemove', function (e) {
            if (dragging) move(e.clientX, e.clientY);
        });

        window.addEventListener('mouseup', function (e) {
            if (dragging || moved) up(e.clientX);
        });

        grid.addEventListener('click', function (e) {
            var card = e.target.closest ? e.target.closest('.member-card') : null;
            if (!card) return;
            if (moved > DRAG_CANCEL_CLICK) return;
            var m = byId(card.getAttribute('data-id'));
            if (m) openModal(m);
        });

        grid.addEventListener('keydown', function (e) {
            var card = e.target.closest ? e.target.closest('.member-card') : null;
            if (!card) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }
        });
    }

    /* ---------- 线上数据：合并接口添加进数据库的新成员 ---------- */
    /* 接口与本文件同级（api_members.php）；若接口部署在别的域名，把这里改成完整 URL */
    var API_URL = 'api_members.php';

    /* 去重依据：游戏 ID + 昵称 */
    function keyOf(m) {
        return ((m.gameId || '') + '|' + (m.name || '')).trim();
    }

    /* 后者覆盖前者的非空字段 */
    function mergeOne(a, b) {
        var out = {}, k;
        for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
        for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) {
            if (b[k] !== '' && b[k] !== null && b[k] !== undefined) out[k] = b[k];
        }
        return out;
    }

    /* 静态数据在前，接口新增的追加在后；同一个人以接口数据为准 */
    function mergeMembers(base, extra) {
        var map = {}, order = [];
        base.concat(extra).forEach(function (m) {
            var k = keyOf(m) || ('#' + m.id);
            if (!map[k]) {
                map[k] = m;
                order.push(k);
            } else {
                map[k] = mergeOne(map[k], m);
            }
        });
        return order.map(function (k) { return map[k]; });
    }

    function applyMembers(list) {
        members = list;
        totalPages = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
        if (page > totalPages - 1) page = 0;
        var st = el('membersStat');
        if (st) st.textContent = members.length + ' 位 · ' + totalPages + ' 页';
        renderPager();
        renderGrid(0);
    }

    /* 拉取接口数据并合并；接口不可用时静默失败，官网照常显示静态成员 */
    function loadFromApi() {
        if (typeof window.fetch !== 'function') return;   /* 老浏览器 / Node 测试环境 */
        window.fetch(API_URL, { method: 'GET' })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                if (!data || data.code !== 200 || !Array.isArray(data.data)) return;
                /* 数据库 id 可能与静态 id 重复，整体加偏移，避免点开详情认错人 */
                var extra = data.data.map(function (m) {
                    var c = {}, k;
                    for (k in m) if (Object.prototype.hasOwnProperty.call(m, k)) c[k] = m[k];
                    c.id = 10000 + (Number(m.id) || 0);
                    return c;
                });
                if (!extra.length) return;
                applyMembers(mergeMembers(members, extra));
            })
            .catch(function () { /* 未部署接口时保持静态数据 */ });
    }

    /* ---------- 初始化 ---------- */
    function init() {
        grid = el('membersGrid');
        if (!grid) return;

        members = (window.QN_MEMBERS || []).slice();
        if (!members.length) {
            grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#6f6a64;">' +
                             '暂无成员数据（请检查 data/members.js）</p>';
            return;
        }

        totalPages = Math.max(1, Math.ceil(members.length / PAGE_SIZE));

        viewport = el('membersViewport');
        dotsBox = el('membersDots');
        curNum = el('membersCur');
        totalNum = el('membersTotal');
        prevBtn = el('membersPrev');
        nextBtn = el('membersNext');
        modal = el('memberModal');
        mmShot = el('mmShot');
        mmName = el('mmName');
        mmRole = el('mmRole');
        mmTagline = el('mmTagline');
        mmBio = el('mmBio');
        mmInfo = el('mmInfo');
        mmBack = el('mmBack');
        mmClose = el('mmClose');

        var stat = el('membersStat');
        if (stat) stat.textContent = members.length + ' 位 · ' + totalPages + ' 页';

        prevBtn.addEventListener('click', function () { go(page - 1, -1); });
        nextBtn.addEventListener('click', function () { go(page + 1, 1); });

        bindSwipe();
        renderGrid(0);

        /* 再拉一次接口，把后台新添加的成员合并进来 */
        loadFromApi();

        /* 关闭：按钮 / 遮罩 / ESC */
        mmClose.addEventListener('click', closeModal);
        modal.querySelector('.mm-mask').addEventListener('click', closeModal);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();
        });

        /* 详情图加载失败 -> 占位图 */
        bindFallback(modal);

        /* 「回到江湖」：关闭弹窗并回到成员列表 */
        mmBack.addEventListener('click', function (e) {
            e.preventDefault();
            closeModal();
            var sec = el('members');
            if (sec && sec.scrollIntoView) {
                sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });

        /* 键盘左右翻页（弹窗打开时不响应） */
        document.addEventListener('keydown', function (e) {
            if (modal.classList.contains('show')) return;
            if (e.key === 'ArrowLeft') go(page - 1, -1);
            if (e.key === 'ArrowRight') go(page + 1, 1);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
