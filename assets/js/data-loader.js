/* ============================================================
   流派数据加载器
   ------------------------------------------------------------
   优先读取 data/manifest.json + data/<版本>/<流派>.json（实时、可增量上传）；
   若 fetch 失败（例如用 file:// 直接双击打开），自动回退到
   data/builds.js 里的打包数据 window.QN_BUNDLE。
   ============================================================ */
window.QNData = (function () {
    'use strict';

    var manifest = null;
    var builds = {};
    var pending = null;

    function getJSON(url) {
        return fetch(url, { cache: 'no-cache' }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
            return r.json();
        });
    }

    function bundle() {
        return window.QN_BUNDLE || null;
    }

    function init() {
        if (pending) return pending;
        pending = getJSON('data/manifest.json').catch(function () {
            var b = bundle();
            if (b && b.manifest) return b.manifest;
            throw new Error('无法加载 data/manifest.json');
        }).then(function (m) {
            manifest = m;
            return m;
        });
        return pending;
    }

    function getManifest() {
        return manifest;
    }

    function getVersions() {
        return (manifest && manifest.versions) ? manifest.versions : [];
    }

    function getBuilds(version) {
        var all = (manifest && manifest.builds) ? manifest.builds : [];
        if (!version) return all;
        return all.filter(function (b) { return b.version === version; });
    }

    /* 全部已导入流派（按 id 去重，保留最新版本在前） */
    function getBuildNames() {
        var all = getBuilds(null);
        var seen = {}, out = [];
        all.forEach(function (b) {
            if (seen[b.id]) return;
            seen[b.id] = true;
            out.push(b);
        });
        out.sort(function (a, b) { return a.id.localeCompare(b.id, 'zh-Hans-CN'); });
        return out;
    }

    /* 某个流派现有的数据版本（新 -> 旧） */
    function getVersionsOf(id) {
        return getBuilds(null)
            .filter(function (b) { return b.id === id; })
            .map(function (b) { return b.version; })
            .sort()
            .reverse();
    }

    function loadBuild(version, id) {
        var key = version + '/' + id;
        if (builds[key]) return Promise.resolve(builds[key]);

        return getJSON('data/' + version + '/' + id + '.json').catch(function () {
            var b = bundle();
            if (b && b.builds && b.builds[key]) return b.builds[key];
            throw new Error('无法加载流派数据：' + key);
        }).then(function (data) {
            builds[key] = data;
            return data;
        });
    }

    return {
        init: init,
        getManifest: getManifest,
        getVersions: getVersions,
        getBuilds: getBuilds,
        getBuildNames: getBuildNames,
        getVersionsOf: getVersionsOf,
        loadBuild: loadBuild
    };
})();
