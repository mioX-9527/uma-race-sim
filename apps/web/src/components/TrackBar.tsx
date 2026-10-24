import { useEffect, useRef, useState } from 'react';
import type { Activation, Course } from '@uma-race-sim/engine';

interface Props {
  course: Course;
  activations: readonly Activation[];
  exhaustedAtMeter: number | null;
}

const H = 96;

/** 赛道条:弯道/坡度/阶段分界/技能发动点/体力归零点 */
export function TrackBar({ course, activations, exhaustedAtMeter }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const D = course.distance;
    const padL = 14;
    const padR = 14;
    const px = (m: number): number => padL + (m / D) * (width - padL - padR);
    const meterAt = (x: number): number => ((x - padL) / (width - padL - padR)) * D;

    ctx.clearRect(0, 0, width, H);
    ctx.font = '10px system-ui';

    // 主轨道
    ctx.strokeStyle = '#3a465e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px(0), 44);
    ctx.lineTo(px(D), 44);
    ctx.stroke();

    // 坡道带(上坡红/下坡蓝)
    for (const s of course.slopes) {
      ctx.fillStyle = s.gradient > 0 ? '#d6454522' : '#3d8bfd22';
      ctx.fillRect(px(s.start), 54, px(s.end) - px(s.start), 10);
      ctx.fillStyle = s.gradient > 0 ? '#d6454599' : '#3d8bfd99';
      ctx.fillText(`${s.gradient > 0 ? '上' : '下'}${Math.abs(s.gradient)}%`, px(s.start) + 2, 72);
    }

    // 弯道
    ctx.fillStyle = '#52607d';
    for (const c of course.corners) {
      ctx.fillRect(px(c.start), 37, Math.max(px(c.end) - px(c.start), 2), 14);
      ctx.fillStyle = '#8794ab';
      ctx.fillText(`${c.n}`, (px(c.start) + px(c.end)) / 2 - 3, 34);
      ctx.fillStyle = '#52607d';
    }

    // 阶段分界
    const b = course.phaseBounds;
    const phases: Array<[number, number, string]> = [
      [0, b.midStart, '序盘'],
      [b.midStart, b.lateStart, '中盘'],
      [b.lateStart, b.finalStart, '终盘'],
      [b.finalStart, D, '末脚'],
    ];
    ctx.strokeStyle = '#2a3448';
    ctx.setLineDash([3, 3]);
    for (const [s, e] of phases) {
      if (s > 0) {
        ctx.beginPath();
        ctx.moveTo(px(s), 8);
        ctx.lineTo(px(s), 78);
        ctx.stroke();
      }
      ctx.fillStyle = '#8794ab';
      const label = phases.find(p => p[0] === s)?.[2];
      if (label !== undefined) ctx.fillText(label, (px(s) + px(e)) / 2 - 8, 12);
    }
    ctx.setLineDash([]);

    // 体力归零点
    if (exhaustedAtMeter !== null) {
      ctx.strokeStyle = '#dc2626';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(px(exhaustedAtMeter), 16);
      ctx.lineTo(px(exhaustedAtMeter), 80);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#dc2626';
      ctx.fillText('体力归零', px(exhaustedAtMeter) - 18, 88);
    }

    // 技能发动点
    activations.forEach((a, i) => {
      const x = px(a.atMeter);
      ctx.strokeStyle = a.precision === 'approx' ? '#d97706' : '#2563eb';
      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x, 52);
      ctx.stroke();
      ctx.fillStyle = a.precision === 'approx' ? '#d97706' : '#2563eb';
      ctx.beginPath();
      ctx.arc(x, 17, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${i + 1}`, x - 2, 20.5);
    });

    // 悬停
    const onMove = (ev: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const m = Math.max(0, Math.min(D, meterAt(mx)));
      const corner = course.corners.find(c => m >= c.start && m <= c.end);
      const slope = course.slopes.find(s => m >= s.start && m <= s.end);
      const phase = m >= b.finalStart ? '末脚' : m >= b.lateStart ? '终盘' : m >= b.midStart ? '中盘' : '序盘';
      const parts = [`${Math.round(m)}m · ${phase}`];
      if (corner !== undefined) parts.push(`弯道${corner.n}`);
      if (slope !== undefined) parts.push(`${slope.gradient > 0 ? '上' : '下'}坡 ${slope.gradient}%`);
      const act = activations.find(a => Math.abs(a.atMeter - m) < D / 200);
      if (act !== undefined) parts.push(`技能发动: ${act.name}`);
      const tip = tipRef.current;
      if (tip !== null) {
        tip.style.display = 'block';
        tip.style.left = `${Math.min(mx + 12, width - 170)}px`;
        tip.style.top = '6px';
        tip.textContent = parts.join(' · ');
      }
    };
    const onLeave = (): void => {
      if (tipRef.current !== null) tipRef.current.style.display = 'none';
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [width, course, activations, exhaustedAtMeter]);

  return (
    <div className="track-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <div className="track-tooltip" ref={tipRef} />
      <div className="legend">
        <span><i className="k" style={{ background: '#52607d' }} />弯道</span>
        <span><i className="k" style={{ background: '#d6454566' }} />上坡</span>
        <span><i className="k" style={{ background: '#3d8bfd66' }} />下坡</span>
        <span><i className="k" style={{ background: '#2563eb' }} />技能发动</span>
        <span><i className="k" style={{ background: '#d97706' }} />近似层发动</span>
        <span><i className="k" style={{ background: '#dc2626' }} />体力归零</span>
      </div>
    </div>
  );
}
