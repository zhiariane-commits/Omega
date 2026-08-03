/**
 * Ω 主线剧情触发引擎
 *
 * 管理 milestones 1-7 的触发条件检测、对话内容、奖励发放。
 * 由 FloatingWindow/CapsuleWindow 在适当时机调用 checkMilestones。
 */

import type { OmegaEmotion, OmegaState } from "../types";

/** 所有可用里程碑 ID 列表 */
export const ALL_MILESTONES = [
  "m1_first_greeting",
  "m2_clean_asked",
  "m2_clean_capsule",
  "m3_show_world",
  "m4_childhood_story",
  "m5_construction",
  "m6_game_unlock",
  "m7_writing",
] as const;

export type MilestoneId = (typeof ALL_MILESTONES)[number];

/* ---------- 打招呼内容池 ---------- */

const FIRST_GREETINGS = [
  "早上好，你们的世界今天天气如何？",
  "又见面了。",
  "你平时都吃些什么？",
];

const PERIODIC_TOPICS = [
  "你那边现在是白天还是晚上？",
  "窗外的星星很安静。",
  "我在想……你们世界的颜色是不是比这里多一些。",
  "你有没有想过，声音在真空中其实不会传播？不过你能听见我。",
  "今天有发生什么特别的事吗？",
  "我刚刚在看一本书，里面提到了一种叫「海」的东西。",
];

/** 随机选取一条首次打招呼文案 */
export function pickFirstGreeting(): string {
  return FIRST_GREETINGS[Math.floor(Math.random() * FIRST_GREETINGS.length)];
}

/** 随机选取一条定期话题 */
export function pickPeriodicTopic(): string {
  return PERIODIC_TOPICS[Math.floor(Math.random() * PERIODIC_TOPICS.length)];
}

/* ---------- 里程碑 2: 清扫太空舱剧情（M0 Phase4 风格） ---------- */

/** M2 阶段1：悬浮窗提醒气泡文案 */
export const M2_CLEAN_REMINDER = "我应该打扫一下太空舱了……";

/** M2 阶段1→2 之间：悬浮窗提示气泡文案 */
export const M2_CLEAN_HINT = "最近Ω有可能在太空舱打扫卫生！";

/** M2 阶段2：下次启动时的完成气泡文案 */
export const M2_CLEAN_DONE = "太空舱清理好了。";

/** M2 剧情对话步骤（太空舱内演出，格式同 M0 Phase 4） */
export type M2CleanStep =
  | { role: "omega_bubble"; text: string; emotion?: OmegaEmotion }
  | { role: "player_choice"; options: string[] };

/** 生成 M2 剧情对话步骤 */
export function getM2CleanSteps(nickname: string): M2CleanStep[] {
  return [
    {
      role: "omega_bubble",
      text: `${nickname || "你"}，你觉不觉得我应该打扫一下我的太空舱？`,
      emotion: "shy",
    },
    {
      role: "player_choice",
      options: ["现在这样也挺温馨的", "确实该打扫一下"],
    },
    {
      role: "omega_bubble",
      text: "我觉得我该收拾一下，听说收拾东西会让人的心情变好。",
      emotion: "calm_positive",
    },
  ];
}

/** M2 剧情是否处于「待玩家去太空舱对话」阶段（悬浮窗红点 + 太空舱剧情入口） */
export function isM2CleanStoryPending(state: OmegaState): boolean {
  const completed = new Set(state.completedMilestones ?? []);
  return (
    !completed.has("m2_clean_capsule") &&
    state.m2CleanAgreedAt == null &&
    (state.pendingMilestoneEvent === M2_CLEAN_REMINDER ||
      completed.has("m2_clean_asked"))
  );
}

/** M2 剧情是否处于「清理中」阶段（已同意打扫，等待下次启动完成） */
export function isM2CleanInProgress(state: OmegaState): boolean {
  return (
    state.m2CleanAgreedAt != null &&
    !(state.completedMilestones ?? []).includes("m2_clean_capsule")
  );
}

/** M2 清扫池是否生效：M2 第一阶段（提醒打扫）完成后、第二阶段（清洁完成）完成前 */
export function isM2CleanPoolActive(state: OmegaState): boolean {
  const completed = new Set(state.completedMilestones ?? []);
  return (
    completed.has("m2_clean_asked") &&
    !completed.has("m2_clean_capsule")
  );
}

/* ---------- 里程碑 3: 看世界（屏幕识别引导） ---------- */

/** M3 输入界面打招呼气泡文案（替换常规打招呼） */
export const M3_SHOW_WORLD_GREETING = "嗯......我想看看你那边的世界，或许你直接把图片展示在屏幕上就可以了。可以吗？";

/** M3 剧情是否处于「等待玩家启用屏幕识别并完成一轮对话」阶段（悬浮窗输入红点 + 输入界面屏幕识别红点） */
export function isM3WorldPending(state: OmegaState): boolean {
  const completed = new Set(state.completedMilestones ?? []);
  return (
    !completed.has("m3_show_world") &&
    (state.mood ?? 0) >= 100 &&
    (state.affinity ?? 0) >= 50
  );
}

/* ---------- 里程碑 4: 童年记忆（打招呼气泡引导） ---------- */

/** M4 输入界面打招呼气泡文案（替换常规打招呼） */
export const M4_CHILDHOOD_STORY_GREETING =
  "我今天突然想到了过去，其实我小时候的梦想是环游世界。可惜的是，它现在只能是梦想了——但，我觉得我又很幸运，尽管发生了这么多事。但我最后遇见了你，你总会和我分享你们的世界，这怎么不算是一种旅行呢？我很开心，谢谢你。";

/** M4 剧情是否处于「等待玩家完成一轮对话」阶段（悬浮窗输入红点 + 打招呼气泡替换引导） */
export function isM4StoryPending(state: OmegaState): boolean {
  const completed = new Set(state.completedMilestones ?? []);
  return (
    !completed.has("m4_childhood_story") &&
    (state.mood ?? 0) >= 200 &&
    (state.affinity ?? 0) > 50
  );
}

/* ---------- 里程碑检查 ---------- */

export type MilestoneCheck = {
  /** 本次检查中新触发的里程碑 ID，若无则为 null */
  triggered: MilestoneId | null;
  /** 触发后的气泡消息（如果需要在悬浮窗显示） */
  bubbleText: string | null;
};

/**
 * 检查是否满足未触发的里程碑条件。
 * 每次只触发一个（按顺序优先），状态由调用方通过 updateState 写入 completedMilestones。
 */
export function checkMilestones(state: OmegaState): MilestoneCheck {
  const completed = new Set(state.completedMilestones ?? []);
  const { mood, affinity, unlocked } = state;

  // 按顺序检查
  if (!completed.has("m1_first_greeting") && mood > 50) {
    return {
      triggered: "m1_first_greeting",
      bubbleText: pickFirstGreeting(),
    };
  }

  // M2 阶段1：提醒打扫（悬浮窗气泡 + 太空舱红点提示）
  if (
    !completed.has("m2_clean_asked") &&
    !completed.has("m2_clean_capsule") &&
    state.m2CleanAgreedAt == null &&
    mood >= 100
  ) {
    return {
      triggered: "m2_clean_asked",
      bubbleText: M2_CLEAN_REMINDER,
    };
  }

  // M2 阶段2：已同意清扫且跨会话（关闭游戏后再启动）→ 完成剧情
  if (
    !completed.has("m2_clean_capsule") &&
    state.m2CleanAgreedAt != null &&
    state.m2CleanAgreedAt < (state.sessionStartTime ?? 0)
  ) {
    return {
      triggered: "m2_clean_capsule",
      bubbleText: M2_CLEAN_DONE,
    };
  }

  // M3：不显示悬浮气泡，改为「输入」红点 + 输入界面「屏幕识别」红点引导（见 isM3WorldPending）
  if (!completed.has("m3_show_world") && mood >= 100 && affinity >= 50) {
    return {
      triggered: "m3_show_world",
      bubbleText: M3_SHOW_WORLD_GREETING,
    };
  }

  // M4：不显示悬浮气泡，改为「输入」红点 + 打招呼气泡替换为童年记忆引导（见 isM4StoryPending）
  if (!completed.has("m4_childhood_story") && mood >= 200 && affinity > 50) {
    return {
      triggered: "m4_childhood_story",
      bubbleText: M4_CHILDHOOD_STORY_GREETING,
    };
  }

  if (!completed.has("m5_construction") && mood >= 300 && unlocked.construction) {
    return {
      triggered: "m5_construction",
      bubbleText: "这些图纸……也许可以派上用场。",
    };
  }

  if (!completed.has("m7_writing") && mood > 500 && affinity > 50) {
    return {
      triggered: "m7_writing",
      bubbleText: "我想写故事……",
    };
  }

  return { triggered: null, bubbleText: null };
}

/**
 * 应用里程碑完成后的奖励变化。
 * 返回需要合并到 state 的 partial。
 */
export function applyMilestoneReward(
  milestone: MilestoneId,
  currentState: OmegaState
): Partial<OmegaState> {
  const completed = new Set(currentState.completedMilestones ?? []);
  completed.add(milestone);

  const partial: Partial<OmegaState> = {
    completedMilestones: [...completed],
    pendingMilestoneEvent: null,
  };

  switch (milestone) {
    case "m1_first_greeting":
      partial.mood = Math.min(1000, (currentState.mood ?? 0) + 5);
      partial.affinity = (currentState.affinity ?? 0) + 1;
      partial.emotion = "calm_positive";
      partial.lastGreetingTime = Date.now();
      break;
    case "m2_clean_asked":
      partial.m2CleanAgreedAt = null;
      break;
    case "m2_clean_capsule":
      partial.capsuleBackgroundDirty = false;
      partial.emotion = "proud";
      partial.m2CleanAgreedAt = null;
      break;
    case "m3_show_world":
      partial.mood = Math.min(1000, (currentState.mood ?? 0) + 10);
      partial.affinity = (currentState.affinity ?? 0) + 2;
      partial.emotion = "happy";
      break;
    case "m4_childhood_story":
      partial.mood = Math.min(1000, (currentState.mood ?? 0) + 10);
      partial.affinity = (currentState.affinity ?? 0) + 2;
      partial.emotion = "calm_positive";
      break;
    case "m5_construction":
      partial.mood = Math.min(1000, (currentState.mood ?? 0) + 10);
      partial.emotion = "proud";
      break;
    case "m7_writing":
      partial.mood = Math.min(1000, (currentState.mood ?? 0) + 20);
      partial.affinity = (currentState.affinity ?? 0) + 5;
      partial.emotion = "calm_positive";
      partial.unlocked = {
        ...(currentState.unlocked ?? {}),
        bookshelf: true,
        writing: true,
      };
      break;
    default:
      break;
  }

  return partial;
}
