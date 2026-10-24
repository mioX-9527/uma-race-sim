import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';

interface Props {
  x: Float64Array;
  v: Float64Array;
  hpPct: Float64Array;
}

/** 速度 + 剩余体力 双轴曲线(横轴=距离) */
export function Chart({ x, v, hpPct }: Props): JSX.Element {
  const elRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
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
    if (!el || width < 100) return;
    const opts: uPlot.Options = {
      width,
      height: 280,
      title: '速度 / 剩余体力 — 距离',
      cursor: { drag: { x: false, y: false } },
      legend: { live: true },
      series: [
        { label: '距离 m' },
        {
          label: '速度 m/s',
          scale: 'v',
          stroke: '#4da3ff',
          width: 2,
          value: (u, v) => (v == null ? '--' : `${v.toFixed(2)} m/s`),
        },
        {
          label: '剩余体力 %',
          scale: 'pct',
          stroke: '#ffd24d',
          width: 1.5,
          dash: [5, 4],
          value: (u, v) => (v == null ? '--' : `${v.toFixed(1)} %`),
        },
      ],
      axes: [
        { label: 'm' },
        { scale: 'v', label: 'm/s', values: (u, vals) => vals.map(v => v.toFixed(0)) },
        { scale: 'pct', label: '%', side: 1, values: (u, vals) => vals.map(v => `${v.toFixed(0)}%`) },
      ],
      scales: {
        x: { min: 0, max: x[x.length - 1] ?? 1 },
        v: { range: (u, min, max) => [Math.floor(min - 0.5), Math.ceil(max + 0.5)] as [number, number] },
        pct: { range: [0, 105] as [number, number] },
      },
    };
    const data = [Array.from(x), Array.from(v), Array.from(hpPct)] as unknown as uPlot.AlignedData;
    const u = new uPlot(opts, data, el);
    return () => u.destroy();
  }, [width, x, v, hpPct]);

  return (
    <div ref={wrapRef}>
      <div ref={elRef} />
    </div>
  );
}
