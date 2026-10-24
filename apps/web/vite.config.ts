import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { defineConfig } from 'vite';

// 单文件构建:JS/CSS 全部内联。构建后由 tools/make-classic-html.mjs 把内联的
// <script type="module"> 降级为经典 <script>(产物无 import.meta/动态 import),
// 保证双击 dist/index.html(file://)在所有浏览器策略下都能执行。
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
});
