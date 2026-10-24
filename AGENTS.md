# AGENTS.md — 开发与维护指南(供接手的开发者/AI agent 阅读)

> 本文件是项目的"交接文档":架构、数据管线、环境坑、验证习惯、待办事项。
> 修改本项目前先通读;做完改动按"改动后必做清单"收尾。公式细节见 `docs/formulas.md`,
> 校准与勘误史见 `docs/parity-log.md`(两者是方法学权威,改动公式必须同步更新)。

## 1. 项目是什么

赛马娘(国服)开源单马赛道模拟器(GPL-3.0):技能发动位置标注、速度/体力曲线、每技能马身收益。
纯前端静态站,无后端。非官方同人工具。

## 2. 结构与数据流

```
packages/engine    模拟引擎(纯函数):simulate(course, runner, opts) → 逐帧结果(export 自 src/index.ts)
packages/analysis  消融分析:ablate() → 每技能马身收益(leave-one-out)
packages/schema    zod schema;校验入口 tools/validate-data.ts(node 直跑)
apps/web           React + uPlot + Canvas 前端;vite 单文件构建
data               courses.json / skills.json / skill-review.json / skill-notes.json / version.json(全部入库)
data/raw           原始抓取物(gitignored,可用 tools/ 下脚本重新生成)
docs               formulas.md(公式权威)/ parity-log.md(对拍与勘误史)/ 最终方案.md(设计)
tools              抓取/清洗/构建后处理脚本(见下表)
```

### 数据管线(更新数据时按此顺序)

1. **技能**:BWIKI 速查表 → `tools/scrape-once.ts` → `data/raw/skills.raw.json`(行 = 技能页,ID/名称/中文文本);
   国服官方译名 → `tools/scrape-cn-names.js` → `data/raw/cn-skill-names.json`(map[id] = 简中名,有 = cnReleased)。
2. **解包触发代码**:`模块:技能数据库内容` → `tools/parse-skill-lua.js` → `data/raw/skill-data-lua.json`(1271 条,本体技能);
   `模块:技能数据库内容2` → `tools/parse-skill-lua2.js` → `data/raw/skill-data-lua2.json`(271 继承技 900xxx + 658 进化 1M+)。
   继承技三语名称:`tools/fetch-heir-names.mjs` → `data/raw/heir-skill-names.json`。
3. **清洗**:`node tools/clean-skills.ts` → `data/skills.json`(+ review/notes)。这是唯一生成 skills.json 的入口,
   三条路径:①触发代码(权威,先 precondition 后 condition,@ = 或变体);②继承技 pass(见下);③文本兜底(仅 2 条)。
4. **赛道**:uma-skill-tools 的 course_data.json → `tools/make-courses.ts` → `data/courses.json`(弯道/直线/坡度/门槛属性)。
5. **校验**:`node tools/validate-data.ts` 必须通过,再跑 `npx vitest run`。

### 技能 ID 约定(字符串)

- 本体固有:6 位 `100xxx`~`199xxx`;普通/レア:6 位 `2xxxxx`/`4xxxxx` 等
- 继承固有 = 本体 ID + 800000(900xxx 段),rarity `uniqueHeir`,名称「XXX(继承)」,等级系数恒 1.0
- 进化 = 1M+ 大数字,rarity `evolved`,与本体二选一(模拟时并列两条,未做联动去重)
- 固有/继承/进化的双分支拆为 `-b1`/`-b2` 后缀
- rarity → 智力增幅等级系数:见 `packages/engine/src/constants.ts` RARITY_LEVEL_FACTOR(normal=0 不增幅)

## 3. 常用命令

```bash
npm run dev         # 开发服务 http://localhost:5173(热更)
npm run build       # 单文件构建:apps/web/dist/index.html + 根目录 打开模拟器.html
npm test            # engine + analysis 全部 vitest(当前 82 例)
npm run typecheck   # 三包 tsc
node tools/validate-data.ts   # 数据 zod 校验
node tools/clean-skills.ts    # 重新生成 skills.json(node 24 直跑 TS)
```

## 4. 构建/打开方式(file:// 专项,勿动)

- `vite-plugin-singlefile` 把 JS/CSS 全内联;`tools/make-classic-html.mjs`(挂在 build 脚本尾部)把内联
  `<script type="module">` **降级为经典 `<script>` 并挪到 `</body>` 前**。
  原因:①部分浏览器 file:// 不执行 module 脚本;②经典脚本立即执行,留在 head 会因 #root 未渲染白屏。
  产物已确认无 import.meta/动态 import,降级安全——**改构建配置前想清楚,别把这两步去掉**。
- `apps/web/index.html` 是 dev 专用壳,双击空白是正常的;对外入口是 dist/index.html 与根目录
  `打开模拟器.html`、`启动模拟器.bat`(ASCII 内容 + %~dp0 相对路径,勿改成中文路径)。

## 5. 本机环境坑(Windows + cmd,踩过的都在这)

- shell 是 cmd:grep/tail/head/rm/sleep 不在 PATH。每个命令前
  `set "PATH=C:\Program Files\Git\usr\bin;C:\Program Files\Git\cmd;C:\Program Files\nodejs;%PATH%"`。
- **禁止 `node -e "..."` 跑含中文/括号/引号的脚本**:cmd 会把片段重定向成垃圾文件(workspace 根目录
  曾生成过 `(const`、`x.venue` 等)。要跑内联逻辑就写临时 `.mjs` 文件,用完删。
- 没有 tsx;TS 工具用 `node tools/xxx.ts`(node 24 原生 strip types)。
- git/npm 偶发"不是内部或外部命令"= PATH 丢失,按上面重设即可。
- **vite dev 的文件监听在本机多次失灵**:改了代码页面不更新时,先
  `curl -s http://localhost:5173/src/xxx.ts | grep 关键字` 验证服务端是否陈旧;陈旧就 netstat 找 PID →
  `taskkill /PID x /T /F` 重启,并让用户 Ctrl+F5。后台 start /b 起的服务用完记得杀(5173 dev / 4173 preview),
  否则日志文件被占用删不掉。
- 中文文件名经 bash 显示可能乱码,是显示问题;验证真实名称用 PowerShell `Get-ChildItem`。
- 日志放项目根目录(vite-dev.log);gitignore 已含 `*.log`、`data/raw/`。

## 6. 引擎语义速查(细节以 docs/formulas.md 为准)

- 有效属性 = 软上限(1200+(s−1200)/2)× 干劲;**速度再 × 赛道补正**——默认 'auto':
  按赛道门槛属性 courseSetStatus 计算(1 + 平均((1+floor(min(属性,901)/300.01))×0.05)),空门槛(52 条)→ ×1.0;
  数字 = 手动覆盖。补正只乘速度,不乘力量/根性/耐力。
- 冷却实际 = 基准 × 距离/1000;<400s 可重复发动,500s = 一次性。
- 「直線」类条件以解包 straights 列表为准(28/138 赛道有非直非弯的过渡区,琥珀色斜纹)。
- 继承固有与本体数值不同(负面分支不变、增益段削减);进化与本体二选一。
- 精度分层:precise / approx(依赖名次/随机,按期望位置发动)/ unsupported(不参与模拟,灰显)。
- 校准双锚:courseFix=1.2 ↔ 历史互拍 116.328±0.1;auto(东京无门槛)↔ 游戏实录 116.987±0.5。
  **改引擎前后都要跑 `npx vitest run`,基准测试不许静默放宽容差**(放宽须在 parity-log 记录原因)。

## 7. 改动后必做清单

1. `npm run typecheck` + `npx vitest run` 全绿(不许跳过/删测试);
2. 涉及数据:`node tools/validate-data.ts`;
3. 涉及公式/机制:更新 `docs/formulas.md` + `docs/parity-log.md` 追加条目(对拍方法:614tools 实测或游戏实录);
4. 涉及数据规模:同步 `data/version.json`(version/counts/skillPrecision/notes)与 README「状态」行;
5. `npm run build` 后用静态服务(preview)冒烟:完赛时间 116.72s(东京默认配置)、技能搜索/耐力判定正常;
6. UI 文案不得出现外部工具名(历史遗留见 git;开发档案 docs/ 不受限)。

## 8. 已知边界与待办

- 绿技能(前提值)未计入比赛过程(绿字段 greenBonus 结构已预留,UI 标注"待 v0.2");
- 随机机制不建模:焦躁/追比/取位争夺/多马阻挡/下坡模式/智力 24 区间修正(614tools 也仅显示);
  近似层技能按"期望位置"发动,已在 UI 角标;
- 47 条剧本型"进化"行无解包数据,维持排除(skill-data-lua2 里 25 条无名称的占位条目同样不入库);
- 复核清单 `data/skill-review.json`(约 330 条,多为 unsupported/纯被动)与 `data/skill-notes.json`
  (前置条件原文)供人工抽查;
- 待办候选:绿技能计入、URL 分享参数、本体↔进化二选一联动去重、多马对比模式、部署 GitHub Pages。
- 测试断言依赖 data/skills.json 的具体条目(heir.test/evo.test 有锚点样例);重跑 clean-skills 后若
  这些测试红,先核数据是否真变,再改断言,并在 commit 里说明。
