# uma-race-sim · 赛马娘国服赛道模拟器

开源的赛马娘(国服)网页版赛道模拟工具:

- **技能发动位置**——在赛道条上直观标出每个技能在哪条弯道/哪个阶段/哪一米发动
- **速度与体力曲线**——全程逐帧(30fps)速度曲线 + 剩余体力曲线,标记体力归零(温存)点
- **每技能马身收益**——leave-one-out 消融,列出每个技能贡献的马身差/时间差

> v0.1 采用单马确定性期望模型:依赖其他马娘的条件按期望近似(UI 显式标注);多马阻挡/焦躁/追比等机制暂不参与计算。详见 `docs/最终方案.md`。

## 状态

开发中(WIP)。当前完成:monorepo 骨架、模拟引擎核心(阶段机/速度/体力/帧积分)、技能效果与精确层发动条件、消融分析、CI。校准(东京草2400=116.987s±0.5s 基准)与真实赛道/技能数据待 D2 数据日注入,见 `docs/formulas.md` 的 TODO(calibration) 清单。

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

- 技能数据:BWIKI 技能速查表一次性抓取生成;后续新技能手动更新(zod 校验把关)
- 赛道数据:开源解包数据集为主源,BWIKI 核对
- 公式来源与校准状态:见 `docs/formulas.md`;第三方引用:见 `THIRD_PARTY.md`

## 免责声明

本项目为非官方同人工具,与 Cygames / bilibili 无关。《赛马娘 Pretty Derby》名称与相关商标归各权利方所有。数值仅作育成参考,与游戏实际表现可能存在差异。

## 许可证

[GPL-3.0](./LICENSE)
