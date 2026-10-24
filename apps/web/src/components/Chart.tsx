import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface Props {
  x: Float64Array;
  v: Float64Array;
  hpPct: Float64Array;
}

/** 悬浮提示:显示当前位置的速度与体力具体数值 */
function makeTooltipPlugin(getEl: () => HTMLDivElement): uPlot.Plugin {
  return {
    hooks: {
      init(u) {
        u.over.appendChild(getEl());
      },
      setCursor(u) {
        const el = getEl();
        const cursor = u.cursor as unknown as { idx: number | null; left: number; top: number };
        if (cursor.idx == null) {
          el.style.display = 'none';
          return;
        }
        const idx = cursor.idx;
        const x = u.data[0]![idx] as number;
        const v = u.data[1]![idx] as number;
        const pct = u.data[2]![idx] as number;
        el.style.display = 'block';
        el.style.left = `${Math.min(cursor.left + 14, u.width - 190)}px`;
        el.style.top = `${Math.max(cursor.top - 36, 4)}px`;
        el.textContent = `${Math.round(x)}m · 速度 ${v.toFixed(2)} m/s · 体力 ${pct.toFixed(1)}%`;
      },
    },
  };
}

/** 速度 + 剩余体力 双轴曲线(横轴=距离),悬浮显示具体数值 */
export function Chart({ x, v, hpPct }: Props): JSX.Element {
  const elRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = elRef.current;
    const tip = tipRef.current;
    if (!el || !tip || width < 100) return;
    const opts: uPlot.Options = {
      width,
      height: 280,
      title: '速度 / 剩余体力 — 距离(悬浮查看数值)',
      cursor: { drag: { x: false, y: false } },
      plugins: [makeTooltipPlugin(() => tip)],
      series: [
        { label: '距离 m' },
        {
          label: '速度 m/s',
          scale: 'v',
          stroke: '#2563eb',
          width: 2,
          value: (u, v) => (v == null ? '--' : `${v.toFixed(2)} m/s`),
        },
        {
          label: '剩余体力 %',
          scale: 'pct',
          stroke: '#d97706',
          width: 1.5,
          dash: [5, 4],
          value: (u, v) => (v == null ? '--' : `${v.toFixed(1)} %`),
        },
      ],
      axes: [
        { label: 'm', stroke: '#6b7280', grid: { stroke: '#e5e7eb' }, ticks: { stroke: '#e5e7eb' } },
        { scale: 'v', label: 'm/s', stroke: '#2563eb', grid: { show: false }, ticks: { stroke: '#e5e7eb' } },
        { scale: 'pct', label: '%', side: 1, stroke: '#d97706', grid: { show: false }, ticks: { stroke: '#e5e7eb' } },
      ],
      scales: {
        x: { min: 0, max: x[x.length - 1] ?? 1 },
        v: { range: (u, min, max) => [Math.floor(min - 0.5), Math.ceil(max + 0.5)] as [number, number] },
        pct: { range: [0, 105] as [number, number] },
      },
    };
    const data = [Array.from(x), Array.from(v), Array.from(hpPct)] as unknown as uPlot.AlignedData;
    const u = new uPlot(opts, data, el);
    return () => {
      u.destroy();
      if (tip.parentElement === el) el.removeChild(tip);
    };
  }, [width, x, v, hpPct]);

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <div ref={elRef} />
      <div className="chart-tooltip" ref={tipRef} />
    </div>
  );
}
