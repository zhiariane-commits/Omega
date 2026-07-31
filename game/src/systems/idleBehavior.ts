/**
 * Ω 待机行为概率调度系统
 *
 * 状态机：
 *   - normal（普通状态）：不进行动作，保持视线鼠标跟随
 *   - idle（待机状态）：按概率执行动作，每个动作持续到时长结束为一个完整动作，
 *     结束后重新按概率决定下一个动作
 *   - chatting / focus / sleep / capsule / prologue：其他状态
 *
 * 动作模组：moduleReady=false 的动作暂未制作，执行时用「跟随鼠标指针 5min」占位，
 * 方便后续做好动作模组后直接导入调试。
 */

import type { OmegaIdleAction, OmegaState } from "../types";

/** 单个行为的权重配置 */
type WeightEntry = {
  action: OmegaIdleAction;
  weight: number;
  duration: number; // ms
};

/** 动作模组定义 */
export type IdleActionModule = {
  /** 动作基准时长 ms */
  duration: number;
  /** 是否已制作好动作模组（false = 用 follow_mouse 占位） */
  moduleReady: boolean;
};

/** 各待机动作模组注册表 */
export const IDLE_ACTION_MODULES: Record<OmegaIdleAction, IdleActionModule> = {
  follow_mouse: { duration: 5 * 60_000, moduleReady: true },
  stare: { duration: 1 * 60_000, moduleReady: true },
  read: { duration: 2 * 60_000, moduleReady: false },
  write: { duration: 2 * 60_000, moduleReady: false },
  water_plants: { duration: 1 * 60_000, moduleReady: false },
  wooden_sign: { duration: 5 * 60_000, moduleReady: false },
  sleep: { duration: 1 * 60_000, moduleReady: true },
};

/** 待机动作中文标签 */
export const IDLE_ACTION_LABELS: Record<OmegaIdleAction, string> = {
  follow_mouse: "看着你这边",
  stare: "望着窗外发呆",
  read: "在看书",
  write: "在写点什么",
  water_plants: "在浇花看花",
  wooden_sign: "在修理木牌",
  sleep: "在睡觉",
};

/** 未制作模组的动作统一占位为「跟随鼠标指针 5min」 */
export const PLACEHOLDER_ACTION: OmegaIdleAction = "follow_mouse";
export const PLACEHOLDER_DURATION = 5 * 60_000;

/** 动作模组是否已制作 */
export function isActionModuleReady(action: OmegaIdleAction): boolean {
  return IDLE_ACTION_MODULES[action]?.moduleReady ?? false;
}

/** 实际执行的动作：模组未制作时用 follow_mouse 占位 */
export function getEffectiveIdleAction(action: OmegaIdleAction): OmegaIdleAction {
  return isActionModuleReady(action) ? action : PLACEHOLDER_ACTION;
}

/** 实际执行时长：模组未制作时使用占位时长（跟随鼠标 5min） */
export function getEffectiveIdleDuration(action: OmegaIdleAction, duration: number): number {
  return isActionModuleReady(action) ? duration : PLACEHOLDER_DURATION;
}

/** 将 total 权重均分给 count 项，余数依次补足（保证总和等于 total） */
function splitWeight(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const weights = new Array<number>(count).fill(base);
  let remainder = total - base * count;
  let i = 0;
  while (remainder > 0) {
    weights[i % count] += 1;
    remainder -= 1;
    i += 1;
  }
  return weights;
}

/** 休闲动作池：看书默认解锁，写作/浇花按解锁加入，未解锁的不参与平分 */
function buildLeisurePool(state: OmegaState): OmegaIdleAction[] {
  const pool: OmegaIdleAction[] = ["read"];
  if (state.unlocked.writing) pool.push("write");
  if (state.unlocked.gardening) pool.push("water_plants");
  return pool;
}

/**
 * 加权随机选取一个动作。
 * 返回 { action, duration }；duration 为实际执行时长（未制作模组时用占位时长）。
 */
export function pickIdleAction(state: OmegaState): {
  action: OmegaIdleAction;
  duration: number;
} {
  const weights = buildWeights(state);
  const totalWeight = weights.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight <= 0) {
    // fallback: 发呆
    return { action: "stare", duration: getEffectiveIdleDuration("stare", 60_000) };
  }

  let roll = Math.random() * totalWeight;
  for (const entry of weights) {
    roll -= entry.weight;
    if (roll <= 0) {
      return { action: entry.action, duration: entry.duration };
    }
  }

  // safety fallback
  return { action: "stare", duration: getEffectiveIdleDuration("stare", 60_000) };
}

/**
 * 判断当前待机行为是否已经到期。
 */
export function isIdleActionExpired(
  state: OmegaState,
  now: number = Date.now()
): boolean {
  return now - state.idleActionStart >= state.idleActionDuration;
}

/** 检查低心境限制：心境 < 15 时大部分交互被阻断 */
export function isLowMood(state: OmegaState): boolean {
  return state.mood < 15;
}

/** 根据亲密度数值返回档位 */
export function getAffectionLevel(affinity: number): "low" | "medium" | "high" {
  if (affinity >= 50) return "high";
  if (affinity >= 20) return "medium";
  return "low";
}

/* ---- 内部：构造概率权重表 ---- */

function buildWeights(state: OmegaState): WeightEntry[] {
  const { mood, unlocked, currentMode } = state;
  const hasConstruction = unlocked.construction;

  // 专注模式：固定行为循环（功能状态，动作模组暂未制作 → 统一占位跟随鼠标）
  if (currentMode === "focus") {
    const focusActions: OmegaIdleAction[] = ["stare", "read", "write", "water_plants"];
    const focusDurations: Record<OmegaIdleAction, number> = {
      follow_mouse: 5 * 60_000,
      stare: 2 * 60_000,
      read: 5 * 60_000,
      write: 5 * 60_000,
      water_plants: 1 * 60_000,
      wooden_sign: 5 * 60_000,
      sleep: 1 * 60_000,
    };
    return focusActions.map((action) => ({
      action,
      weight: 25, // 均匀分布
      duration: getEffectiveIdleDuration(action, focusDurations[action]),
    }));
  }

  // 低心境值（< 50）：跟随鼠标 5min(50%) / 发呆 2min(50%)
  if (mood < 50) {
    return [
      {
        action: "follow_mouse",
        weight: 50,
        duration: getEffectiveIdleDuration("follow_mouse", 5 * 60_000),
      },
      {
        action: "stare",
        weight: 50,
        duration: getEffectiveIdleDuration("stare", 2 * 60_000),
      },
    ];
  }

  // 高心境值（>= 50）：跟随鼠标 5min(40%) / 发呆 1min(10%) / 休闲动作共 50%
  const entries: WeightEntry[] = [
    {
      action: "follow_mouse",
      weight: 40,
      duration: getEffectiveIdleDuration("follow_mouse", 5 * 60_000),
    },
    {
      action: "stare",
      weight: 10,
      duration: getEffectiveIdleDuration("stare", 1 * 60_000),
    },
  ];

  const leisure = buildLeisurePool(state);
  const leisureWeights = splitWeight(50, leisure.length);
  for (let i = 0; i < leisure.length; i += 1) {
    const action = leisure[i];
    entries.push({
      action,
      weight: leisureWeights[i],
      duration: getEffectiveIdleDuration(action, IDLE_ACTION_MODULES[action].duration),
    });
  }

  // 后台有建造项目（且心境 >= 100）：
  // 木牌 5min(40%) / 跟随鼠标 5min(20%) / 发呆1min=看书2min=写作2min=浇花1min 共 40%
  if (hasConstruction && mood >= 100) {
    const woodEntries: WeightEntry[] = [
      {
        action: "wooden_sign",
        weight: 40,
        duration: getEffectiveIdleDuration("wooden_sign", 5 * 60_000),
      },
      {
        action: "follow_mouse",
        weight: 20,
        duration: getEffectiveIdleDuration("follow_mouse", 5 * 60_000),
      },
    ];
    const buildPool: OmegaIdleAction[] = ["stare", ...leisure];
    const buildWeightsArr = splitWeight(40, buildPool.length);
    for (let i = 0; i < buildPool.length; i += 1) {
      const action = buildPool[i];
      woodEntries.push({
        action,
        weight: buildWeightsArr[i],
        duration: getEffectiveIdleDuration(action, IDLE_ACTION_MODULES[action].duration),
      });
    }
    return woodEntries;
  }

  return entries;
}
