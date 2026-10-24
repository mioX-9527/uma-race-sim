# uma-race-sim · 赛马娘国服赛道模拟器

开源的赛马娘(国服)网页版赛道模拟工具:

- **技能发动位置**——在赛道条上直观标出每个技能在哪条弯道/哪个阶段/哪一米发动
- **速度与体力曲线**——全程逐帧(30fps)速度曲线 + 剩余体力曲线,标记体力归零(温存)点
- **每技能马身收益**——leave-one-out 消融,列出每个技能贡献的马身差/时间差

> v0.1 采用单马确定性期望模型:依赖其他马娘的条件按期望近似(UI 显式标注);多马阻挡/焦躁/追比等机制暂不参与计算。详见 `docs/最终方案.md`。

## 状态

v0.1 核心已跑通(开发版,`npm run dev` 可本地体验):

- **模拟引擎**:解包物理模型(跑法×阶段系数、末脚体力预算解算、体力/温存、上坡减速、起步放缓段),校准达标——无技能东京草2400 实算 **116.724s**(游戏实录参考 116.987s,偏差 0.26s)
- **数据**:全量技能 1815 条(精确 61/近似 1416/不支持 338,另含继承固有 383 条;进化技能按范围排除)+ 全量赛道 138 条/17 赛场,zod 校验通过
- **界面**:配置面板(属性/适性/跑法/赛道/技能搜索点选)、赛道条(弯道/坡度/阶段/发动点/体力归零点)、速度+体力双曲线(uPlot)、每技能马身收益表(leave-one-out 消融)
- 未完成(见 docs/最终方案.md v0.2 路线):绿技能前提值计入、干劲乘数表、URL 分享、蒙样等

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
- 赛道数据:开源解包数据集
- 公式来源与校准状态:见 `docs/formulas.md`

## 免责声明

本项目为非官方同人工具,与 Cygames / bilibili 无关。《赛马娘 Pretty Derby》名称与相关商标归各权利方所有。数值仅作育成参考,与游戏实际表现可能存在差异。

## 许可证

[GPL-3.0](./LICENSE)
