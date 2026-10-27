/* 把 data/activities.json 同步成离线兜底文件 data/activities.js
   —— 线上用 http(s) 打开时直接读 JSON；本地双击 index.html（file://）
      无法 fetch，就退回这个脚本生成的同名数组。
   用法：node tools/sync-activities.js
   改完 activities.json 后跑一次即可。 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = path.join(ROOT, 'data', 'activities.json');
const out = path.join(ROOT, 'data', 'activities.js');

const list = JSON.parse(fs.readFileSync(src, 'utf8'));

const banner =
    '/* 由 tools/sync-activities.js 从 activities.json 自动生成，请勿手改。\n' +
    '   用途：file:// 直接打开 index.html 时的离线兜底数据。 */\n';

fs.writeFileSync(out, banner + 'window.QN_ACTIVITIES = ' + JSON.stringify(list, null, 4) + ';\n', 'utf8');
console.log('已同步 ' + list.length + ' 条活动 -> data/activities.js');
