/**
 * 工程占位页:主视图(赛道条 + 速度/体力双曲线 + 技能发动标记 + 消融收益表)
 * 在 D7~D8 实现,见 docs/最终方案.md §7。
 */
export function App(): JSX.Element {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>uma-race-sim</h1>
      <p>赛马娘国服赛道模拟器(开发中)</p>
      <ul>
        <li>引擎与消融分析:packages/engine、packages/analysis(已实现,见 npm test)</li>
        <li>主视图(赛道条 / 双曲线 / 马身收益表):D7~D8 实现</li>
        <li>数据(D2~D3)与校准(D7~D8):见 docs/formulas.md</li>
      </ul>
    </main>
  );
}
