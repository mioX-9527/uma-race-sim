/**
 * 一次性抓取脚本:BWIKI 技能速查表 → data/raw/skills.raw.json(再经清洗进 data/skills.json)。
 *
 * 用法(需已 npm install;或用便携 node 直接运行):
 *   node tools/scrape-once.ts            # 在线抓取(分 4 页,offset 0/500/1000/1500)
 *   node tools/scrape-once.ts --inbox    # 人工兜底:读 tools/inbox/ 下另存的页面源码
 *
 * 要点(见 docs/最终方案.md §5):
 *   1. 技能速查表的数据由服务端渲染进页面隐藏 div(class="jn-json-part"),请求 HTML 源码后解析即可;
 *   2. BWIKI 有 EdgeOne 防护:限速 1 请求/2~3s + 指数退避;连续 403/567 时改走 --inbox 人工导出;
 *   3. 抓取产物须带 fetchedAt 与来源;清洗时用 tools/condition-map.json 做条件文本→枚举映射;
 *   4. 生成后跑 packages/schema 校验,再人工抽查复核清单。
 *
 * TODO(D2~D3): 实现本脚本(fetch + 正则/文本切分 jn-json-part + 去重),
 * 本文件当前仅存放执行说明与流程占位。
 */
async function main(): Promise<void> {
  console.log('scrape-once:尚未实现(D2~D3 数据日),流程见文件头注释与 docs/最终方案.md §5。');
}

void main();
