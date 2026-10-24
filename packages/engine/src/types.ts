/** 比赛阶段:0=序盘 1=中盘 2=终盘 3=最终冲刺(末脚) */
export type PhaseId = 0 | 1 | 2 | 3;

/** 跑法:nige=逃 senko=先 sashi=差 oikomi=追 */
export type Tactic = 'nige' | 'senko' | 'sashi' | 'oikomi';

export type Aptitude = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

/** 干劲:绝好调~绝不调 */
export type Motivation = 'best' | 'good' | 'normal' | 'bad' | 'worst';

export interface Corner {
  readonly n: number;
  readonly start: number;
  readonly end: number;
}

export interface Slope {
  readonly start: number;
  readonly end: number;
  /** 坡度 %,下坡为负 */
  readonly gradient: number;
}

export interface Course {
  readonly id: string;
  readonly name: string;
  readonly venue: string;
  readonly distance: number;
  readonly surface: 'turf' | 'dirt';
  readonly corners: readonly Corner[];
  readonly slopes: readonly Slope[];
  /** 阶段分界(米) */
  readonly phaseBounds: {
    readonly midStart: number;
    readonly lateStart: number;
    readonly finalStart: number;
  };
  /** 基准速度 m/s;缺省用 DEFAULT_BASE_SPEED(占位,见 docs/formulas.md) */
  readonly baseSpeed?: number;
}

export interface Stats {
  readonly speed: number;
  readonly stamina: number;
  readonly power: number;
  readonly guts: number;
  readonly wisdom: number;
}

export type SkillRarity =
  | 'normal'
  | 'rareEvolved'
  | 'unique1'
  | 'unique2'
  | 'unique3'
  | 'unique4'
  | 'unique5'
  | 'unique6';

/** 条件精度层级:精确 / 近似(依赖他马,UI 需角标) / 不支持 */
export type Precision = 'precise' | 'approx' | 'unsupported';

export type SkillEffect =
  | { readonly type: 'targetSpeed'; readonly value: number }
  | { readonly type: 'acceleration'; readonly value: number }
  | { readonly type: 'currentSpeed'; readonly value: number }
  | { readonly type: 'lastSpurtExtension'; readonly value: number }
  | { readonly type: 'heal'; readonly value: number };

/** 距离/时间类条件的基准偏移 */
export type ConditionBase = 'start' | 'midStart' | 'lateStart' | 'finalStart';

/**
 * 发动条件(v0.1 精确层可静态解析的 24 种中的核心集;
 * 依赖他马的条件(序位/累积时间/被阻挡)属近似层,由数据侧换算后进入本枚举或标记 approx/unsupported)。
 */
export type SkillCondition =
  | { readonly kind: 'raceStart' }
  | { readonly kind: 'phase'; readonly phase: PhaseId }
  | { readonly kind: 'phaseAfter'; readonly phase: PhaseId }
  | { readonly kind: 'cornerN'; readonly n: number }
  | { readonly kind: 'cornerFastest' }
  | { readonly kind: 'finalCorner' }
  | { readonly kind: 'thirdCornerFromEnd' }
  | { readonly kind: 'lateCorner' }
  | { readonly kind: 'finalStraight' }
  | { readonly kind: 'straightFastest' }
  | { readonly kind: 'lateStraight' }
  | { readonly kind: 'uphillFastest' }
  | { readonly kind: 'downhillFastest' }
  | { readonly kind: 'distanceRun'; readonly meters: number; readonly base: ConditionBase }
  | { readonly kind: 'distanceLeft'; readonly meters: number }
  | { readonly kind: 'elapsedSec'; readonly seconds: number; readonly base: ConditionBase }
  | { readonly kind: 'positionPct'; readonly pct: number };

export interface SkillConfig {
  readonly id: string;
  readonly name: string;
  readonly rarity: SkillRarity;
  readonly precision: Precision;
  readonly effects: readonly SkillEffect[];
  /** 效果持续时间(秒);null=瞬时(heal 等) */
  readonly durationSec: number | null;
  readonly condition: SkillCondition;
  /** 是否受智力增幅(固有/レア) */
  readonly wisdomScaled: boolean;
}

export interface RunnerConfig {
  readonly stats: Stats;
  /** 绿技能提供的前提值 */
  readonly greenBonus: Readonly<Partial<Stats>>;
  readonly tactic: Tactic;
  readonly distanceAptitude: Aptitude;
  readonly surfaceAptitude: Aptitude;
  readonly motivation: Motivation;
  readonly skills: readonly SkillConfig[];
}

export interface Activation {
  readonly skillId: string;
  readonly name: string;
  readonly atSec: number;
  readonly atMeter: number;
  readonly precision: Precision;
}

export interface SimResult {
  /** 完赛时间(秒,冲线帧线性插值) */
  readonly finishTimeSec: number;
  /** 逐帧序列(下标对齐);用 Float64 保存体力等大数值的帧间精度 */
  readonly t: Float64Array;
  readonly x: Float64Array;
  readonly v: Float64Array;
  readonly hp: Float64Array;
  readonly maxHp: number;
  readonly activations: readonly Activation[];
  /** 体力归零(进入温存)的位置;未耗尽为 null */
  readonly exhaustedAtMeter: number | null;
}
