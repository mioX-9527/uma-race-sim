import type { Motivation, PhaseId, SkillRarity, Tactic } from './types';

/** 游戏 30fps,引擎按 1/30s 步长积分 */
export const FPS = 30;
export const DT = 1 / FPS;

/** 出闸初速(614tools) */
export const GATE_SPEED = 3.0;
/** 起步加速度,至基准速度 85%(614tools) */
export const GATE_ACCEL = 24.0;
export const GATE_EXIT_RATIO = 0.85;

/** 缺省基准速度;正式值按赛道建表后由 Course.baseSpeed 提供 —— TODO(calibration) */
export const DEFAULT_BASE_SPEED = 19.6;

/** 马身换算:1 马身 = 2.5m(614tools) */
export const BODY_LENGTH_METERS = 2.5;

/**
 * 校准占位常量 —— 均标注 TODO(calibration)。
 * D7~D8 校准阶段依 614tools/Google 表格 公式替换,见 docs/formulas.md。
 */
export const CALIB = {
  /** 通常加速度 m/s² */ normalAccel: 0.5,
  /** 减速度 m/s² */ brakeAccel: 0.7,
  /** 冲刺加速度 m/s² */ spurtAccel: 1.2,
  /** 体力上限 = 耐力(含绿) × 系数 */ hpPerStamina: 2.0,
  /** 温存目标速度系数(×基准速度) */ temperRatio: 0.85,
  /** 场地状态系数(良) */ surfaceCoef: 1.0,
  /** 末脚延展折算为冲刺额外加速度的比例(Excel AA79=0.1,614tools) */
  lastSpurtExtensionAccelScale: 0.1,
} as const;

/** 各跑法×阶段目标速度系数(×基准速度)——占位 1.0,TODO(calibration) */
export const PHASE_SPEED_RATIO: Readonly<Record<Tactic, Readonly<Record<PhaseId, number>>>> = {
  nige: { 0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0 },
  senko: { 0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0 },
  sashi: { 0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0 },
  oikomi: { 0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0 },
};

/** 干劲对参照智力的乘数——仅绝好调=1.0 有据(614tools 示例),其余为占位 TODO(calibration) */
export const MOTIVATION_WISDOM_MULT: Readonly<Record<Motivation, number>> = {
  best: 1.0,
  good: 0.98,
  normal: 0.95,
  bad: 0.92,
  worst: 0.9,
};

/** 智力增幅的等级系数——占位 1.0,TODO(calibration) */
export const RARITY_LEVEL_FACTOR: Readonly<Record<SkillRarity, number>> = {
  normal: 0,
  rareEvolved: 1.0,
  unique1: 1.0,
  unique2: 1.0,
  unique3: 1.0,
  unique4: 1.0,
  unique5: 1.0,
  unique6: 1.0,
};
