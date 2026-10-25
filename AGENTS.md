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
   触发代码里的**发动前提**解析为 `SkillPrereq`(与装配限制分开):`activate_count_all/start/middle/later_half/end_after/heal/
   param_skill`、`succession_skill_count`、`is_activate_any_skill`、`is_activate_heal_skill`、`is_used_skill_id(±with_detail_one)`、
   `is_exist_skill_id`、`is_activate_other_skill_detail`(=`-b2` 依赖 `-b1`)。
   这些 token **不能**再落进 `APPROX_NAME_RE` 被静默丢掉 —— 那会让「需回复技能≥3」的技能直接发动(2026-10-25 修)。
   只有前提、没有位置锚点的技能,数据侧按前提统计范围重建可发动区间(start→序盘、middle→中盘、laterHalf→50%~终点、
   endAfter→终盘起、其余→全程);否则只会在起跑帧判一次,永不发动。
   触发代码里的**装配限制**统一解析为 `SkillRestriction`(脚质/距离档/**标准距离 is_basis_distance**/场地/赛场/
   精确距离与范围/**场地状态(含 !=、>=、<=)**/回转方向 rotation/天气 weather/季节 season/**干劲 motivation**/
   **海外 is_abroad**/**面板属性 base_speed 等**)——不满足则整场不生效(绿技能不计入起跑属性)。
   环境类缺省口径:场地状态 良(0)、天气 晴(1)、季节 春(1)。
   ⚠ **`is_basis_distance` 不是距离档**:1 = 赛程全长为 **400 米整数倍**(标准距离/根干距离),0 = 非倍数;
   与「短/英里/中/长」互相穿插(1600 属英里但为倍数、2500 属长距离但非倍数)。存为 `restriction.basisDistance` 布尔,
   引擎判 `course.distance % 400 === 0`。**按中文技能名猜语义会全反**(2026-10-25 实际发生过,见 parity-log 二次勘误)。
   **语义分层(改 clean-skills 必读)**:同一支(`&`)= 与,同字段多次出现取**交集**(`putSet`);
   **`@` 分隔的变体 = 或**,每支单独成子句,输出 `restriction.anyOf`(任一满足即生效);
   `precondition_N`(前提)与 `condition_N`(发动条件)= 与;`condition_1`/`condition_2` 是两组独立效果块(拆 -b1/-b2),
   **不是**同一技能的或分支。
   只有真正异构的分支才留 `anyOf`;单字段差异会被 `simplifyClauseObjs` 化简回扁平结构
   ((A∧X)∨(A∧Y) ≡ A∧(X∨Y)),被支配的子句由 `dropDominated` 剔除。
   **不要退回「一层并集」**:那会把「A 支限短距离、B 支不限」压成「限短距离」,全库约 400 条技能会错。
4. **赛道**:uma-skill-tools 的 course_data.json → `tools/make-courses.ts` → `data/courses.json`(弯道/直线/坡度/门槛属性/**回转方向**)。
   **回转方向直接读解包 `turn`:1=右回り(顺时针)、2=左回り(逆时针)、4=直線(不写 rotation 字段 ⇒ 回转类技能不生效)**;
   别再手写赛场映射表(2026-10-25 曾因此把阪神/札幌/函馆/福岛/小仓 44 条赛道标反,见 parity-log)。
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
npm test            # engine + analysis 全部 vitest(当前 126 例)
npm run typecheck   # 四包 tsc(engine/analysis/schema/web;web 2026-10-25 纳入)
node tools/validate-data.ts   # 数据 zod 校验
node tools/clean-skills.ts    # 重新生成 skills.json(node 24 直跑 TS)
```

## 4. 构建/打开方式(file:// 专项,勿动)

- `vite-plugin-singlefile` 把 JS/CSS 全内联;`tools/make-classic-html.mjs`(挂在 build 脚本尾部)把内联
  `<script type="module">` **降级为经典 `<script>` 并挪到 `</body>` 前**。
  原因:①部分浏览器 file:// 不执行 module 脚本;②经典脚本立即执行,留在 head 会因 #root 未渲染白屏。
  产物已确认无 import.meta/动态 import,降级安全——**改构建配置前想清楚,别把这两步去掉**。
  ⚠️ 插入位置必须用 `lastIndexOf('</body>')`——压缩 bundle 内部可能含 `"</body>"` 字面量,
  `replace` 首个匹配会把脚本插进代码中间导致 SyntaxError(已踩坑)。
- `apps/web/index.html` 是 dev 专用壳,双击空白是正常的;对外入口是 dist/index.html 与根目录
  `打开模拟器.html`、`启动模拟器.bat`(ASCII 内容 + %~dp0 相对路径,勿改成中文路径)。
- **赛道条与曲线图的对齐/联动机制**(改 TrackBar/Chart 前必读):赛道条画布用 margin/width
  实时锚定 `.chart-wrap .u-under` 的 DOM 几何(缩放/改窗口下逐像素对齐);Chart 的 onPlotArea 上报
  仅作"重新测量"触发器——图表挂载/重建时赛道条自身感知不到,**没有这个触发器首屏就错位**。
  两图悬停联动经 App 的 hoverMeter 状态中转:任一图悬停 → 另一图显示同距离数据
  (Chart 用 u.setCursor 吸附最近数据点并弹 tooltip,TrackBar 画虚线 + tooltip)。
- **位置采样与联合蒙特卡洛消融(方案二)**:触发代码含 `*_random` 的技能带 `randomPosition` 标记
  (1118 条),其发动位置在满足区段内随机,规则取位(进区段即发动)只是随机的一个实现。
  `ablate()` 两层处理(读 `packages/analysis/src/ablate.ts` 头注释再改):
  ① 逐位置明细:满足区段全长(引擎 `sampleableSpans`)均匀取 7 点,经
     `SimOptions.positionOverrides`(skillId → 米)强制发动后分别消融——展示"位置不同收益不同";
  ② 联合蒙特卡洛期望:全部随机位置技能的发动点做联合拉丁超立方抽样(确定性可复现,
     组数按技能数自适应 8~24),每组下跑全技能与逐技能 leave-one-out——
     行级 expectedBody / 表尾 Σ与总收益的期望口径(±95%CI)均来自联合随机环境。
  仅统计规则下确实发动的随机技能(装配限制不符的不采样);名次类条件(order_rate 等)
  依赖名次状态,不可枚举,维持规则取位。

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
- **环境三件套(2026-10-25 核实)**:场地状态**只进体力消耗系数**(草 良/稍重 1.0、重/不良 1.02;
  泥 良/稍重 1.0、重 1.01、不良 1.02),不改速度/加速度/体力上限 —— 所以「耐力判定」会变而完赛时间不变;
  **天气与季节没有任何物理项**(解包与 614tools 都没有),只决定 `weather==N` / `season==N` 类技能是否生效。
  三者都是 `SkillRestriction` 字段,不满足时技能整场不生效,UI 标注「不生效」。
- **消融口径(2026-10-25 改)**:`ablate` 的逐技能收益是「**只去掉效果、保留发动**」(`SimOptions.inertSkills`),
  不是从牌组删掉 —— 否则「需回复技能≥3」这类前提会让每个回复技能都背上大招的收益,同一份收益重复计 N 次。
  「从牌组删掉会连带失去谁」用 `AblationRow.dependentIds`(UI「被依赖 N」角标),
  只认 `usedSkillBaseIds` / `requiresFirstBlock`;`ownedSkillBaseIds` 是持有即满足,不算依赖。
  **`inertSkills` 必须贯穿全部属性入口**(effstats / speed / stamina / simulate 的绿加成与门槛),
  否则绿技能消融会得到 delta=0(踩过:speed.ts 的 effectiveStatsOf 漏传 inert)。
- **发动前提(2026-10-25)**:`SkillConfig.prereq` 由 `packages/engine/src/prereq.ts` 的 `prereqSatisfied` 判定,
  计数来源是 `simulate` 里维护的 `fired` 发动史(id / 阶段 / 位置 / 是否回复):
  `all`=总数、`start`=序盘、`middle`=中盘、`laterHalf`=行进≥50%、`endAfter`=终盘起、`heal`=含回复类效果、
  `green`=当前赛道生效的绿技能数、`heir`=牌组里 `uniqueHeir` 数量。
  前提不满足是「本帧不发动、后续帧继续判」,不是「整场禁用」;消融的位置采样强制发动也要过前提。
  带前提的**常时被动**不并入起跑属性(加成在比赛中段才成立),数据侧标不支持。
  尚未建模:`activate_count_all_team`(队伍)、`is_activate_other_character_*`(他马)、`running_style_count_*`(他马跑法统计)。
- **限制判定入口**:`packages/engine/src/restriction.ts` 的 `clauseSatisfied`(单子句,字段间为与)与
  `restrictionSatisfied`(有 `anyOf` 时任一子句满足即可)。`skillApplicable()` 供 UI/消融判断「不生效」。
  `base_*` 属性条件取**面板值**(`runner.stats`),不含绿技能与干劲。
- 继承固有与本体数值不同(负面分支不变、增益段削减);进化与本体二选一。
- 精度分层:precise / approx(依赖名次/随机,按期望位置发动)/ unsupported(不参与模拟,灰显)。
- 校准双锚:courseFix=1.2 ↔ 历史互拍 116.328±0.1;auto(东京无门槛)↔ 游戏实录 116.987±0.5。
  **改引擎前后都要跑 `npx vitest run`,基准测试不许静默放宽容差**(放宽须在 parity-log 记录原因)。

## 7. 改动后必做清单

1. `npm run typecheck`(含 web)+ `npx vitest run` 全绿(不许跳过/删测试);
   本机若遇 vitest `EPERM ...\Temp\...\ssr\...`,把 TEMP/TMP 指到项目内再跑:
   `TEMP=%CD%\.tmp TMP=%CD%\.tmp npx vitest run`(沙箱不放行系统临时目录时);
2. 涉及数据:`node tools/validate-data.ts`;
3. 涉及公式/机制:更新 `docs/formulas.md` + `docs/parity-log.md` 追加条目(对拍方法:614tools 实测或游戏实录);
4. 涉及数据规模:同步 `data/version.json`(version/counts/skillPrecision/notes)与 README「状态」行;
5. `npm run build` 后用静态服务(preview)冒烟:完赛时间 116.72s(东京默认配置)、技能搜索/耐力判定正常;
6. UI 文案不得出现外部工具名(历史遗留见 git;开发档案 docs/ 不受限)。

## 8. 已知边界与待办

### 既有边界

- 绿技能(常时被动)已支持:clean-skills 对 raceStart 条件的纯被动标 precise(条件型被动
  仍 unsupported),引擎 `effstats.passiveBonusOf(runner, course)` 把已选绿技能与手动 greenBonus 并入起跑属性
  (614tools ZP 口径:面板+绿逐项相加后统一过软上限与干劲;例外:耐力对决参照 sfRef 中绿不吃干劲);
  **带装配限制的绿技能按 course + 环境配置判定**(157/213 条,如「东京赛场◎」「良场地◎」「顺时针◎」「秋季优俊少女◎」),
  不匹配则不计入;消融表绿技能行 位置=「常时」,收益来自去掉它后的属性差;
  **不满足限制的技能在技能列表/消融表标「不生效」**(AblationRow.applicable=false,收益恒 0)。
  调用链务必传 course:`effectiveStatsOf` / `courseFixOf` / `passiveBonusOf` / `gutsDrainModifier`
  —— 传 undefined 会把带限制的绿技能当成不生效(2026-10-25 踩过,当时 164 条带限制绿技能全部归零);
- 随机机制不建模:焦躁/追比/取位争夺/多马阻挡/下坡模式/智力 24 区间修正(614tools 也仅显示);
  天气/季节虽可选,但除技能条件外不参与任何计算(见 §6);场地状态参与体力消耗;
- 仍未建模的触发代码 token(单马模型无法判断,按满足处理并记入 `data/skill-notes.json`):
  `popularity`/`post_number`/`fan_count`/`grade`(100=G1)/`is_dirtgrade`(交流重赏)/`lane_type`/`furlong`/`time`/
  `activate_count_all_team`/`is_activate_other_character_activate_advantage_skill`/`running_style_count_*`/
  `visiblehorse`/`random_lot(_shared)`/`succession_skill_count`/`is_exist_chara_id`/`is_move_lane`/
  `remain_distance_viewer_id`。要新增建模时:clean-skills 加 token 分支 → types/schema 加字段 →
  restriction.ts 判定 → 文档表格同步(清单见 docs/formulas.md「仍未建模」行);
  **新增映射前必须先找到语义出处**(BWIKI 技能页「触发条件」原文 / 解包字段 / 与技能名可自证的等价物),
  禁止按中文技能名推测(「标准距离」并不等于中长距离);`is_tight_track`(小回り)无需建模 ——
  触发条文明文列出 6 场比赛(札幌/函馆/福岛/小仓/川崎/船桥),文本侧已落成 `venues`;
  近似层技能按"期望位置"发动,已在 UI 角标;
- 47 条剧本型"进化"行无解包数据,维持排除(skill-data-lua2 里 25 条无名称的占位条目同样不入库);
- 复核清单 `data/skill-review.json`(约 190 条)与 `data/skill-notes.json`
  (前置条件原文)供人工抽查;
- 待办候选:URL 分享参数、本体↔进化二选一联动去重、多马对比模式、部署 GitHub Pages。
- 测试断言依赖 data/skills.json 的具体条目(heir.test/evo.test 有锚点样例);重跑 clean-skills 后若
  这些测试红,先核数据是否真变,再改断言,并在 commit 里说明。
