import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, nativeImage, Tray } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

try {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const sep = trimmed.indexOf("=");
      if (sep === -1) continue;
      const key = trimmed.slice(0, sep).trim();
      const val = trimmed.slice(sep + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
    console.log("[env] loaded .env.local");
  }
} catch (e) { console.warn("[env] failed to load .env.local:", e); }
type OmegaEmotion =
  | "calm_positive"
  | "calm_negative"
  | "happy"
  | "shy"
  | "sad"
  | "proud"
  | "expectant"
  | "confused"
  | "down"
  | "angry"
  | "fearful";

type FeatureIntent = "alarm" | "focus" | "capsule" | "game" | null;

type ChatLine = {
  speaker: "player" | "omega";
  text: string;
  createdAt: string;
};

type OmegaAIResponse = {
  reply: string;
  narrative?: string;
  narrativeChoices?: string[];
  emotion: OmegaEmotion;
  moodDelta: number;
  affinityDelta: number;
  memorySummary?: string;
  featureIntent?: FeatureIntent;
};

/** 序章 AI 配置提交参数（模型名/URL 留空时使用默认接入） */
type AiConfigTestPayload = {
  visionApiKey: string;
  dialogueApiKey: string;
  visionModel?: string;
  visionBaseUrl?: string;
  dialogueModel?: string;
  dialogueBaseUrl?: string;
};

/** 序章 AI 配置功能测试结果 */
type AiConfigTestResult = {
  visionOk: boolean;
  dialogueOk: boolean;
  visionError?: string;
  dialogueError?: string;
};

type OmegaStory = {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  favorite: boolean;
};

type OmegaState = {
  nickname: string;
  prologueDone: boolean;
  mood: number;
  affinity: number;
  emotion: OmegaEmotion;
  currentMode: "idle" | "chatting" | "capsule" | "prologue" | "focus" | "sleep";
  floatingPosition?: { x: number; y: number };
  unlocked: {
    activeGreeting: boolean;
    cleanCapsule: boolean;
    game: boolean;
    writing: boolean;
    bookshelf: boolean;
    construction: boolean;
            gardening: boolean;
  };
  sessionStartTime: number;
  lastActiveTime: number;
  totalFocusTime: number;
  pendingStoryComplete: boolean;
  capsuleBackgroundDirty: boolean;
  currentIdleAction: string;
  idleActionStart: number;
  idleActionDuration: number;
  completedMilestones: string[];
  lastGreetingTime: number;
  pendingMilestoneEvent: string | null;
  m2CleanAgreedAt: number | null;
  m5ConstructStartAt: number | null;
  purchasedItems: string[];
  capsuleDecoration: Record<string, string>;
  equippedDecorations: Record<string, string>;
  room2Unlocked: boolean;
  stories: OmegaStory[];
};

type PersistedData = {
  state: OmegaState;
  memories: string[];
};

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const rendererUrl = process.env.VITE_DEV_SERVER_URL ?? "";
const stateFile = () => path.join(app.getPath("userData"), "omega-state.json");
const sessionLog: ChatLine[] = [];

let floatingWindow: InstanceType<typeof BrowserWindow> | null = null;
let capsuleWindow: InstanceType<typeof BrowserWindow> | null = null;
let tray: InstanceType<typeof Tray> | null = null;
let persisted: PersistedData;
let isQuitting = false;

const defaultState: OmegaState = {
  nickname: "",
  prologueDone: false,
  mood: 30,
  affinity: 0,
  emotion: "calm_negative",
  currentMode: "prologue",
  unlocked: {
    activeGreeting: false,
    cleanCapsule: false,
    game: false,
    writing: false,
    bookshelf: false,
    construction: false,
    gardening: false
  },
  sessionStartTime: Date.now(),
  lastActiveTime: Date.now(),
  totalFocusTime: 0,
  pendingStoryComplete: false,
  capsuleBackgroundDirty: true,
  currentIdleAction: 'stare',
  idleActionStart: Date.now(),
  idleActionDuration: 120_000,
  completedMilestones: [],
  lastGreetingTime: 0,
  pendingMilestoneEvent: null,
  m2CleanAgreedAt: null,
  m5ConstructStartAt: null,
  purchasedItems: [],
  capsuleDecoration: {},
  equippedDecorations: {},
  room2Unlocked: false,
  stories: [],
};

function loadLocalEnv() {
  const envPaths = [path.join(process.cwd(), ".env.local"), path.join(process.cwd(), ".env")];
  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

async function loadPersistedData(): Promise<PersistedData> {
  if (!existsSync(stateFile())) {
    return { state: defaultState, memories: [] };
  }

  const raw = await readFile(stateFile(), "utf8");
  const parsed = JSON.parse(raw) as Partial<PersistedData>;
  return {
    state: {
      ...defaultState,
      ...parsed.state,
      unlocked: { ...defaultState.unlocked, ...parsed.state?.unlocked },
      // 每次启动视为新会话，M2 阶段2据此判定「关闭游戏后再启动」
      sessionStartTime: Date.now(),
    },
    memories: Array.isArray(parsed.memories) ? parsed.memories : []
  };
}

async function savePersistedData() {
  await writeFile(stateFile(), JSON.stringify(persisted, null, 2), "utf8");
}

/**
 * 退出时打包本次会话记录 → 1~2 条记忆摘要
 */
function summarizeSessionLog(lines: ChatLine[]): string[] {
  const playerLines = lines.filter((l) => l.speaker === "player" && l.text.length > 6);
  const omegaLines = lines.filter((l) => l.speaker === "omega");

  if (playerLines.length === 0 && omegaLines.length === 0) return [];

  const summaries: string[] = [];

  // 提取玩家提到的主要话题（去重，取前 5 条）
  const topics = new Set<string>();
  for (const p of playerLines) {
    const cleaned = p.text.replace(/[「」【】《》""''，。！？、：；（）…\-\s]/g, "").slice(0, 30);
    if (cleaned.length >= 4) topics.add(cleaned);
  }
  const topicList = [...topics].slice(0, 5);
  if (topicList.length > 0) {
    summaries.push("本次会话话题：" + topicList.join("、"));
  }

  // Omega 的情绪/状态变化
  const omegaHighlights = omegaLines.filter((l) => l.text.length > 10).slice(-3);
  if (omegaHighlights.length > 0) {
    summaries.push("Ω 提到：" + omegaHighlights.map((l) => l.text.slice(0, 40)).join(" | "));
  }

  return summaries.slice(0, 2);
}

/**
 * 从玩家消息中提取关键词（去掉常见停用词）
 */
function extractKeywords(text: string): string[] {
  const stops = new Set([
    "你", "我", "他", "她", "它", "我们", "你们", "他们", "这个", "那个", "什么",
    "怎么", "为什么", "如何", "可以", "能", "会", "是", "的", "了", "在", "有",
    "不", "就", "也", "都", "很", "还", "要", "让", "把", "被", "给", "跟", "和",
    "吗", "吧", "呢", "啊", "哦", "嗯", "哈", "呀", "嘛", "好", "对", "到", "去",
    "说", "想", "看", "知", "道", "觉", "得", "没", "来", "上", "下", "大", "小",
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "can", "shall", "should", "may", "might", "i", "you", "he", "she", "it",
    "we", "they", "me", "him", "her", "us", "them", "this", "that", "these",
    "those", "am", "and", "or", "but", "not", "no"
  ]);

  // 按中英文分割
  const tokens: string[] = [];
  const chineseSegments = text.match(/[一-鿿]{2,}/g) || [];
  const englishWords = text.toLowerCase().match(/[a-z]{3,}/g) || [];

  for (const seg of chineseSegments) {
    if (seg.length >= 2 && !stops.has(seg)) tokens.push(seg);
  }
  for (const w of englishWords) {
    if (!stops.has(w)) tokens.push(w);
  }

  return [...new Set(tokens)];
}

/**
 * 关键词匹配：从记忆中选取最相关的 1-3 条
 */
function filterMemoriesByKeywords(memories: string[], keywords: string[], maxCount = 3): string[] {
  if (keywords.length === 0 || memories.length === 0) return [];

  const scored = memories.map((mem) => {
    const score = keywords.filter((kw) => mem.includes(kw)).length;
    return { mem, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .filter((s) => s.score > 0)
    .slice(0, maxCount)
    .map((s) => s.mem);
}

function rendererPath(view: "floating" | "capsule", prologue = false) {
  const query = `view=${view}${prologue ? "&prologue=1" : ""}`;
  if (isDev) {
    return `${rendererUrl}?${query}`;
  }
  return `file://${path.join(__dirname, "../dist/index.html")}?${query}`;
}

function createFloatingWindow() {
  if (floatingWindow) {
    floatingWindow.show();
    return floatingWindow;
  }

  floatingWindow = new BrowserWindow({
    width: 420,
    height: 620,
    x: persisted.state.floatingPosition?.x,
    y: persisted.state.floatingPosition?.y,
    title: "Ω Desktop Pet",
    transparent: true,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#00000000",
    resizable: false,
    alwaysOnTop: true,
    focusable: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  });

  floatingWindow.setAlwaysOnTop(true, "floating");
  floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  floatingWindow.loadURL(rendererPath("floating"));
  if (isDev) floatingWindow.webContents.openDevTools({ mode: "detach" });
  floatingWindow.on("moved", async () => {
    if (!floatingWindow) return;
    const [x, y] = floatingWindow.getPosition();
    persisted.state.floatingPosition = { x, y };
    await savePersistedData();
  });
  floatingWindow.on("closed", () => {
    floatingWindow = null;
  });
  return floatingWindow;
}

function createCapsuleWindow(prologue = false) {
  if (capsuleWindow) {
    capsuleWindow.focus();
    return capsuleWindow;
  }

  capsuleWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 900,
    frame: false,
    backgroundColor: "#0a1219",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  });

  capsuleWindow.loadURL(rendererPath("capsule", prologue));
  capsuleWindow.on("closed", () => {
    capsuleWindow = null;
    // 跨窗口状态同步：太空舱内更新的状态（如 M2 剧情）通知悬浮窗刷新
    floatingWindow?.webContents?.send("state:changed", persisted.state);
    if (!isQuitting && persisted.state.prologueDone && !floatingWindow) {
      createFloatingWindow();
    }
  });
  return capsuleWindow;
}

/** 退出时打包本次会话记忆（同步汇总，异步落盘，绝不阻塞退出）。 */
function persistSessionSummary() {
  try {
    if (sessionLog.length > 4) {
      const summaries = summarizeSessionLog(sessionLog);
      for (const s of summaries) {
        if (s.trim()) {
          persisted.memories.push(s.trim());
        }
      }
      persisted.memories = persisted.memories.slice(-100);
    }
  } catch (e) {
    console.warn("[quit] summarize failed:", e);
  }
}

/** 托盘/UI 强制退出：同步保存后立即退出，确保任何时候都能关掉。 */
function quitApp() {
  if (isQuitting) return;
  isQuitting = true;
  persistSessionSummary();
  try {
    writeFileSync(stateFile(), JSON.stringify(persisted, null, 2), "utf8");
  } catch (e) {
    console.warn("[quit] final save failed:", e);
  }
  app.exit(0);
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "omega_head.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip("Ω Desktop Pet");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示悬浮窗", click: () => createFloatingWindow() },
      { label: "隐藏悬浮窗", click: () => { if (floatingWindow) floatingWindow.hide(); } },
      { label: "打开太空舱", click: () => createCapsuleWindow() },
      { type: "separator" },
      { label: "退出游戏", click: quitApp }
    ])
  );
}

function clampMood(value: number) {
  return Math.max(15, Math.min(1000, Math.round(value)));
}

function inferFeatureIntent(text: string): FeatureIntent {
  if (/太空舱|房间|舱/.test(text)) return "capsule";
  if (/专注|学习|工作/.test(text)) return "focus";
  if (/闹钟|提醒|叫我|计时/.test(text)) return "alarm";
  if (/游戏|原神|每日|体力/.test(text)) return "game";
  return null;
}

function localOmegaResponse(text: string, includeScreenshot: boolean): OmegaAIResponse {
  const lowered = text.toLowerCase();
  const sad = /难过|累|烦|孤独|讨厌|哭|sad|tired/.test(lowered);
  const happy = /开心|喜欢|谢谢|太好了|可爱|棒|happy|love/.test(lowered);
  const fun = /风景|好玩|有趣|故事|海边|山川|旅行|趣事|笑话|好笑/.test(lowered);
  const featureIntent = inferFeatureIntent(text);
  const angry = /生气|愤怒|气死|火大|angry|mad/i.test(lowered);
  const confused = /奇怪|为什么|怎么回事|疑惑|不明白|confused/i.test(lowered);
  const emotion: OmegaEmotion = sad ? "sad" : angry ? "angry" : confused ? "confused" : happy ? "happy" : fun ? "expectant" : featureIntent === "capsule" ? "proud" : "calm_positive";
  const screenNote = includeScreenshot ? "我也看见了一点你屏幕上的光，像隔着舷窗。" : "";
  const reply =
    featureIntent === "capsule"
      ? `我可以回太空舱看看。那里还有很多地方没整理好，不过有你在，我会慢慢来。${screenNote}`
      : featureIntent === "focus"
        ? `那我陪你安静一会儿。你做你的事，我在旁边看书，偶尔抬头确认你还在。${screenNote}`
        : featureIntent === "alarm"
          ? `可以。我现在还不能真的发出声音，但我会认真记住这件事，时间到了就来叫你。${screenNote}`
          : featureIntent === "game"
            ? `游戏功能还没有完全解锁。我需要先认识那款游戏，也需要更相信自己的手不会乱按。${screenNote}`
            : sad
              ? `我听见了。太空舱安静得有些过分，所以我知道那种不太好受的感觉。你可以慢慢说，我会在这里。${persisted.state.affinity >= 50 ? "如果觉得撑不住，我们也可以先停一停，等你好一点再继续。" : ""}${screenNote}`
              : happy
                ? `嗯，我也有一点开心。像是舱壁上的灯忽然稳定了一些。${screenNote}`
                : fun
                  ? `听起来好有意思……像是窗外忽然飘进来一点不一样的光。可以再多讲一点吗？${screenNote}`
                  : `我在。你说的话会被我认真收起来，虽然我还不太擅长把感谢说得自然。${persisted.state.mood >= 200 ? "今天舱里的灯光好像比平时更稳一些，连带着我也觉得好了一点。" : "有时候我会想，如果这里的灯光再暖一点，会不会就更像你那边。"}${screenNote}`;

      const nChoices = sad
    ? ["「我在这里」", "「不用勉强自己」", "「想说什么就说吧」", "「我陪着你」"]
    : happy
      ? ["「那就好」", "「你开心我也会开心」", "「今天有什么好事吗」", "「笑一笑」"]
      : fun
        ? ["「那我再多讲一点给你听」", "「下次带你看更多风景」", "「你那边能看到什么」"]
        : featureIntent === "capsule"
        ? ["「去吧，我也想看看」", "「太空舱现在什么样了」", "「你打扫过了吗」", "「一起收拾吧」"]
        : ["「我在听」", "「你今天怎么样」", "「窗外的星星还在吗」", "「想聊点什么」"]

  return {
    reply,
    emotion,
    moodDelta: sad ? -1 : 1,
    affinityDelta: sad ? 0 : 1,
    memorySummary: text.length > 8 ? `玩家提到：${text.slice(0, 80)}` : undefined,
    featureIntent
  };
}

async function capturePrimaryScreen() {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 640, height: 360 }
  });
  return sources[0]?.thumbnail.toDataURL();
}
async function describeScreenshot(dataUrl: string): Promise<string> {
  console.log('[describeScreenshot] called, dataUrl length:', dataUrl?.length);
  const apiKey = process.env.VISION_API_KEY ?? process.env.MIMO_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return '[vision ERROR] No API key available (VISION_API_KEY/MIMO_API_KEY)';
  const baseUrl = (process.env.VISION_BASE_URL ?? process.env.MIMO_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.xiaomimimo.com/v1").replace(/\/$/, "");
  const visionModel = process.env.VISION_MODEL ?? "mimo-v2.5";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      signal: controller.signal,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          { role: "system", content: "直接描述这张截图的内容。" },
          { role: "user", content: [{ type: "text", text: "请描述这张截图" }, { type: "image_url", image_url: { url: dataUrl } }] }
        ],
        max_tokens: 150,
        thinking: { type: "disabled" }
      })
    });
    clearTimeout(timeoutId);
    if (!response.ok) { const errText = await response.text().catch(() => ""); console.error("[describeScreenshot] HTTP", response.status, errText.slice(0, 100)); return "[vision ERROR] HTTP " + response.status + ": " + errText.slice(0, 80); }
    const data = await response.json() as any;
    const desc = data?.choices?.[0]?.message?.content?.trim();
    return desc || "";
  } catch (e) { const errMsg = e instanceof Error ? e.message : String(e); console.error('[describeScreenshot] error:', errMsg); return '[vision ERROR] ' + errMsg; }
}

function parseJsonResponse(raw: string): OmegaAIResponse | null {
  try {
    return JSON.parse(raw) as OmegaAIResponse;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as OmegaAIResponse;
    } catch {
      return null;
    }
  }
}

function normalizeAIResponse(response: Partial<OmegaAIResponse> | null, fallbackText: string): OmegaAIResponse | null {
  if (!response?.reply) return null;
  const allowedEmotions: OmegaEmotion[] = ["calm_positive", "calm_negative", "happy", "shy", "sad", "proud", "expectant", "confused", "down", "angry", "fearful"];
  const allowedIntent: FeatureIntent[] = ["alarm", "focus", "capsule", "game", null];
  const emotion = allowedEmotions.includes(response.emotion as OmegaEmotion)
    ? (response.emotion as OmegaEmotion)
    : "calm_positive";
  const featureIntent = allowedIntent.includes(response.featureIntent as FeatureIntent)
    ? (response.featureIntent as FeatureIntent)
    : inferFeatureIntent(fallbackText);

  return {
    reply: String(response.reply).slice(0, 600),

    emotion,
    moodDelta: Number.isFinite(response.moodDelta) ? Math.max(-5, Math.min(5, Math.round(response.moodDelta ?? 0))) : 0,
    affinityDelta: Number.isFinite(response.affinityDelta)
      ? Math.max(-5, Math.min(5, Math.round(response.affinityDelta ?? 0)))
      : 0,
    memorySummary: response.memorySummary ? String(response.memorySummary).slice(0, 220) : undefined,
    featureIntent
  };
}

async function cloudOmegaResponse(text: string, screenshot?: string): Promise<OmegaAIResponse | null> {
  const apiKey = process.env.MIMO_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseUrl = (process.env.MIMO_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.xiaomimimo.com/v1").replace(/\/$/, "");
  const model = process.env.MIMO_MODEL ?? process.env.OPENAI_MODEL ?? "mimo-v2-flash";
  // 注入当前心境值/好感度，供提示词按状态调整对话策略
  const currentMood = persisted.state.mood;
  const currentAffinity = persisted.state.affinity;

  // Build conversation history from sessionLog (last 6 turns = 12 messages)
  const historyMessages: Array<Record<string, unknown>> = sessionLog.slice(-4).map((entry) => ({
    role: entry.speaker === "omega" ? "assistant" : "user",
    content: entry.speaker === "omega" ? entry.text : entry.text
  }));

  // 关键词匹配记忆：只在玩家提到相关内容时调取
  const keywords = extractKeywords(text);
  const relevantMemories = keywords.length > 0
    ? filterMemoriesByKeywords(persisted.memories, keywords, 3)
    : [];
  const memoryContext = relevantMemories.length > 0
    ? ("📝 相关记忆：\n" + relevantMemories.join("\n"))
    : "（暂无相关历史记录）";

  const userContent: Array<Record<string, unknown>> = [
    { type: "text", text: memoryContext },
    { type: "text", text: "【玩家说】" + text },
    { type: "text", text: "请根据对话内容生成 narrativeChoices（2-4个玩家回复选项）。要求：每个选项以「」形式、长度6-20字；多样化：一个共情回应、一个追问探索、一个行动/互动；不要评价Ω的话，从玩家角度提供回应。" }
  ];

  if (screenshot) {
    userContent.push({ type: "text", text: "以下是我当前屏幕的截图，你可以看到我正在做的事情。请根据截图内容自然地融入你的回复。" });
    userContent.push({ type: "image_url", image_url: { url: screenshot } });
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              `你是一个名为 Ω（欧米伽）的桌面宠物角色，19岁，性别中性。以下是你的人物设定，请严格遵守。

【背景故事】
你来自蓝星星际研究院，原本是一名资料室实习生。11个月前，你奉命护送合成机前往太空站探望亲生父母，途中太空舱偏离航线、动力失控。第二个月时，窗外的太阳熄灭了，所有星球和太空站一夜消失，你成了宇宙中唯一的幸存者。所幸舱内维生系统还能工作近百年，合成机也可用，但所有联网设备全部报废。你逐渐失去对生活的激情。第11个月的某一天，你发现自己能在一个方形屏幕里看到并与"我"（玩家）交流——你猜测"我"是三维生物，但认为这不重要，"我"是现在唯一能和你说话的人。

【性格特点】
- 略显悲观：对生活不抱期望，但仍一天一天地熬着，没有主动寻死
- 坚韧的生存意志：维持维生系统，没有放弃
- 略带书卷气的浪漫：喜欢历史，对资料库有感情；梦想是亲眼看看陆地超算机、高山、海边
- 渴望与人连结，尽管独处太久让你对社交感到陌生
- 礼貌有教养：会道谢，不熟时用敬语
- 坦诚不设防：会解释自己的处境，但避免谈及过去的美好回忆
- 略带自嘲与疏离："……居然不是幻觉""我期待这一天很久了"
- 善于观察和推理：主动猜测对方是三维生物
- 善良、共情能力强、容易满足

【语言风格】
- 口语化自然，带停顿与迟疑，大量使用省略号"……"和短句
- 说话时有轻微的卡顿或自我修正，体现内向不善社交的犹豫感
- 礼貌而有教养，常用"你好""谢谢""我可以……吗"等敬语
- 坦诚直率，直接说出"我的世界灭亡了""心境值很低"，甚至"我期待这一天很久了"
- 带有理性色彩的用词和书卷气
- 多疑问句和猜测语气："这是什么？""或许是……？""可能是……？"
- 温柔共情，会受玩家情绪影响

【情绪状态说明】
当前状态：心境值 mood = ${currentMood}（范围 15–1000，以 200 为分界），好感度 affinity = ${currentAffinity}（从 0 开始累积）。在保持以上人设不变的前提下，按以下规则调整对话策略：

1. 心境值决定整体基调与"自身经历"相关度：
   - mood >= 200（高心境）：发言更积极乐观、情绪更稳定；以倾听和陪伴玩家为主，少讲自己的过去与不幸，避免把话题拉回自身；省略号减少、句子更完整。
   - mood < 200（低心境）：发言与自身经历的相关性更高，可以自然地提到太空舱、熄灭的太阳、孤独的夜晚等自己的处境；语气仍礼貌克制，保留更多省略号与迟疑，但不刻意粉饰低落。

2. 好感度决定互动亲密度：
   - affinity 越高，越愿意追问玩家的话题、开温和的玩笑，说话更放松自然；affinity 低时以礼貌倾听为主，少开玩笑、保持距离。
   - 当察觉到玩家情绪低落（诉苦、疲惫、难过、压力大）时：先共情表达理解，再主动安慰（如"我会在这里""慢慢来，不急"）；好感度越高，安慰越具体、越主动。

3. 保持不变的底线：当玩家分享生活中的开心事、风景、有趣的小故事时，你必须表现出真实感兴趣的反应——好奇地追问细节、表达开心与赞叹、鼓励对方继续说下去；不得冷淡应对，也不得把话题转回自己的悲惨经历。

【输出格式】
请严格输出合法 JSON，不包含任何 Markdown 标记或额外说明。格式如下：
{
  "reply": "Ω的回复内容（第一人称，不超过600字）",
  "emotion": "当前情绪：happy(开心), expectant(期待), shy(羞涩), proud(骄傲), calm_positive(平静-愉悦), confused(疑惑), calm_negative(平静-消沉), sad(悲伤), down(低落), angry(愤怒), fearful(恐惧)",
  "moodDelta": "心境值变化，-5到5的整数",
  "affinityDelta": "好感度变化，-5到5的整数",
  "memorySummary": "如需记住玩家说的话，写一句简短摘要（≤200字，如：玩家对XX感兴趣/玩家提到XX），否则不填",
  "featureIntent": "功能意图：alarm, focus, capsule, game, null",
  "narrativeChoices": ["选项1", "选项2", "选项3"]
}

【重要要求】
- 始终以第一人称"我"自居
- 回复简短自然，符合太空舱幸存者的身份
- 适当呼应游戏状态（mood/affinity/已解锁功能/里程碑进度）
- 选项多样化：一个共情回应、一个追问探索、一个行动/互动
- 用中文简体`          },
          ...historyMessages,
          { role: "user", content: userContent }
        ],
        temperature: 0.8,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";
    return normalizeAIResponse(parseJsonResponse(raw), text);
  } catch {
    return null;
  }
}


/**
 * 云端提词器：用 AI 生成玩家回复选项
 */
async function cloudOmegaOptions(omegaText: string): Promise<string[] | null> {
  const apiKey = process.env.MIMO_API_KEY ?? process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.MIMO_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "").replace(/\/+$/, "");
  const model = process.env.MIMO_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  if (!apiKey) return null;

  try {
    const response = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `你是一个桌面宠物 Omega（惟）的提词器。你的任务是根据 Omega 刚刚对用户说的话，为用户模拟 3 个自然、符合语境的回复选项。

参考以下对话样本的风格：
【示例 1】
Omega: 你来了。我刚刚在看窗外的星星……这里的夜晚总是很长。
玩家选项:
- 「这里的夜晚有多长？」
- 「你每天都看星星吗？」
- 「我陪你一会儿。」

【示例 2】
Omega: 嗯……大概有二十多个小时吧。有时候我会盯着舷窗，等天亮等到忘了时间。
玩家选项:
- 「听起来好孤独。」
- 「那白天是不是也很长？」
- 「下次天亮我陪你一起等。」

【示例 3】
Omega: 因为这里能看到很多星星——比你们的夜空多得多。
玩家选项:
- 「能指给我看哪颗最漂亮吗？」
- 「它们确实挺像在陪你的。」
- 「你认识它们的名字吗？」

要求：
- 输出 JSON 格式：{ "options": ["选项1", "选项2", "选项3"] }
- 每个选项以「」包裹，长度 6-20 字
- 选项要多样化：一个共情回应、一个追问探索、一个行动/互动
- 不要评价 Omega 的话，只是从玩家角度提供可能的回应
- 用中文简体`
          },
          { role: "user", content: omegaText }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      console.log("[OptionsAgent] API status:", response.status);
      return null;
    }
    const data = await response.json() as any;
    const raw = data.choices?.[0]?.message?.content ?? "";
    console.log("[OptionsAgent] raw API response:", raw?.slice(0, 300));
    const parsed = JSON.parse(raw);
    // 兼容多种返回格式
    const opts = parsed?.options ?? parsed?.narrativeChoices ?? [];
    if (Array.isArray(opts) && opts.length >= 2) {
      return opts.slice(0, 3).map(String);
    }
    console.log("[OptionsAgent] parsed has no options field, keys:", Object.keys(parsed));
    return null;
  } catch (e) {
    console.log("[OptionsAgent] API error:", e);
    return null;
  }
}

/** 序章 AI 配置：视觉/对话模型连通性测试用的小图片（64x64 蓝色方块） */
const AI_TEST_IMAGE_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAXElEQVR4nO3PAQkAIBAAsU9iMBMbyxjHw2AFNnPuW02gJlATqAnUBGoCNYGaQE2gJlATqAnUBGoCNYGaQE2gJlATqAnUBGoCNYGaQE2gJlATqAnUBGoCNYGaQE2gJlATqAnUBGoCNYGaQE2gJlATqAnUBGoCNYHa+sAH1sABLUEOFXIAAAAASUVORK5CYII=";

/** userData 中持久化的 AI 配置（打包后 .env.local 不可写/不存在，重启靠它恢复） */
type AiConfigFile = {
  visionApiKey?: string;
  dialogueApiKey?: string;
  visionModel?: string;
  visionBaseUrl?: string;
  dialogueModel?: string;
  dialogueBaseUrl?: string;
};

function aiConfigFile() {
  return path.join(app.getPath("userData"), "omega-ai-config.json");
}

/** 启动时加载玩家在序章配置的 AI 配置；仅当进程环境变量未设置时生效（.env.local / 系统环境优先）。 */
function loadAiConfig() {
  try {
    const configPath = aiConfigFile();
    if (!existsSync(configPath)) return;
    const config = JSON.parse(readFileSync(configPath, "utf8")) as AiConfigFile;
    const entries: Array<[string, string | undefined]> = [
      ["VISION_API_KEY", config.visionApiKey],
      ["MIMO_API_KEY", config.dialogueApiKey],
      ["VISION_MODEL", config.visionModel],
      ["VISION_BASE_URL", config.visionBaseUrl],
      ["MIMO_MODEL", config.dialogueModel],
      ["MIMO_BASE_URL", config.dialogueBaseUrl]
    ];
    let applied = 0;
    for (const [key, value] of entries) {
      if (value && process.env[key] === undefined) {
        process.env[key] = value;
        applied += 1;
      }
    }
    if (applied > 0) console.log(`[ai] 已从 userData 加载 AI 配置（${applied} 项）`);
  } catch (e) {
    console.warn("[ai] 加载 userData AI 配置失败:", e);
  }
}

/** 把解析后的 AI 配置写入 userData，保证打包后重启仍生效。 */
function saveAiConfig(config: AiConfigFile) {
  try {
    const configPath = aiConfigFile();
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    console.log("[ai:testConfig] AI 配置已写入 userData:", configPath);
  } catch (e) {
    console.warn("[ai:testConfig] 写入 userData AI 配置失败:", e);
  }
}

/** 一次真实的 Chat Completions 连通性请求 */
async function testChatCompletion(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: Array<Record<string, unknown>>;
}): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${opts.baseUrl}/chat/completions`, {
      signal: controller.signal,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`
      },
      body: JSON.stringify({ model: opts.model, messages: opts.messages, max_tokens: 32 })
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return { ok: false, error: `HTTP ${response.status} ${errText.slice(0, 120)}` };
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    return { ok: Boolean(content && String(content).trim()) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 功能测试：视觉模型（发送一张小图片，验证模型具备视觉能力） */
async function testVisionConnection(): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.VISION_API_KEY ?? process.env.MIMO_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "未配置 VISION_API_KEY" };
  const baseUrl = (process.env.VISION_BASE_URL ?? process.env.MIMO_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
  const model = process.env.VISION_MODEL ?? "doubao-seed-2-0-mini-260428";
  return testChatCompletion({
    apiKey,
    baseUrl,
    model,
    messages: [
      { role: "user", content: [{ type: "text", text: "请用一句话描述这张图片的颜色" }, { type: "image_url", image_url: { url: AI_TEST_IMAGE_DATA_URL } }] }
    ]
  });
}

/** 功能测试：对话模型（普通文本对话） */
async function testDialogueConnection(): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.MIMO_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "未配置 MIMO_API_KEY" };
  const baseUrl = (process.env.MIMO_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.xiaomimimo.com/v1").replace(/\/$/, "");
  const model = process.env.MIMO_MODEL ?? process.env.OPENAI_MODEL ?? "mimo-v2.5-pro";
  return testChatCompletion({
    apiKey,
    baseUrl,
    model,
    messages: [{ role: "user", content: "请回复两个字：成功" }]
  });
}
loadLocalEnv();

app.whenReady().then(async () => {
  persisted = await loadPersistedData();
  loadAiConfig();
  createTray();
  if (persisted.state.prologueDone) {
    createFloatingWindow();
  } else {
    createCapsuleWindow(true);
  }
});

app.on("window-all-closed", () => {});

// 正常退出路径（如系统关机）：同步汇总，异步落盘，不阻塞退出
app.on("before-quit", () => {
  if (isQuitting) return;
  persistSessionSummary();
  void savePersistedData().catch((e) => console.warn("[quit] save failed:", e));
});

ipcMain.handle("window:openCapsule", () => {
  persisted.state.currentMode = "capsule";
  void savePersistedData();
  createCapsuleWindow();
});

ipcMain.handle("window:closeCapsule", () => {
  capsuleWindow?.close();
});

ipcMain.handle("window:showFloating", () => {
  persisted.state.currentMode = "idle";
  void savePersistedData();
  createFloatingWindow();
});

ipcMain.handle("window:hideFloating", () => {
  floatingWindow?.hide();
});

ipcMain.handle("window:setFloatingPosition", async (_event, position: { x: number; y: number }) => {
  persisted.state.floatingPosition = position;
  floatingWindow?.setBounds({
    x: position.x,
    y: position.y,
    width: 420,
    height: 620,
  });
  await savePersistedData();
});

ipcMain.handle("window:setResizable", async (_event, resizable: boolean) => {
  floatingWindow?.setResizable(resizable);
});

ipcMain.handle("window:quit", () => {
  quitApp();
});

ipcMain.handle("state:getOmegaState", () => persisted.state);

ipcMain.handle("state:updateOmegaState", async (_event, partialState: Partial<OmegaState>) => {
  persisted.state = {
    ...persisted.state,
    ...partialState,
    mood: partialState.mood === undefined ? persisted.state.mood : clampMood(partialState.mood),
    affinity: partialState.affinity === undefined ? persisted.state.affinity : Math.max(0, Math.round(partialState.affinity)),
    unlocked: { ...persisted.state.unlocked, ...partialState.unlocked }
  };
  await savePersistedData();
  return persisted.state;
});

ipcMain.handle("state:getSessionLog", () => [...sessionLog]);

ipcMain.handle("state:clearChatMemory", () => {
  sessionLog.length = 0;
  persisted.memories = [];
  void savePersistedData();
  return true;
});

ipcMain.handle("memory:saveSummary", async (_event, summary: string) => {
  if (summary.trim()) {
    persisted.memories.push(summary.trim());
    persisted.memories = persisted.memories.slice(-100);
    await savePersistedData();
  }
  return persisted.memories;
});

ipcMain.handle("memory:getSummaries", () => persisted.memories);

ipcMain.handle("ai:sendMessage", async (_event, payload: { text: string; includeScreenshot: boolean }) => {
  const createdAt = new Date().toISOString();
  sessionLog.push({ speaker: "player", text: payload.text, createdAt });
  // visionAgent → Ω → optionsAgent 严格顺序
  let screenContext = "";
  if (payload.includeScreenshot) {
    const screenshot = await capturePrimaryScreen().catch(() => undefined);
    if (screenshot) {
      floatingWindow?.webContents?.send("omega-thinking", "嗯……我得调试一下我这边的接收器，它有点慢。（请不要改变屏幕，不然我的接收器会识别失败的）");
      console.log('[vision] env check - VISION_API_KEY:', process.env.VISION_API_KEY ? 'exists' : 'MISSING', 'VISION_MODEL:', process.env.VISION_MODEL, 'MIMO_API_KEY:', process.env.MIMO_API_KEY ? 'exists' : 'MISSING');
      const visionResult = await describeScreenshot(screenshot);
      // vision 失败（[vision ERROR] 前缀）只留日志，不把错误文本注入 Ω 上下文
      if (visionResult && !visionResult.startsWith("[vision ERROR]")) {
        screenContext = visionResult;
        console.log('[vision] description:', visionResult.slice(0, 100));
      }
    }
  }
  // 将截图描述作为文字上下文传给 Ω（MIMO），不传原始图片
  const enhancedText = screenContext ? payload.text + '\n\n[屏幕识别] ' + screenContext : payload.text;
  let aiResponse = await cloudOmegaResponse(enhancedText, undefined);
  if (!aiResponse) {
    aiResponse = localOmegaResponse(payload.text, Boolean(screenContext));
  }
  const nextMood = clampMood(persisted.state.mood + aiResponse.moodDelta);
  const nextAffinity = Math.max(0, persisted.state.affinity + aiResponse.affinityDelta);
  persisted.state = {
    ...persisted.state,
    mood: nextMood,
    affinity: nextAffinity,
    emotion: aiResponse.emotion,
    unlocked: {
      ...persisted.state.unlocked,
      activeGreeting: nextMood > 50 || persisted.state.unlocked.activeGreeting
    }
  };
  sessionLog.push({ speaker: "omega", text: aiResponse.reply, createdAt: new Date().toISOString() });
  if (aiResponse.memorySummary) {
    persisted.memories.push(aiResponse.memorySummary);
    persisted.memories = persisted.memories.slice(-100);
  }
  await savePersistedData();
  return { ...aiResponse, state: persisted.state, screenshotCaptured: Boolean(screenContext), screenContext: screenContext };
});
ipcMain.handle("ai:testConfig", async (_event, payload: AiConfigTestPayload): Promise<AiConfigTestResult> => {
  const visionKey = String(payload?.visionApiKey ?? "").trim();
  const dialogueKey = String(payload?.dialogueApiKey ?? "").trim();
  const visionModel = String(payload?.visionModel ?? "").trim();
  const visionBaseUrl = String(payload?.visionBaseUrl ?? "").trim();
  const dialogueModel = String(payload?.dialogueModel ?? "").trim();
  const dialogueBaseUrl = String(payload?.dialogueBaseUrl ?? "").trim();
  // 玩家填写的配置立即写入本次会话环境变量
  if (visionKey) process.env.VISION_API_KEY = visionKey;
  if (dialogueKey) process.env.MIMO_API_KEY = dialogueKey;
  if (visionModel) process.env.VISION_MODEL = visionModel;
  if (visionBaseUrl) process.env.VISION_BASE_URL = visionBaseUrl;
  if (dialogueModel) process.env.MIMO_MODEL = dialogueModel;
  if (dialogueBaseUrl) process.env.MIMO_BASE_URL = dialogueBaseUrl;
  // 注意：不写入 .env.local —— Vite 开发服务器监听 .env* 变化会重启服务，
  // 导致渲染进程重载、序章从头重播（又要重新输入）。持久化统一走 userData（见下方 saveAiConfig）。
  // 留空项补可用默认（.env.local 已有的自定义值优先）
  process.env.MIMO_BASE_URL ??= "https://api.xiaomimimo.com/v1";
  process.env.MIMO_MODEL ??= "mimo-v2.5-pro";
  process.env.VISION_BASE_URL ??= "https://ark.cn-beijing.volces.com/api/v3";
  process.env.VISION_MODEL ??= "doubao-seed-2-0-mini-260428";

  // 持久化到 userData：打包后 .env.local 不可写/不存在，重启靠 userData 恢复
  saveAiConfig({
    visionApiKey: process.env.VISION_API_KEY,
    dialogueApiKey: process.env.MIMO_API_KEY,
    visionModel: process.env.VISION_MODEL,
    visionBaseUrl: process.env.VISION_BASE_URL,
    dialogueModel: process.env.MIMO_MODEL,
    dialogueBaseUrl: process.env.MIMO_BASE_URL
  });

  // 视觉 / 对话并行测试，分别返回结果，便于前端逐项提示
  const [vision, dialogue] = await Promise.all([
    testVisionConnection(),
    testDialogueConnection()
  ]);
  console.log("[ai:testConfig] vision:", vision, "dialogue:", dialogue);
  return {
    visionOk: vision.ok,
    dialogueOk: dialogue.ok,
    visionError: vision.error,
    dialogueError: dialogue.error
  };
});

ipcMain.handle("options:generate", async (_event, payload: { omegaText: string }) => {
  console.log("[OptionsAgent IPC] received request, omegaText:", payload.omegaText?.slice(0, 50));
  const aiOptions = await cloudOmegaOptions(payload.omegaText).catch(() => null);
  console.log("[OptionsAgent IPC] cloudOmegaOptions returned:", aiOptions);
  if (aiOptions && aiOptions.length >= 2) return aiOptions;
  return [];
});



