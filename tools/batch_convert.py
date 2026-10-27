# -*- coding: utf-8 -*-
"""批量转换：把 sources/ 目录下的所有流派表一次性转成站点数据。

用法：
    python tools/batch_convert.py                # 扫描 sources/ 下所有 .xlsx
    python tools/batch_convert.py --dir 新表目录  # 指定目录
    python tools/batch_convert.py --clean        # 清空 data/ 后全量重建

约定：
    文件名形如「牵丝翊115阶竞速轴属性毕业率进阶计算器3.1（.xlsx」
    脚本自动从文件名中提取「流派名」与「版本号」，无需手工指定。
"""
import os
import re
import sys
import json
import shutil
import argparse
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import xlsx_to_json as X  # noqa: E402

ROOT = X.ROOT
DEFAULT_SRC = os.path.join(ROOT, 'sources')

# 流派名：文件名开头的连续中文（如 破竹尘 / 牵丝翊 / 鸣金虹）
RE_BUILD = re.compile(r'^([一-龥]{2,6})')
# 版本号：形如 3.1 / 3.10，通常出现在文件名末尾（允许其后跟「（」等字符）
RE_VER = re.compile(r'(\d+\.\d+)\s*(?:[（(][^）)]*)?\s*\.xlsx$')


def guess_meta(path):
    """从文件名推断 (流派名, 版本号)；版本号拿不到时返回 None，交给更新日志兜底。"""
    base = os.path.basename(path)
    m = RE_BUILD.match(base)
    build = m.group(1) if m else None
    mv = RE_VER.search(base)
    version = mv.group(1) if mv else None
    return build, version


def find_sources(src_dir):
    out = []
    for name in sorted(os.listdir(src_dir)):
        if not name.lower().endswith('.xlsx'):
            continue
        if name.startswith('~$') or name.startswith('.'):
            continue
        out.append(os.path.join(src_dir, name))
    return out


def sync_output(out_dir, expected, protect_ids=()):
    """expected: 本次成功解析的 (流派, 版本)；protect_ids: 解析失败的流派，保留其旧数据不动"""
    """让输出目录与 sources/ 保持一致（镜像）。

    sources/ 里删掉的表格，对应的版本数据会从 manifest 中移除、
    JSON 文件一并删除，空的版本目录也清掉；
    再把 current 指向现在存在的最高版本。
    这样「删旧表 -> 放新表 -> 跑一次」就等于换数据，不用手改任何配置。
    """
    mpath = os.path.join(out_dir, 'manifest.json')
    if not os.path.exists(mpath):
        return

    with open(mpath, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    keep, removed = [], []
    for b in manifest.get('builds', []):
        key = (b.get('id'), b.get('version'))
        if key in expected or b.get('id') in protect_ids:
            keep.append(b)
            continue
        removed.append(b)
        p = os.path.join(out_dir, str(b.get('version')), '%s.json' % b.get('id'))
        if os.path.exists(p):
            os.remove(p)

    manifest['builds'] = keep
    used = set(b['version'] for b in keep)

    # 版本清单只保留还在用的
    manifest['versions'] = [v for v in manifest.get('versions', []) if v.get('id') in used]
    for v in sorted(used, key=X._ver_key):
        if not any(x.get('id') == v for x in manifest['versions']):
            manifest['versions'].append({
                'id': v, 'label': '数据版本 ' + v,
                'date': datetime.now().strftime('%Y-%m-%d')
            })
    manifest['versions'].sort(key=lambda v: X._ver_key(v['id']))
    manifest['current'] = manifest['versions'][-1]['id'] if manifest['versions'] else ''
    X.write_json(mpath, manifest)

    # 清掉已经空掉的版本目录
    for d in sorted(os.listdir(out_dir)):
        full = os.path.join(out_dir, d)
        if os.path.isdir(full) and d not in used and not os.listdir(full):
            shutil.rmtree(full)

    if removed:
        print(' [SYNC] 已移除 %d 条旧数据：%s'
              % (len(removed), '、'.join('%s v%s' % (b['id'], b['version']) for b in removed)))
    else:
        print(' [SYNC] 数据与 sources/ 一致，无需清理')


def main():
    ap = argparse.ArgumentParser(description='批量转换流派表 -> 站点 JSON')
    ap.add_argument('--dir', default=DEFAULT_SRC, help='流派表存放目录，默认 sources/')
    ap.add_argument('--out', default=X.DATA_DIR, help='输出目录，默认 data/')
    ap.add_argument('--clean', action='store_true', help='清空输出目录后全量重建')
    ap.add_argument('--verify', action='store_true', help='只做回归校验，不写文件')
    ap.add_argument('--keep', action='store_true',
                    help='保留已删除表格的旧数据（默认：以 sources/ 为准，自动清理）')
    args = ap.parse_args()

    src_dir = os.path.abspath(args.dir)
    if not os.path.isdir(src_dir):
        sys.stderr.write('目录不存在：%s\n' % src_dir)
        sys.exit(1)

    files = find_sources(src_dir)
    if not files:
        sys.stderr.write('目录中没有 .xlsx：%s\n' % src_dir)
        sys.exit(1)

    out_dir = os.path.abspath(args.out)
    if args.clean and not args.verify:
        import shutil
        if os.path.isdir(out_dir):
            shutil.rmtree(out_dir)
        os.makedirs(out_dir, exist_ok=True)

    print('=' * 74)
    print(' 批量转换：%s  ->  %s' % (src_dir, out_dir))
    print(' 共发现 %d 张流派表' % len(files))
    print('=' * 74)

    ok, warn, fail = 0, 0, 0
    rows = []
    expected = set()          # 本次成功解析出来的 (流派, 版本)
    protect_ids = set()       # 解析失败的流派，同步时保留其旧数据

    for path in files:
        build, version = guess_meta(path)
        name = os.path.basename(path)
        try:
            data, warnings = X.parse_workbook(path, version, build)
        except Exception as e:
            fail += 1
            print(' [FAIL] %-30s  解析异常：%s' % (build or name, e))
            if build:
                protect_ids.add(build)      # 这张表坏了：保留它原有的数据，别删
            continue

        meta = data['meta']
        exp = data['expected']
        dev = None
        if exp['total']:
            got = X.reference_total(data)
            dev = abs(got - exp['total']) / exp['total'] * 100

        if dev is None:
            status = 'SKIP'
            warn += 1
        elif dev < 0.5:
            status = 'OK'
            ok += 1
        else:
            status = 'DEV'
            warn += 1

        rows.append((meta['name'], meta['version'], meta['attrType'], status,
                     exp['total'], dev, len(data['skills']), len(data['buffs']),
                     len(data['rotation']), warnings))

        print(' [%-4s] %-6s v%-4s %-3s  技能%2d 增益%2d 轴%3d行  总伤 %s  偏差 %s'
              % (status, meta['name'], meta['version'], meta['attrType'],
                 len(data['skills']), len(data['buffs']), len(data['rotation']),
                 ('%.2f' % exp['total']) if exp['total'] else '-',
                 ('%.6f%%' % dev) if dev is not None else '-'))

        if not args.verify:
            X.DATA_DIR = out_dir
            vdir = os.path.join(out_dir, meta['version'])
            os.makedirs(vdir, exist_ok=True)
            jpath = os.path.join(vdir, '%s.json' % meta['id'])
            X.write_json(jpath, data)
            X.update_manifest(meta)
            expected.add((meta['id'], meta['version']))

    if not args.verify:
        if not args.keep:
            sync_output(out_dir, expected, protect_ids)
        p, n = X.rebuild_bundle(out_dir)
        print('-' * 74)
        print(' 已输出 %s（%d 个流派）' % (os.path.relpath(p, ROOT), n))

    print('=' * 74)
    print(' 结果：成功 %d  需核对 %d  失败 %d' % (ok, warn, fail))
    for r in rows:
        for w in r[9]:
            print('   [%s] 告警：%s' % (r[0], w))
    print('=' * 74)


if __name__ == '__main__':
    main()
