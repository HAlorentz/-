/* 示例百业 · 百业公会 | 全站交互 */
(function () {
    'use strict';

    /* ---------- 移动端导航展开 / 收起 ---------- */
    var toggle = document.getElementById('navToggle');
    var links = document.getElementById('navLinks');

    if (toggle && links) {
        toggle.addEventListener('click', function () {
            links.classList.toggle('open');
        });

        links.addEventListener('click', function (e) {
            if (e.target.tagName === 'A') {
                links.classList.remove('open');
            }
        });
    }

    /* ---------- 滚动进入视口的淡入动画 ---------- */
    var revealEls = document.querySelectorAll('.section-head, .info-card, .req-list li, .join-post, .table-wrap, .tool-card, .about-text');

    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });

        revealEls.forEach(function (el) {
            el.classList.add('reveal');
            io.observe(el);
        });
    }

    /* 注：群二维码与群号卡片已下线，改为统一走「入庄投帖」登记页 */
})();
