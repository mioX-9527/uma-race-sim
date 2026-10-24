import { useEffect, useRef, useState } from 'react';
import type { Activation, Course } from '@uma-race-sim/engine';
import { realStraights } from '@uma-race-sim/engine';

interface Props {
  course: Course;
  activations: readonly Activation[];
  exhaustedAtMeter: number | null;
  /** 与曲线图绘图区对齐(同一边距映射距离);缺省用自带边距 */
  align?: { left: number; width: number };
}

const H = 96;

/** 赛道条:弯道/坡度/阶段分界/技能发动点/体力归零点 */
export function TrackBar({ course, activations, exhaustedAtMeter, align }: Props): JSX.Element {
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
    // 与曲线图绘图区共用同一水平映射:同一段距离在两图中垂直对齐
    const padL = align?.left ?? 14;
    const trackW = align?.width ?? width - 14 - 14;
    const px = (m: number): number => padL + (m / D) * trackW;
    const meterAt = (x: number): number => ((x - padL) / trackW) * D;

    ctx.clearRect(0, 0, width, H);
    ctx.font = '10px system-ui';

    // 主轨道
    ctx.strokeStyle = '#3a465e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px(0), 44);
    ctx.lineTo(px(D), 44);
    ctx.stroke();

    // 真实直线段(解包 straights;既非直线也非弯道的过渡区保持裸轨道)
    for (const s of realStraights(course)) {
      ctx.fillStyle = 'rgba(127, 179, 227, 0.55)';
      ctx.fillRect(px(s[0]), 37, Math.max(px(s[1]) - px(s[0]), 2), 14);
    }

    // 过渡区(既非直线也非弯道,如 有馬記念 起跑后 100m):琥珀色斜纹,与直线明显区分
    const covered = [
      ...course.corners.map(c => [c.start, c.end] as [number, number]),
      ...realStraights(course).map(r => [r[0], r[1]] as [number, number]),
    ].sort((a, b) => a[0] - b[0]);
    const orphans: Array<[number, number]> = [];
    let cursorM = 0;
    for (const [s, e] of covered) {
      if (s > cursorM + 1) orphans.push([cursorM, Math.min(s, D)]);
      cursorM = Math.max(cursorM, e);
    }
    if (D > cursorM + 1) orphans.push([cursorM, D]);
    if (orphans.length > 0) {
      const pat = document.createElement('canvas');
      pat.width = 8;
      pat.height = 8;
      const pc = pat.getContext('2d');
      if (pc !== null) {
        pc.fillStyle = 'rgba(224, 134, 60, 0.30)';
        pc.fillRect(0, 0, 8, 8);
        pc.strokeStyle = 'rgba(200, 100, 30, 0.95)';
        pc.lineWidth = 2;
        pc.beginPath();
        pc.moveTo(-2, 10);
        pc.lineTo(10, -2);
        pc.moveTo(-4, 4);
        pc.lineTo(4, -4);
        pc.moveTo(4, 12);
        pc.lineTo(12, 4);
        pc.stroke();
        const pattern = ctx.createPattern(pat, 'repeat');
        if (pattern !== null) {
          ctx.fillStyle = pattern;
          for (const [s, e] of orphans) ctx.fillRect(px(s), 37, Math.max(px(e) - px(s), 2), 14);
        }
      }
    }

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
    const straights = realStraights(course);
    const onMove = (ev: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const m = Math.max(0, Math.min(D, meterAt(mx)));
      const corner = course.corners.find(c => m >= c.start && m <= c.end);
      const slope = course.slopes.find(s => m >= s.start && m <= s.end);
      const onStraight = !corner && straights.some(s => m >= s[0] && m <= s[1]);
      const phase = m >= b.finalStart ? '末脚' : m >= b.lateStart ? '终盘' : m >= b.midStart ? '中盘' : '序盘';
      const parts = [`${Math.round(m)}m · ${phase}`];
      if (corner !== undefined) parts.push(`弯道${corner.n}`);
      else if (onStraight) parts.push('直线');
      else parts.push('过渡区(非直线非弯道)');
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
  }, [width, course, activations, exhaustedAtMeter, align]);

  return (
    <div className="track-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <div className="track-tooltip" ref={tipRef} />
      <div className="legend">
        <span><i className="k" style={{ background: '#52607d' }} />弯道</span>
        <span><i className="k" style={{ background: 'rgba(127,179,227,0.8)' }} />直线</span>
        <span><i className="k" style={{ background: 'repeating-linear-gradient(45deg, rgba(200,100,30,0.9) 0 2px, rgba(224,134,60,0.45) 2px 6px)' }} />过渡区</span>
        <span><i className="k" style={{ background: '#d6454566' }} />上坡</span>
        <span><i className="k" style={{ background: '#3d8bfd66' }} />下坡</span>
        <span><i className="k" style={{ background: '#2563eb' }} />技能发动</span>
        <span><i className="k" style={{ background: '#d97706' }} />近似层发动</span>
        <span><i className="k" style={{ background: '#dc2626' }} />体力归零</span>
      </div>
    </div>
  );
}
