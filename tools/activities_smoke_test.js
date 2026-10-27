/* 百业活动模块冒烟测试（Node + 最小 DOM 模拟）
   用法：node tools/activities_smoke_test.js
   验证：6 项 / 每页 4 项 / 2 页、统计文案实时更新、卡片结构、翻页禁用态 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);

const stub = require('./dom_stub');
const env = stub.create({ ids });
global.document = env.document;
global.window = env.window;
const store = env.store;

/* 直接从数据文件读一份，供下面的断言使用。
   ★ 断言写的是「数据里的第 N 条」而不是写死活动名，
     这样你换成自己的活动后，测试依然有效。 */
const ACTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'activities.json'), 'utf8'));
const TOTAL = ACTS.length;
const PAGES = Math.max(1, Math.ceil(TOTAL / 4));
const pad = n => String(n).padStart(2, '0');

/* 模拟线上：fetch 命中 data/activities.json */
global.fetch = () => Promise.resolve({
    json: () => Promise.resolve(ACTS)
});

eval(fs.readFileSync(path.join(ROOT, 'assets', 'js', 'activities.js'), 'utf8'));

const pass = [], fail = [];
function check(name, ok, got) { (ok ? pass : fail).push(name + (ok ? '' : ' => ' + got)); }

setTimeout(() => {
    const box = store['actList'];
    const h = () => box._html;

    /* 第 1 页 */
    check('第1页 4 张卡', (h().match(/act-card/g) || []).length === 4, (h().match(/act-card/g) || []).length);
    check('统计文案', store['actStat'].textContent === pad(TOTAL) + ' 项 · 01 / ' + pad(PAGES) + ' 页', store['actStat'].textContent);
    check('底部页码', store['actCur'].textContent === '01' && store['actTotal'].textContent === pad(PAGES),
        store['actCur'].textContent + '/' + store['actTotal'].textContent);
    check('圆点 ' + PAGES + ' 个', store['actDots'].children.length === PAGES, store['actDots'].children.length);
    check('首页上一页禁用', store['actPrev'].disabled === true, String(store['actPrev'].disabled));

    ['01', '02', '03', '04'].forEach(n => {
        check('第1页含编号 ' + n, h().indexOf('>' + n + '<') >= 0, '无');
    });
    check('第1页显示主持人', h().indexOf('主持 · ' + ACTS[0].host) >= 0, '无');
    check('标题带「」', h().indexOf('「' + ACTS[0].title + '」') >= 0, '无');
    check('编号装饰', h().indexOf('act-no') >= 0, '无');
    check('封面图路径', h().indexOf('assets/img/activities/') >= 0, '无');

    /* 翻到第 2 页 */
    store['actNext'].dispatch('click');
    setTimeout(() => {
        var rest = Math.min(4, TOTAL - 4);
        check('第2页 ' + rest + ' 张卡', (h().match(/act-card/g) || []).length === rest, (h().match(/act-card/g) || []).length);
        check('统计同步更新', store['actStat'].textContent === pad(TOTAL) + ' 项 · 02 / ' + pad(PAGES) + ' 页', store['actStat'].textContent);
        check('底部页码同步', store['actCur'].textContent === '02', store['actCur'].textContent);
        if (ACTS[4]) {
            check('第2页含第5条编号', h().indexOf('>' + ACTS[4].no + '<') >= 0, '无');
            check('第2页含第5条标题', h().indexOf('「' + ACTS[4].title + '」') >= 0, '无');
            check('第2页含第5条描述', h().indexOf(ACTS[4].desc) >= 0, '无');
        }
        if (ACTS[5]) check('第2页含第6条标题', h().indexOf('「' + ACTS[5].title + '」') >= 0, '无');
        check('末页下一页禁用', store['actNext'].disabled === true, String(store['actNext'].disabled));

        /* 回到第 1 页 */
        store['actPrev'].dispatch('click');
        setTimeout(() => {
            check('返回第1页', (h().match(/act-card/g) || []).length === Math.min(4, TOTAL) &&
                store['actStat'].textContent === pad(TOTAL) + ' 项 · 01 / ' + pad(PAGES) + ' 页', store['actStat'].textContent);

            console.log('通过 ' + pass.length + ' 项');
            if (fail.length) {
                console.log('失败 ' + fail.length + ' 项：');
                fail.forEach(f => console.log('  ✗ ' + f));
                process.exitCode = 1;
            } else {
                console.log('✔ 百业活动模块冒烟测试全部通过');
            }
        }, 260);
    }, 260);
}, 260);
