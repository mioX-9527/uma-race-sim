/**
 * 体力模型(来源:umamusumeschool,见 docs/formulas.md)
 * 秒间体力消耗 = 20.0 × 状态系数 × (当前速度 − 基准速度 + 12.0)² / 144.0 × 场地状态系数
 */
export interface StaminaDrainOpts {
  /** 状态系数(焦躁等;v0.1 恒 1) */
  readonly stateCoef: number;
  /** 场地状态系数 */
  readonly surfaceCoef: number;
}

export function staminaDrainPerSecond(v: number, baseV: number, opts: StaminaDrainOpts): number {
  const d = v - baseV + 12.0;
  return (20.0 * opts.stateCoef * d * d * opts.surfaceCoef) / 144.0;
}
