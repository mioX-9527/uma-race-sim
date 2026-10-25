// 构建后处理:单文件 dist/index.html 的内联 <script type="module" crossorigin> 降级为
// 经典 <script>(bundle 已确认无 import.meta / 动态 import),并整体挪到 </body> 前——
// 经典脚本立即执行,module 脚本延迟执行,留在 <head> 会因 #root 尚未渲染而白屏。
// 注意:必须用 lastIndexOf 锚定文档结尾——压缩 bundle 内部可能含 "</body>" 字面量,
// replace 首个匹配会把脚本插进代码中间导致 SyntaxError(已踩坑)。
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../apps/web/dist/index.html', import.meta.url);
let html = readFileSync(path, 'utf8');

const tag = '<script type="module" crossorigin>';
const start = html.indexOf(tag);
if (start < 0) {
  console.error('未找到 module 内联脚本标签,不做修改(可能已处理过)');
  process.exit(0);
}
const bodyStart = start + tag.length;
const end = html.indexOf('</script>', bodyStart);
if (end < 0) {
  console.error('找不到脚本结束标签,文件结构异常');
  process.exit(1);
}
const script = html.slice(bodyStart, end);
// 从原位置(head 内)整体移除
html = html.slice(0, start) + html.slice(end + '</script>'.length);
// 插到最后一个 </body> 前(文档真正的结尾)
const insertAt = html.lastIndexOf('</body>');
if (insertAt < 0) {
  console.error('找不到 </body>,文件结构异常');
  process.exit(1);
}
html = html.slice(0, insertAt) + `<script>${script}</script>\n` + html.slice(insertAt);
writeFileSync(path, html);
// 项目根目录放一份醒目副本,避免误开 apps/web/index.html(那是 dev 专用壳,双击空白)
writeFileSync(new URL('../打开模拟器.html', import.meta.url), html);
console.log('dist/index.html:经典 <script> 已置于 </body> 前(file:// 双击可用);副本 → 打开模拟器.html');
