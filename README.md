# 公会官网模板 · 纯前端展示版

一套**不需要服务器**就能跑的公会官网。原生 HTML + CSS + JavaScript，没有框架、没有构建步骤。

拿到这个文件夹后，把示例内容换成你自己的，然后：

- **想本地看看** → 起个本地服务打开 `index.html`
- **想放到网上** → 把整个文件夹的内容传到任意静态空间（GitHub Pages、腾讯云 COS、 Nginx 目录都行）

---

## 这个版本能做什么

| 功能 | 状态 | 说明 |
|---|---|---|
| 首页展示（介绍 / 活动 / 成员 / 照片墙 / 转盘 / 工具入口） | ✅ | 全部可用 |
| 照片墙（灯箱看大图、懒加载） | ✅ | 读本地图库，能看能点 |
| 双转盘 | ✅ | 纯前端，数据内置 |
| 流派计算器 | ✅ | 读 `data/` 下的 JSON |
| 在线投稿照片 | ❌ | 需要服务器 → 用「完整功能版」 |
| 在线报名登记 | ❌ | 同上 |
| 后台加人 | ❌ | 同上 |

> 照片墙页面上的「我要投稿」按钮在这个版本里**点了会失败**（因为没有后端接收）。
> 访客仍然能正常浏览照片，只是不能上传。

---

## 怎么本地预览

**推荐**起一个本地服务（比双击打开少很多麻烦）：

```bash
python -m http.server 8080
```

然后浏览器打开 `http://127.0.0.1:8080/index.html`。

> 直接双击 `index.html` 也能看到大部分内容，但照片墙会因为浏览器的安全限制读不到数据文件。

---

## 目录结构

```
index.html          首页（所有区块都在这里）
gallery.html        照片墙
wheels.html         双转盘
calculator.html     流派计算器

assets/
├─ css/             4 个样式文件（style 是全局，其余按模块拆）
├─ js/              7 个脚本（main 通用，其余按模块拆）
└─ img/
    ├─ members/     成员封面与大图
    ├─ photos/      照片墙图库
    └─ activities/  活动封面

data/               ★ 网站的数据层
├─ members.js       成员数据
├─ photos.js        照片清单
├─ activities.json  活动数据（唯一手写维护的真源）
├─ activities.js    活动的离线兜底版（脚本生成）
└─ builds.js + 3.x/ 计算器数据

tools/              本地工具，只在自己电脑上跑，不用上传
sources/            放计算器 Excel 的地方
```

---

## ⚠️ 部署前必须替换的内容

现在里面全是**示例占位**，搜「待填写」就能找到所有该改的地方。

| # | 要改什么 | 在哪 |
|---|---|---|
| 1 | 公会名（现在叫「示例百业」） | `index.html` 的 `<title>`、导航栏、首屏大标题、页脚 |
| 2 | 口号与简介 | `index.html` 首屏和 `#about` 区块 |
| 3 | 招募要求 | `index.html` 的 `#recruit` 区块 |
| 4 | 成员 | `data/members.js` + `assets/img/members/` |
| 5 | 活动 | `data/activities.json` + `assets/img/activities/` |
| 6 | 照片 | `assets/img/photos/`（放完要跑一次脚本，见下） |
| 7 | 转盘内容 | `assets/js/wheel.js` 里的扇区文字 |
| 8 | 计算器数据 | `data/` 下的版本目录（不需要计算器可整块删掉） |

### 占位图片长什么样

`assets/img/` 里现在是 `.svg` 占位图（深底金字写着"示例成员/示例照片"）。
把你的真实图片放进去，然后**把数据文件里指向 `.svg` 的路径改成真实文件名**即可。

---

## 换内容的三种做法

| 我想改 | 怎么做 |
|---|---|
| **成员** | 填好 `tools/成员信息收集表.csv`（或 xlsx）→ `node tools/import-members.js` → 自动生成 `data/members.js` 并把图片拷进 `assets/img/members/` |
| **照片** | 图片丢进 `assets/img/photos/` → 双击 `更新照片墙数据.bat` → 自动生成 `data/photos.js` |
| **活动** | 手写编辑 `data/activities.json` → `node tools/sync-activities.js` |

照片的文件名可以这样写，脚本会自动拆出标题和投稿人：

```
百业战合影.jpg            →  标题「百业战合影」
百业战合影@张三.jpg        →  标题「百业战合影」，投稿人「张三」
```

---

## 改完自检

在项目目录里跑这几个命令，确认没改坏：

```bash
node tools/members_smoke_test.js       # 成员模块
node tools/activities_smoke_test.js    # 活动模块
node tools/wheel_smoke_test.js         # 转盘
```

全部显示"通过 N 项"就对了。有失败项会把原因打印出来。

---

## 常见问题

| 问题 | 原因 |
|---|---|
| 直接双击打开，照片墙是空的 | 浏览器的跨域限制，用 `python -m http.server` 起服务再访问 |
| 改了文件但网页没变化 | 浏览器缓存，按 Ctrl + F5 |
| 跑脚本提示找不到 node / python | 本机没装，或用 `待上传清单.bat` 前需要先装 Node |
| 计算器一片空白 | `data/` 下的版本目录没传全 |
| 照片墙灯箱点了没反应 | 它是从 CDN 加载的，断网或被墙时会失效，页面会自动降级成"新标签页打开图片" |

---

## 想要投稿和报名功能？

它在这个版本的基础上多了后台加人、在线报名、在线投稿三个需要服务器的功能，以及配套的 PHP 接口和数据库表。
