# uma-race-sim · 赛马娘国服赛道模拟器

> 开发/维护接手指南见 [`AGENTS.md`](./AGENTS.md)(架构、数据管线、环境坑、改动清单、待办)。

开源的赛马娘(国服)网页版赛道模拟工具:

- **技能发动位置**——在赛道条上直观标出每个技能在哪条弯道/哪个阶段/哪一米发动
- **速度与体力曲线**——全程逐帧(30fps)速度曲线 + 剩余体力曲线,标记体力归零(温存)点
- **每技能马身收益**——leave-one-out 消融,列出每个技能贡献的马身差/时间差

> v0.1 采用单马确定性期望模型:依赖其他马娘的条件按期望近似(UI 显式标注);多马阻挡/焦躁/追比等机制暂不参与计算。详见 `docs/最终方案.md`。

## 状态

v0.1 核心已跑通(开发版,`npm run dev` 可本地体验):

- **模拟引擎**:解包物理模型(跑法×阶段系数、末脚体力预算解算、体力/温存、上坡减速、起步放缓段),校准达标——无技能东京草2400 实算 **116.724s**(游戏实录参考 116.987s,偏差 0.26s)
- **数据**:全量技能 2641 条(精确 319/近似 2055/不支持 267,含继承固有 383 条、进化技能 826 条;剧本技能按范围排除)+ 全量赛道 138 条/17 赛场,zod 校验通过
- **界面**:配置面板(属性/适性/跑法/赛道/比赛环境(场地状态·天气·季节)/技能搜索点选)、赛道条(弯道/坡度/阶段/发动点/体力归零点)、速度+体力双曲线(uPlot)、每技能马身收益表(leave-one-out 消融)
- **装配限制**:脚质/距离档/场地/赛场/距离范围/场地状态/回转方向(顺时针·逆时针)/天气/季节任一不满足 ⇒ 整场不生效,技能列表与收益表标注「不生效」
- 未完成(见 docs/最终方案.md v0.2 路线):URL 分享、蒙样等

## 快速开始

```bash
npm install       # 安装依赖(monorepo workspaces)
npm test          # 引擎 + 分析包单元测试
npm run typecheck # 类型检查
npm run dev       # 启动前端(apps/web)
```

无后端,构建产物为纯静态站点,可部署到 GitHub Pages。

## 项目结构

```
packages/engine    模拟引擎(纯函数,零 DOM 依赖):simulate(course, runner) → 逐帧结果
packages/analysis  消融分析:ablate(course, runner) → 每技能马身收益
packages/schema    数据 schema(zod):courses/skills/version 校验
apps/web           React + uPlot + Canvas 前端
data               courses/skills/overrides + version(带来源与日期)
tools              scrape-once(一次性抓取)/ condition-map(条件文本→枚举)
docs               最终方案 / formulas(公式与来源) / parity-log(对拍记录)
```

## 数据与公式

- 技能数据:游戏解包数据一次性抓取生成(含本体/继承固有,触发代码级条件解析);后续新技能手动更新(zod 校验把关)
- 赛道数据:[alpha123/uma-skill-tools](https://github.com/alpha123/uma-skill-tools) 的游戏解包数据集(course_data.json,138 条赛道/17 赛场)
- 公式来源与校准状态:见 `docs/formulas.md`

## 来源与致谢

- **游戏本体**:《赛马娘 Pretty Derby》(Cygames;国服《闪耀!优俊少女》由哔哩哔哩代理)——本工具全部技能/赛道数值的最终来源
- **技能数据(2641 条)**:[BWIKI 赛马娘国服 WIKI](https://wiki.biligame.com/umamusume/)——[技能速查表](https://wiki.biligame.com/umamusume/%E6%8A%80%E8%83%BD%E9%80%9F%E6%9F%A5%E8%A1%A8)、游戏解包技能数据库模块(触发代码/效果/冷却)、继承技页面与国服译名(`tools/scrape-once` 一次性抓取,完整清单见 `data/version.json`)
- **赛道数据(138 条/17 赛场)**:[alpha123/uma-skill-tools](https://github.com/alpha123/uma-skill-tools) 的 `course_data.json`(游戏解包,经 `tools/make-courses.ts` 转换;赛道补正公式参考其 CourseHelpers)
- **同类模拟器(思路与对照基准)**:[614tools 技能模拟器](https://614tools.top/skill/)(公式与校准基准)、[Uma Race Emulator](http://race.wf-calc.net/)、[Google 表格 ウマ娘スキルシミュレーター](https://docs.google.com/spreadsheets/d/1wDlcXyHTML0wDzcJX7HNQTLrBXrLJeAD4z5bQ0jSrHI/edit)、[mee1080/umasim](https://github.com/mee1080/umasim)(AGPL-3.0,**只读参考**,未引入其代码)
- **机制研究**:umamusumeschool(体力公式)、[note「理論で学ぶウマ娘」](https://note.com/legatus235/n/n8c1b4c304448)、umamusu_reveng 等

逐条公式的出处与校准状态见 [`docs/formulas.md`](./docs/formulas.md)。感谢以上项目与社区资料的作者们。

## 免责声明

本项目为非官方同人工具,与 Cygames / bilibili 无关。《赛马娘 Pretty Derby》名称与相关商标归各权利方所有。数值仅作育成参考,与游戏实际表现可能存在差异。

## 许可证

- 本项目**代码**(packages / apps / tools 及构建脚本)以 [GPL-3.0-or-later](./LICENSE) 发布;
- `data/` 目录中的**游戏解包数据与 WIKI 抓取数据**不在此许可范围内:版权归 Cygames 及相应数据来源方所有,此处仅以学习研究为目的随仓库分发;如权利方提出要求,将立即移除;
- 对 AGPL-3.0 的 umasim 仅作只读参考、未引入其代码,故本项目维持 GPL-3.0。

## 引用

如果本项目对你的研究或创作有帮助,欢迎引用;仓库首页 "Cite this repository" 按钮给出同样内容(见 [CITATION.cff](./CITATION.cff)):

```bibtex
@software{mioX9527_uma_race_sim_2026,
  author  = {mioX-9527},
  title   = {uma-race-sim: 赛马娘(国服)赛道模拟器},
  year    = {2026},
  version = {v0.1.0},
  url     = {https://github.com/mioX-9527/uma-race-sim},
  license = {GPL-3.0-or-later}
}
```
