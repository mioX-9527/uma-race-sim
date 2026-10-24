import { CALIB, DEFAULT_BASE_SPEED, PHASE_SPEED_RATIO } from './constants';
import type { Course, PhaseId, RunnerConfig } from './types';

export function baseSpeedOf(course: Course): number {
  return course.baseSpeed ?? DEFAULT_BASE_SPEED;
}

/**
 * 阶段目标速度(未含技能加成/温存限制)。
 * TODO(calibration): 适性/干劲/距离补正未建模;跑法×阶段系数占位为 1.0。
 */
export function phaseTargetSpeed(course: Course, runner: RunnerConfig, phase: PhaseId): number {
  return baseSpeedOf(course) * PHASE_SPEED_RATIO[runner.tactic][phase];
}

export function phaseAccel(phase: PhaseId): number {
  return phase === 3 ? CALIB.spurtAccel : CALIB.normalAccel;
}
