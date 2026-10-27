#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================================
 燕云十六声 · 示例百业公会
 流派数据表（Excel） -> 站点数据（JSON） 转换工具
============================================================

设计目标：让"游戏更新"这件事，只花 1 分钟。

  1. 拿到新版流派表（.xlsx）
  2. 跑：python tools/xlsx_to_json.py <新表.xlsx> --version 3.2
  3. 把 data/ 目录整体上传到宝塔 wwwroot

不需要改任何 HTML / JS。

------------------------------------------------------------
本工具输出的 JSON 结构（schemaVersion = 1）：

data/manifest.json
    { schemaVersion, current, versions:[{id,label,date,note}], builds:[{version,id,name,attrType,stage,file}] }

data/<version>/<buildId>.json
    {
      schemaVersion, meta:{...},
      panel:      { 属种: {min,max,pen,dmg} },   # 原始面板（只读）
      effective:  { 属种: {min,max,pen,dmg} },   # 实际属性（Excel 公式实际读取的）
      global:     { 精准率/会心率/会意率/... },
      monster:    { defense, physResist, elemResist, instanceTalent, battleTime, graduationBase },
      constants:  { baseDefense, defReductions, critCap, overCap, penDivisor, penDivisorNegative, fixedDmgTypes },
      toggles:    { team:{...}, gear:{...} },
      setName, setGeneralDmg, typeDmg:{...}, foodBonus:{min,max},
      skills:     { 技能名: {...} },              # 武学奇术 sheet
      buffs:      { 增益名: {...} },              # 增益 sheet
      rotation:   [ {skill,count,buffs:[...]} ],  # 竞速轴
      expected:   { total, adps, graduation }    # Excel 自算值，用于回归校验
    }

data/builds.js
    window.QN_BUNDLE = { manifest:{...}, builds:{ "<version>/<buildId>": {...} } }
    （打包版，保证用 file:// 直接双击打开也能跑）

------------------------------------------------------------
用法：
  python tools/xlsx_to_json.py <表格.xlsx>
  python tools/xlsx_to_json.py <表格.xlsx> --version 3.2 --build 破竹尘
  python tools/xlsx_to_json.py --verify <表格.xlsx>      # 只做回归校验，不写文件
  python tools/xlsx_to_json.py --rebuild                  # 只重建 manifest/builds.js
============================================================
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime

try:
    import openpyxl
    from openpyxl.utils import get_column_letter, column_index_from_string
except ImportError:
    sys.stderr.write('缺少依赖，请先执行： pip install openpyxl\n')
    raise

# ------------------------------------------------------------------
# 表格版式常量
#   ★ 如果作者以后改了表的排布，只需要改这一块，不用动解析逻辑 ★
# ------------------------------------------------------------------
LAYOUT = {
    # 主表
    'expect_sheet': '期望',
    'attr_type': 'G1',            # 流派主属种：破竹 / 鸣金 / 裂石 / 牵丝
    'set_name': 'G2',             # 套装名：连星 / 撼天 ...
    'set_general_dmg': 'G3',      # 套装通用增伤

    # 原始面板：A 列标签，B~E = 最小攻击/最大攻击/穿透/伤害加成
    'panel': {'rows': (2, 7), 'label_col': 'A',
              'cols': {'min': 'B', 'max': 'C', 'pen': 'D', 'dmg': 'E'}},

    # 实际属性：C 列标签，D~G = 最小攻击/最大攻击/穿透/伤害加成
    'effective': {'rows': (10, 14), 'label_col': 'C',
                  'cols': {'min': 'D', 'max': 'E', 'pen': 'F', 'dmg': 'G'}},

    # 全局属性：A 列标签，B 列数值
    'global': {'rows': (8, 25), 'label_col': 'A', 'value_col': 'B'},

    # 怪物属性：H 列标签，I 列数值
    'monster': {'rows': (2, 8), 'label_col': 'H', 'value_col': 'I',
                'cell': {'defense': 'I2', 'phys_resist': 'I3', 'elem_resist': 'I4',
                          'instance_talent': 'I5', 'battle_time': 'I8',
                          'graduation': 'I16'}},

    # 团队增益开关：C 标签 / D 值；套装心法开关：E 标签 / F 值
    'toggles': {'rows': (16, 22),
                'team': {'label_col': 'C', 'value_col': 'D'},
                'gear': {'label_col': 'E', 'value_col': 'F'}},

    # 竞速轴：Q = 次数，R = 技能，增益槽从 S 开始到「类型」列的前一列
    #   ★ 不同流派增益槽数量不同（13~20 个），必须按表头动态定位 ★
    'rotation': {'count_col': 'Q', 'skill_col': 'R',
                 'buff_from': 'S', 'buff_to': 'AL',
                 'type_header': '类型'},

    # 技能倍率库（武学奇术 sheet），按表头名映射列
    'skill_sheet': '武学奇术',
    'skill_key_col': 'A',
    'skill_cols': {
        'gen': '通用增伤', 'minAtk': '最小外功', 'maxAtk': '最大外功',
        'atkBonus': '外功加成', 'pen': '外功穿透', 'physDmg': '外攻伤害加成',
        'elemAtk': '属性攻击加成',
        'penJin': '鸣金穿透', 'dmgJin': '鸣金加成',
        'penLie': '裂石穿透', 'dmgLie': '裂石加成',
        'penQian': '牵丝穿透', 'dmgQian': '牵丝加成',
        'penPo': '破竹穿透', 'dmgPo': '破竹加成',
        'critRate': '会心率', 'critDmg': '会心伤害',
        'overRate': '会意率', 'overDmg': '会意伤害',
        'charge': '蓄力', 'forceAcc': '强制精准',
        'forceCrit': '强制会心', 'forceOver': '强制会意',
        'type': '类型', 'coefPhys': '外功倍率', 'fixedPhys': '外攻固伤',
        'coefElem': '属性倍率', 'fixedElem': '属性固伤', 'tuning': '定音加成',
        # 「特定增伤」别名：鸣金虹等表叫「对特定单位额外增伤」
        'special': ['特定增伤', '对特定单位额外增伤'],
        # 第 31 列（AE）在表内没有表头，是"综合系数"，用列字母兜底
        'k': 'AE',
    },
    # 技能库里是文本、不能按数字解析的列
    'skill_text_cols': ['type', 'tuning'],

    # 增益库（增益 sheet），按表头名映射列
    'buff_sheet': '增益',
    'buff_key_col': 'A',
    'buff_cols': {
        'gen': '通用增伤', 'minAtk': '最小外功', 'maxAtk': '最大外功',
        'atkBonus': '外功加成', 'pen': '外功穿透', 'physDmg': '外攻伤害加成',
        'elemAtk': '属性攻击加成',
        'penJin': '鸣金穿透', 'dmgJin': '鸣金加成',
        'penLie': '裂石穿透', 'dmgLie': '裂石加成',
        'penQian': '牵丝穿透', 'dmgQian': '牵丝加成',
        'penPo': '破竹穿透', 'dmgPo': '破竹加成',
        'critRate': '会心率', 'critDmg': '会心伤害',
        'overRate': '会意率', 'overDmg': '会意伤害',
        'directCritRate': '直接会心率', 'directOverRate': '直接会意率',
        'special': '特殊增伤',
        # 同一语义列：牵丝玉叫「特定增伤」，其余表叫「结算增伤」（Excel 都引用增益!X 列）
        'settle': ['结算增伤', '特定增伤'],
    },

    'log_sheet': '更新日志',
}

SCHEMA_VERSION = 1
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'data')


# ------------------------------------------------------------------
# 基础工具
# ------------------------------------------------------------------
def num(v, default=0.0):
    """把单元格内容安全转成数字；N/a、空串、None 一律按 default 处理。"""
    if v is None:
        return default
    if isinstance(v, bool):
        return default
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s or s in ('N/a', 'n/a', 'NA', '/', '-'):
        return default
    try:
        return float(s)
    except ValueError:
        return default


def txt(v, default=''):
    if v is None:
        return default
    s = str(v).strip()
    return s if s else default


class Grid(object):
    """带合并单元格解析的工作表包装。"""

    def __init__(self, ws):
        self.ws = ws
        self._rev = {}
        for rng in ws.merged_cells.ranges:
            for r in range(rng.min_row, rng.max_row + 1):
                for c in range(rng.min_col, rng.max_col + 1):
                    self._rev[(r, c)] = (rng.min_row, rng.min_col)

    def raw(self, row, col_letter):
        col = column_index_from_string(col_letter)
        key = (row, col)
        if key in self._rev:
            r, c = self._rev[key]
            return self.ws.cell(row=r, column=c).value
        return self.ws.cell(row=row, column=col).value

    def n(self, row, col_letter, default=0.0):
        return num(self.raw(row, col_letter), default)

    def s(self, row, col_letter, default=''):
        return txt(self.raw(row, col_letter), default)

    def max_row(self):
        return self.ws.max_row


# ------------------------------------------------------------------
# 解析：键值块（标签列 + 数值列）
# ------------------------------------------------------------------
def parse_kv(grid, cfg):
    out = {}
    lo, hi = cfg['rows']
    for r in range(lo, hi + 1):
        label = grid.s(r, cfg['label_col'])
        if not label:
            continue
        val = grid.n(r, cfg['value_col'], 0.0)
        out[label] = val
    return out


def parse_table(grid, cfg):
    """标签列 + 多列数值（如面板：min/max/pen/dmg）。"""
    out = {}
    lo, hi = cfg['rows']
    for r in range(lo, hi + 1):
        label = grid.s(r, cfg['label_col'])
        if not label:
            continue
        row = {}
        for key, col in cfg['cols'].items():
            row[key] = grid.n(r, col, 0.0)
        out[label] = row
    return out


def header_index(ws, header_row=1):
    """{表头文字: 列字母}"""
    idx = {}
    for c in range(1, ws.max_column + 1):
        v = ws.cell(row=header_row, column=c).value
        if v is None:
            continue
        key = str(v).strip()
        if key and key not in idx:
            idx[key] = get_column_letter(c)
    return idx


def parse_library(wb, sheet_name, key_col, col_map, text_keys=None):
    """解析 技能库 / 增益库：首列为名字，其余按表头名取值。

    text_keys：这些字段在表里是文本（如「类型」「定音加成」），按字符串导出。
    """
    if sheet_name not in wb.sheetnames:
        return {}, ['缺少工作表：%s' % sheet_name]
    ws = wb[sheet_name]
    grid = Grid(ws)
    heads = header_index(ws, 1)
    warnings = []
    text_keys = text_keys or []

    resolved = {}
    for key, spec in col_map.items():
        specs = spec if isinstance(spec, list) else [spec]
        for s in specs:
            if s in heads:
                resolved[key] = heads[s]
                break
            if re.fullmatch(r'[A-Z]{1,2}', s):
                resolved[key] = s      # 允许直接用列字母兜底
                break
        else:
            warnings.append('%s：找不到列「%s」（%s）' % (sheet_name, spec, key))

    lib = {}
    for r in range(2, ws.max_row + 1):
        name = grid.s(r, key_col)
        if not name or name == 'N/a':
            continue
        item = {}
        for key, col in resolved.items():
            item[key] = grid.s(r, col) if key in text_keys else grid.n(r, col, 0.0)
        lib[name] = item
    return lib, warnings


# ------------------------------------------------------------------
# 防御减免规则：从 I2 公式里解析
#   例： =687*(1-IF(F17="√",0.06,0)-IF(D20="√",0.04,0))
# ------------------------------------------------------------------
def _formula_of(ws, row, col_letter):
    """取单元格公式文本（需要 data_only=False 的工作簿）。"""
    v = ws.cell(row=row, column=column_index_from_string(col_letter)).value
    if hasattr(v, 'text'):
        v = v.text
    if not isinstance(v, str):
        return ''
    return v[1:] if v.startswith('=') else v


def parse_def_rules(wbf):
    """从 I2 公式解析怪物防御与各项减防开关。
    例：687*(1-IF(F17="√",0.06,0)-IF(D20="√",0.04,0))
    """
    ws = wbf[LAYOUT['expect_sheet']]
    formula = _formula_of(ws, 2, 'I')

    base = 687.0
    m = re.search(r'(\d+(?:\.\d+)?)\s*\*\s*\(1-', formula)
    if m:
        base = float(m.group(1))

    reductions = []
    for mm in re.finditer(r'IF\(\$?([A-Z]{1,2})\$?(\d+)="√"\s*,\s*([\d.]+)\s*,\s*0\)', formula):
        col, row, val = mm.group(1), int(mm.group(2)), float(mm.group(3))
        label = ws.cell(row=row, column=column_index_from_string(col) - 1).value
        label = str(label).strip() if label is not None else ''
        reductions.append({'toggle': label, 'value': val})

    return {'baseDefense': base, 'defReductions': reductions}


def parse_tuning_keyword(wbf, row, col_letter):
    """从「会心期望」列公式里解析全部定音加成项 (触发词, 数值单元格)。

    原表片段（各流派关键词、单元格、数量都不同）：
        破竹尘: ...*(1+IF(VLOOKUP($R2,武学奇术!$A:$ZZ,30,FALSE)="回旋伞",$B$21,0))*...
        破竹风: ...*(1+IF(...="轻击",$B$21,0))*(1+IF(...="老鼠",$B$22,0))*...
        牵丝玉: ...*(1+IF(...="弹道",$B$20,0))*...
        牵丝霖: ...*(1+IF(...="蓄力技",#REF!,0))*...   （坏引用，按 0 处理）
    """
    ws = wbf[LAYOUT['expect_sheet']]
    f = _formula_of(ws, row, col_letter)
    out = []
    for m in re.finditer(
            r'VLOOKUP\(\$?[A-Z]{1,2}\$?\d+,\s*武学奇术!\$A:\$ZZ,\s*30,\s*FALSE\)\s*=\s*"([^"]+)"'
            r'\s*,\s*(?:\$([A-Z]{1,2})\$(\d+)|#REF!)\s*,\s*0\)',
            f):
        cell = '%s%s' % (m.group(2), m.group(3)) if m.group(2) else None
        out.append({'keyword': m.group(1), 'cell': cell})
    return out


def parse_graduation_base(wbf):
    """从 I16（毕业率）公式里解析毕业基准分母。"""
    ws = wbf[LAYOUT['expect_sheet']]
    f = _formula_of(ws, 16, 'I')
    m = re.search(r'/\s*(\d+(?:\.\d+)?)', f)
    return float(m.group(1)) if m else 173431.74 if m else 173431.74


# ------------------------------------------------------------------
# 主解析
# ------------------------------------------------------------------
def parse_workbook(path, version=None, build=None):
    wb = openpyxl.load_workbook(path, data_only=True)    # 取缓存值
    wbf = openpyxl.load_workbook(path, data_only=False)  # 取公式
    warnings = []

    ws = wb[LAYOUT['expect_sheet']]
    grid = Grid(ws)

    attr_type = grid.s(1, 'G')
    set_name = grid.s(2, 'G')
    set_general_dmg = grid.n(3, 'G', 0.0)

    panel = parse_table(grid, LAYOUT['panel'])
    effective = parse_table(grid, LAYOUT['effective'])
    g = parse_kv(grid, LAYOUT['global'])

    # 定音加成：触发词 + 数值单元格（都在会心期望公式里，各流派不同）
    _exp_headers = header_index(wbf[LAYOUT['expect_sheet']], 1)
    _exp_col = _exp_headers.get('会心期望', _exp_headers.get('期望', 'L'))
    tunings = parse_tuning_keyword(wbf, 2, _exp_col)
    for t in tunings:
        t['bonus'] = num(wb[LAYOUT['expect_sheet']][t['cell']].value, 0.0) \
            if t['cell'] else 0.0

    # 食物加成所在行：优先从 D10/E10（外功实际属性）公式里解析引用的单元格，
    # 各表全局区行数不同（牵丝玉少一行、破竹风多一行）；无公式时按标签兜底
    _f10 = _formula_of(wbf[LAYOUT['expect_sheet']], 10, 'D') or ''
    _fe10 = _formula_of(wbf[LAYOUT['expect_sheet']], 10, 'E') or ''
    _refs_d = re.findall(r'B\$?(\d+)', _f10.replace(' ', ''))
    _refs_e = re.findall(r'B\$?(\d+)', _fe10.replace(' ', ''))
    _label_food_row = next((r for r in range(8, 26)
                            if grid.s(r, 'A') == '食物加成'), 23)
    food_row = int(_refs_d[1]) if len(_refs_d) > 1 else _label_food_row
    food_row_max = int(_refs_e[-1]) if len(_refs_e) > 1 else food_row + 1

    # 套装加成模式：外功行公式 (B2+食物)*IF(套装名,系数,1)；
    # 属种行有无相参与 —— 飞隼(鸣金影): B3*1.1+B7（无相不乘），撼天: (B5+B7)*1.06（无相也乘）
    #   ★ 表作者常复制公式不改条件（如牵丝翊套装=裁云，公式仍写 IF($G$2="撼天",...)），
    #     因此必须校验条件是否成立：套装名匹配才生效 ★
    set_name = txt(ws['G2'].value, '')
    set_mul, wu_mul = 1.0, 1.0
    f10 = _formula_of(wbf[LAYOUT['expect_sheet']], 10, 'D')
    m = re.search(r'IF\(\$G\$2="([^"]+)",\s*([\d.]+)\s*,\s*1\)', f10 or '')
    if m and m.group(1) == set_name:
        set_mul = float(m.group(2))
    for r in range(11, 15):
        fr = _formula_of(wbf[LAYOUT['expect_sheet']], r, 'D')
        if fr and '$B$7' in fr.replace(' ', ''):
            wu_mul = set_mul if fr.replace(' ', '').startswith('(') else 1.0
            break

    # 只保留有意义的面板行（全 0 的属种不展示）
    panel = {k: v for k, v in panel.items()
             if any(num(v.get(x), 0) for x in ('min', 'max', 'pen', 'dmg'))}

    # 类型增伤映射 F4:G7
    #   ★ F4/F5 是「武器类型」，原表里武器类技能的固伤才吃「固伤加成」★
    type_dmg = {}
    type_labels = {}
    for r in range(4, 8):
        label = grid.s(r, 'F')
        if label:
            type_dmg[label] = grid.n(r, 'G', 0.0)
            type_labels[r] = label

    # 开关
    tg = LAYOUT['toggles']
    team, gear = {}, {}
    for r in range(tg['rows'][0], tg['rows'][1] + 1):
        lab = grid.s(r, tg['team']['label_col'])
        if lab:
            team[lab] = grid.s(r, tg['team']['value_col']) == '√'
        lab2 = grid.s(r, tg['gear']['label_col'])
        if lab2:
            val = grid.s(r, tg['gear']['value_col'])
            gear[lab2] = True if val == '√' else (False if val == '×' else None)

    # 怪物属性
    mc = LAYOUT['monster']['cell']
    monster = {
        'defense': num(ws[mc['defense']].value, 0.0),
        'physResist': num(ws[mc['phys_resist']].value, 0.0),
        'elemResist': num(ws[mc['elem_resist']].value, 0.0),
        'instanceTalent': num(ws[mc['instance_talent']].value, 0.0),
        'battleTime': num(ws[mc['battle_time']].value, 96.1),
        'graduationBase': parse_graduation_base(wbf),
    }

    def_rules = parse_def_rules(wbf)

    # 竞速轴
    rot = LAYOUT['rotation']
    headers = header_index(ws, 1)
    # ★ 竞速轴列位置在不同流派表里会整体左右平移（取决于有无「真气比例」列）★
    #   一律按表头名定位，取不到时再退回常量。
    count_col = headers.get('次数', rot['count_col'])
    skill_col = headers.get('技能', rot['skill_col'])
    expect_col = headers.get('期望', 'L')
    # 增益槽：技能列之后 ~ 「类型」列之前
    type_col = headers.get(rot.get('type_header', '类型'))
    buff_start = column_index_from_string(skill_col) + 1
    if type_col:
        buff_end = column_index_from_string(type_col) - 1
    else:
        buff_end = column_index_from_string(rot['buff_to'])
    if buff_end < buff_start:
        buff_end = buff_start

    rotation = []
    for r in range(2, ws.max_row + 1):
        skill = grid.s(r, skill_col)
        if not skill or skill == 'N/a':
            continue
        cnt = grid.n(r, count_col, 1.0)
        buffs = []
        for c in range(buff_start, buff_end + 1):
            bv = grid.s(r, get_column_letter(c))
            if bv and bv != 'N/a':
                buffs.append(bv)
        exp = grid.n(r, expect_col, 0.0)     # Excel 自己算出的该行期望
        # 「结算/派生」行：期望单元格引用了**其他行**（如 =L17*0.4*(1+BX18) 或
        # =SUM(L3:L6)），内核无法按通用公式重算 —— 标记后做等比缩放
        formula_l = _formula_of(wbf[LAYOUT['expect_sheet']], r, expect_col)
        refs = re.findall(r'(?<![A-Z$])%s\$?(\d+)' % expect_col, formula_l or '')
        is_settle = 'SUM(' in formula_l or any(int(x) != r for x in refs)
        rotation.append({'skill': skill, 'count': cnt, 'buffs': buffs,
                         'exp': exp, 'settle': is_settle})

    # 汇总期望（Excel 自算）
    expected = {
        'total': num(ws['I10'].value, 0.0),
        'adps': num(ws['I12'].value, 0.0),
        'graduation': num(ws['I16'].value, 0.0),
    }

    # 库
    skills, w1 = parse_library(wb, LAYOUT['skill_sheet'], LAYOUT['skill_key_col'],
                               LAYOUT['skill_cols'], LAYOUT.get('skill_text_cols'))
    buffs, w2 = parse_library(wb, LAYOUT['buff_sheet'], LAYOUT['buff_key_col'], LAYOUT['buff_cols'])
    warnings += w1 + w2

    # 更新日志
    log = []
    if LAYOUT['log_sheet'] in wb.sheetnames:
        lws = wb[LAYOUT['log_sheet']]
        lgrid = Grid(lws)
        cur = ''
        for r in range(2, lws.max_row + 1):
            v = lgrid.s(r, 'A')
            if v:
                cur = v
            desc = lgrid.s(r, 'C')
            if desc:
                log.append({'version': cur, 'text': desc})
        if not version and log:
            version = log[-1]['version']

    # 流派 / 版本兜底：从文件名猜
    base = os.path.basename(path)
    m = re.match(r'^(.+?)(\d+阶)', base)
    if not build:
        build = m.group(1) if m else os.path.splitext(base)[0]
    stage = m.group(2) if m else ''
    if not version:
        version = datetime.now().strftime('%Y.%m')

    global_cfg = {
        'accRate': g.get('精准率', 0.0),
        'critRate': g.get('会心率', 0.0),
        'overRate': g.get('会意率', 0.0),
        'directCritRate': g.get('直接会心率', 0.0),
        'directOverRate': g.get('直接会意率', 0.0),
        'critDmg': g.get('会心伤害加成', 0.0),
        'overDmg': g.get('会意伤害加成', 0.0),
        'allMartial': g.get('全武增', 0.0),
        'bossDmg': g.get('首领增', 0.0),
        'umbrellaDmg': g.get('伞增', 0.0),
        'ropeDartDmg': g.get('绳镖增', 0.0),
        'singleArcaneDmg': g.get('单体奇术增', 0.0),
        'groupArcaneDmg': g.get('群体奇术增', 0.0),
        'umbrellaTuning': tunings[0]['bonus'] if tunings else 0.0,
        'tuningBonus': tunings[0]['bonus'] if tunings else 0.0,
        'setMul': set_mul,
        'wuMul': wu_mul,
        'fixedDmg': g.get('固伤加成', 0.0),
        'setGeneralDmg': num(ws['G3'].value, 0.0),
        'raw': g,
    }

    build_id = re.sub(r'[^\w\u4e00-\u9fa5-]', '', build) or 'build'

    data = {
        'schemaVersion': SCHEMA_VERSION,
        'meta': {
            'id': build_id,
            'name': build,
            'version': str(version),
            'stage': stage,
            'attrType': attr_type,
            'setName': txt(ws['G2'].value, ''),
            'source': base,
            'generatedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        },
        'panel': panel,
        'effective': effective,
        'global': global_cfg,
        'monster': monster,
        'constants': {
            'baseDefense': def_rules['baseDefense'],
            'defReductions': def_rules['defReductions'],
            'critCap': 0.80,
            'overCap': 0.40,
            'penDivisor': 200.0,
            'penDivisorNegative': 100.0,
            # 吃「固伤加成」的类型 = 该表类型增伤区的前两项（武器类型）
            'fixedDmgTypes': [type_labels.get(4), type_labels.get(5)],
            # 吃「定音加成」的触发词，从会心期望列公式里解析（各流派不同）
            'tuningKeyword': tunings[0]['keyword'] if tunings else None,
            # 多定音项：破竹风等表有多个触发词（轻击/老鼠），各对应不同单元格
            'tunings': tunings,
            # 套装加成：面板/食物乘 setMul；无相属攻按 wuMul 乘（飞隼不乘、撼天乘）
            'setMul': set_mul,
            'wuMul': wu_mul,
        },
        'toggles': {'team': team, 'gear': gear},
        'setName': txt(ws['G2'].value, ''),
        'setGeneralDmg': set_general_dmg,
        'typeDmg': type_dmg,
        # 食物加成：单元格行号从实际属性公式解析（各表全局区行数不同）
        'foodBonus': {'min': grid.n(food_row, 'B', 0.0),
                      'max': grid.n(food_row_max, 'B', 0.0)},
        'skills': skills,
        'buffs': buffs,
        'rotation': rotation,
        'expected': expected,
        'log': log,
    }
    return data, warnings


# ------------------------------------------------------------------
# 参考实现（与 assets/js/damage-model.js 保持同一套公式）
#   仅用于回归校验：确认导出的 JSON 能复现 Excel 的结果
# ------------------------------------------------------------------
PY = {'鸣金': 'Jin', '裂石': 'Lie', '牵丝': 'Qian', '破竹': 'Po'}


def reference_compute(data, override_panel=None, override_global=None):
    """参考实现：与 assets/js/damage-model.js 使用完全相同的公式链。"""
    G = dict(data['global'])
    if override_global:
        G.update(override_global)
    M = data['monster']
    C = data['constants']
    panel = override_panel if override_panel else data['panel']
    main = data['meta']['attrType']
    wu = panel.get('无相', {}) or {}
    food = data.get('foodBonus', {}) or {}
    set_mul = num(C.get('setMul'), 1.0)
    wu_mul = num(C.get('wuMul'), set_mul)

    def eff_of(name):
        r = panel.get(name, {}) or {}
        if name == '外功':
            mn = (num(r.get('min')) + num(food.get('min'))) * set_mul
            mx = max(num(r.get('min')) + num(food.get('min')),
                     num(r.get('max')) + num(food.get('max'))) * set_mul
        else:
            mn = num(r.get('min')) * set_mul \
                + (num(wu.get('min')) * wu_mul if name == main else 0.0)
            mx = max(num(r.get('min')), num(r.get('max'))) * set_mul \
                + (num(wu.get('max')) * wu_mul if name == main else 0.0)
        return {'min': mn, 'max': mx,
                'pen': num(r.get('pen')), 'dmg': num(r.get('dmg'))}

    eff = dict((n, eff_of(n)) for n in panel if n != '无相')

    cut = 0.0
    for rule in (C.get('defReductions') or []):
        on = data['toggles']['gear'].get(rule['toggle']) or data['toggles']['team'].get(rule['toggle'])
        if on:
            cut += num(rule['value'])
    defense = C['baseDefense'] * (1 - cut)

    def bsum(names, key):
        return sum(num(data['buffs'].get(n, {}).get(key)) for n in names
                   if n in data['buffs'])

    total = 0.0
    rows = []
    for idx, row in enumerate(data['rotation']):
        # 「结算」行：L 为引用其它行的 SUM 公式，无法按通用公式重算，
        # 这里先占位，最后按"非结算行的整体增幅"等比缩放。
        if row.get('settle'):
            rows.append({'skill': row['skill'], 'expect': row['exp'], 'settle': True})
            continue

        sk = data['skills'].get(row['skill'], {}) or {}
        b = row['buffs']
        styp = sk.get('type')

        elem_atk = num(sk.get('elemAtk')) + bsum(b, 'elemAtk')
        atk_bonus = num(sk.get('atkBonus')) + bsum(b, 'atkBonus')
        # 伞 / 绳镖 类技能吃「固伤加成」
        is_fixed = sk.get('type') in (C.get('fixedDmgTypes') or [])

        # ---- 外功段 ----
        pmin = eff['外功']['min'] * (1 + atk_bonus) + num(sk.get('minAtk')) + bsum(b, 'minAtk') - defense
        pmax = eff['外功']['max'] * (1 + atk_bonus) + num(sk.get('maxAtk')) + bsum(b, 'maxAtk') - defense
        pen_p = eff['外功']['pen'] - M['physResist'] + num(sk.get('pen')) + bsum(b, 'pen')
        pen_rate = pen_p / C['penDivisor'] if pen_p > 0 else pen_p / C['penDivisorNegative']
        phys_dmg = eff['外功']['dmg'] + num(sk.get('physDmg')) + bsum(b, 'physDmg')
        coef_p = num(sk.get('coefPhys'))
        fixed_p = num(sk.get('fixedPhys')) * (1 + num(G['fixedDmg'])) if is_fixed else num(sk.get('fixedPhys'))
        fixed_e = num(sk.get('fixedElem')) * (1 + num(G['fixedDmg'])) if is_fixed else num(sk.get('fixedElem'))

        phys_mean = (((pmin + pmax) / 2) * coef_p + fixed_p) * (1 + pen_rate) * (1 + phys_dmg)
        phys_max = (pmax * coef_p + fixed_p) * (1 + pen_rate) * (1 + phys_dmg)
        phys_min = (pmin * coef_p + fixed_p) * (1 + pen_rate) * (1 + phys_dmg)

        # ---- 属种段（鸣金 / 裂石 / 牵丝 / 破竹）----
        def attr_part(ename):
            e = eff.get(ename, {})
            mn = num(e.get('min')) * (1 + elem_atk)
            mx = num(e.get('max')) * (1 + elem_atk)
            pen = num(e.get('pen')) - M['elemResist'] \
                + num(sk.get('pen' + PY[ename])) + bsum(b, 'pen' + PY[ename])
            prate = pen / C['penDivisor'] if pen > 0 else pen / C['penDivisorNegative']
            dmgb = num(e.get('dmg')) + num(sk.get('dmg' + PY[ename])) + bsum(b, 'dmg' + PY[ename])
            if main == ename:
                coef = num(sk.get('coefElem'))
                fixed = fixed_e * 1.5        # 属性固伤（已含固伤加成）×1.5
            else:
                coef = coef_p
                fixed = 0.0
            return {
                'mean': (((mn + mx) / 2) * coef + fixed) * (1 + prate) * (1 + dmgb),
                'max': (mx * coef + fixed) * (1 + prate) * (1 + dmgb),
                'min': (mn * coef + fixed) * (1 + prate) * (1 + dmgb),
                'mn': mn, 'mx': mx, 'coef': coef, 'fixed': fixed,
                'penRate': prate, 'dmg': dmgb,
            }

        parts = [{'name': '外功', 'mean': phys_mean, 'max': phys_max, 'min': phys_min,
                  'mn': pmin, 'mx': pmax, 'coef': coef_p, 'fixed': fixed_p,
                  'penRate': pen_rate, 'dmg': phys_dmg}]
        for ename in ('鸣金', '裂石', '牵丝', '破竹'):
            p = attr_part(ename)
            p['name'] = ename
            parts.append(p)

        base_mean = sum(p['mean'] for p in parts)
        base_max = sum(p['max'] for p in parts)
        base_min = sum(p['min'] for p in parts)

        # ---- 生效概率 ----
        gen = num(data.get('setGeneralDmg')) \
            + num((data.get('typeDmg') or {}).get(styp)) \
            + num(sk.get('gen')) + bsum(b, 'gen')
        special = bsum(b, 'special') + num(M['instanceTalent'])
        specific = num(sk.get('special'))
        for n in b:
            # 「结算增伤/对特定单位额外增伤」：优先增益库，鸣金虹等表的增益
            # 行登记在武学奇术里，则回退查技能库
            v = data['buffs'].get(n, {}).get('settle')
            if not v:
                v = data['skills'].get(n, {}).get('special')
            specific += num(v)

        crit_dmg_mult = 1 + num(G['critDmg']) + num(sk.get('critDmg')) + bsum(b, 'critDmg')
        over_dmg_mult = 1 + num(G['overDmg']) + num(sk.get('overDmg')) + bsum(b, 'overDmg')

        force_crit = num(sk.get('forceCrit')) == 1
        force_over = num(sk.get('forceOver')) == 1
        force_acc = num(sk.get('forceAcc')) == 1

        acc_eff = min(1.0 if force_crit else num(G['accRate']), 1.0)
        crit_eff = ((1.0 if force_crit else min(C['critCap'],
                        num(G['critRate']) + num(sk.get('critRate')) + bsum(b, 'critRate')))
                   + num(G['directCritRate']) + bsum(b, 'directCritRate')) \
                   * (0.0 if force_over else 1.0)
        over_eff = ((1.0 if force_over else min(C['overCap'],
                        num(G['overRate']) + num(sk.get('overRate')) + bsum(b, 'overRate')))
                   + num(G['directOverRate']) + bsum(b, 'directOverRate')) \
                   * (0.0 if force_crit else 1.0)

        p_crit = min((1 - over_eff) * acc_eff, acc_eff * crit_eff)
        p_over = over_eff
        p_graze = (0.0 if force_acc else (1 - acc_eff)) * (1 - over_eff)
        p_normal = 1 - p_over - p_crit - p_graze

        tune = 1.0 + sum(num(t.get('bonus')) for t in (C.get('tunings') or [])
                         if t.get('keyword') == sk.get('tuning'))
        tail = num(row['count'], 1.0) * tune * (1 + special) * (1 + specific)

        m_val = base_mean * (1 + gen) * crit_dmg_mult * tail
        n_val = base_max * (1 + gen) * over_dmg_mult * tail
        o_val = base_mean * (1 + gen) * tail
        p_val = base_min * (1 + gen) * tail

        expect = m_val * p_crit + n_val * p_over + o_val * p_normal + p_val * p_graze
        total += expect
        rows.append({
            'skill': row['skill'], 'expect': expect,
            'M': m_val, 'N': n_val, 'O': o_val, 'P': p_val,
            'pCrit': p_crit, 'pOver': p_over, 'pNormal': p_normal, 'pGraze': p_graze,
            'baseMean': base_mean, 'baseMax': base_max, 'baseMin': base_min,
            'gen': gen, 'critDmg': crit_dmg_mult, 'overDmg': over_dmg_mult,
            'special': special, 'specific': specific, 'tune': tune,
            'penRate': pen_rate, 'physDmg': phys_dmg, 'elemAtk': elem_atk,
            'parts': parts,
        })

    # 结算行等比缩放：保证用表里原始数据时，内核总伤 == Excel 总伤
    excel_normal = sum(r['exp'] for r in data['rotation'] if not r['settle'])
    ratio = (total / excel_normal) if excel_normal else 1.0
    for i, row in enumerate(data['rotation']):
        if row.get('settle'):
            rows[i]['expect'] = row['exp'] * ratio
            total += rows[i]['expect']

    time = num(M['battleTime'], 96.1)
    return {'total': total, 'adps': total / time if time else 0,
            'graduation': (total / time / num(M['graduationBase'], 1)) if time else 0,
            'rows': rows}


def reference_total(data, **kw):
    return reference_compute(data, **kw)['total']




# ------------------------------------------------------------------
# 输出
# ------------------------------------------------------------------
def write_json(path, obj):
    d = os.path.dirname(path)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def update_manifest(meta):
    mpath = os.path.join(DATA_DIR, 'manifest.json')
    manifest = {'schemaVersion': SCHEMA_VERSION, 'current': '', 'versions': [], 'builds': []}
    if os.path.exists(mpath):
        try:
            with open(mpath, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
        except Exception:
            pass

    ver = meta['version']
    versions = [v for v in manifest.get('versions', []) if v.get('id') != ver]
    versions.append({'id': ver, 'label': '数据版本 ' + ver,
                     'date': datetime.now().strftime('%Y-%m-%d')})
    versions.sort(key=lambda v: _ver_key(v['id']))
    manifest['versions'] = versions
    manifest['current'] = ver

    builds = [b for b in manifest.get('builds', [])
              if not (b.get('version') == ver and b.get('id') == meta['id'])]
    builds.append({'version': ver, 'id': meta['id'], 'name': meta['name'],
                   'attrType': meta['attrType'], 'stage': meta['stage'],
                   'file': 'data/%s/%s.json' % (ver, meta['id'])})
    manifest['builds'] = builds
    manifest['schemaVersion'] = SCHEMA_VERSION
    write_json(mpath, manifest)
    return manifest


def _ver_key(v):
    parts = re.split(r'[.\-]', str(v))
    out = []
    for p in parts:
        out.append((0, int(p)) if p.isdigit() else (1, p))
    return out


def rebuild_bundle(base=None):
    """打包成 data/builds.js。base 为空时用默认 data/；
       传入 base（如 --out 指定的目录）时，按该目录解析 file 路径。"""
    data_dir = base or DATA_DIR
    root = base or ROOT
    mpath = os.path.join(data_dir, 'manifest.json')
    manifest = {}
    if os.path.exists(mpath):
        with open(mpath, 'r', encoding='utf-8') as f:
            manifest = json.load(f)

    builds = {}
    for entry in manifest.get('builds', []):
        rel = entry['file']
        if base:
            rel = re.sub(r'^data/', '', rel, count=1)
        p = os.path.join(root, rel.replace('/', os.sep))
        if os.path.exists(p):
            with open(p, 'r', encoding='utf-8') as f:
                builds['%s/%s' % (entry['version'], entry['id'])] = json.load(f)

    bundle = {'schemaVersion': SCHEMA_VERSION, 'manifest': manifest, 'builds': builds,
              'generatedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
    out = os.path.join(data_dir, 'builds.js')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('/* 自动生成，请勿手改。由 tools/xlsx_to_json.py 生成 */\n')
        f.write('window.QN_BUNDLE = ')
        json.dump(bundle, f, ensure_ascii=False)
        f.write(';\n')
    return out, len(builds)


def main():
    global DATA_DIR
    ap = argparse.ArgumentParser(description='流派数据表 -> 站点 JSON')
    ap.add_argument('xlsx', nargs='?', help='流派表 .xlsx 路径')
    ap.add_argument('--version', help='数据版本号，如 3.2；缺省自动取更新日志最后一版')
    ap.add_argument('--build', help='流派名，如 破竹尘；缺省自动从文件名推断')
    ap.add_argument('--out', default=DATA_DIR, help='输出目录，默认 data/')
    ap.add_argument('--verify', action='store_true', help='只做回归校验')
    ap.add_argument('--rebuild', action='store_true', help='只重建 manifest + builds.js')
    args = ap.parse_args()

    if args.rebuild:
        p, n = rebuild_bundle()
        print('已重建：%s（%d 个流派）' % (p, n))
        return

    if not args.xlsx:
        ap.error('请提供 .xlsx 路径')

    path = os.path.abspath(args.xlsx)
    if not os.path.exists(path):
        sys.stderr.write('找不到文件：%s\n' % path)
        sys.exit(1)

    data, warnings = parse_workbook(path, args.version, args.build)
    meta = data['meta']

    print('=' * 58)
    print(' 流派：%s（%s）  数据版本：%s  主属种：%s'
          % (meta['name'], meta['stage'], meta['version'], meta['attrType']))
    print('=' * 58)
    print(' 技能库：%d 条   增益库：%d 条   竞速轴：%d 行'
          % (len(data['skills']), len(data['buffs']), len(data['rotation'])))

    exp = data['expected']
    if exp['total']:
        got = reference_total(data)
        dev = abs(got - exp['total']) / exp['total'] * 100 if exp['total'] else 0
        print(' Excel 总伤：%.4f' % exp['total'])
        print(' 内核总伤  ：%.4f' % got)
        print(' 偏差      ：%.6f%%   %s' % (dev, 'OK' if dev < 0.5 else '⚠ 需要核对公式'))
    else:
        print(' 未读到汇总总伤，跳过回归校验')

    if warnings:
        print('-' * 58)
        print(' 解析告警：')
        for w in warnings:
            print('   - ' + w)

    if args.verify:
        return

    out_dir = os.path.abspath(args.out)
    os.makedirs(os.path.join(out_dir, meta['version']), exist_ok=True)
    jpath = os.path.join(out_dir, meta['version'], '%s.json' % meta['id'])
    write_json(jpath, data)
    print('-' * 58)
    print(' 已输出：%s' % os.path.relpath(jpath, ROOT))

    DATA_DIR = out_dir
    update_manifest(meta)
    p, n = rebuild_bundle()
    print(' 已输出：%s（%d 个流派）' % (os.path.relpath(p, ROOT), n))
    print('=' * 58)
    print(' 下一步：把 data/ 目录上传到宝塔 wwwroot 即可生效。')


if __name__ == '__main__':
    main()
