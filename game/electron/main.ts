import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, nativeImage, Tray } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type OmegaEmotion =
  | "calm_positive"
  | "calm_negative"
  | "happy"
  | "shy"
  | "sad"
  | "proud"
  | "excited"
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
    state: { ...defaultState, ...parsed.state, unlocked: { ...defaultState.unlocked, ...parsed.state?.unlocked } },
    memories: Array.isArray(parsed.memories) ? parsed.memories : []
  };
}

async function savePersistedData() {
  await writeFile(stateFile(), JSON.stringify(persisted, null, 2), "utf8");
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
  floatingWindow.webContents.openDevTools({ mode: "detach" });
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
    transparent: true,
    backgroundColor: "#00000000",
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
    if (persisted.state.prologueDone && !floatingWindow) {
      createFloatingWindow();
    }
  });
  return capsuleWindow;
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("Ω Desktop Pet");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示悬浮窗", click: () => createFloatingWindow() },
      { label: "隐藏悬浮窗", click: () => { if (floatingWindow) floatingWindow.hide(); } },
      { label: "打开太空舱", click: () => createCapsuleWindow() },
      { type: "separator" },
      { label: "退出游戏", click: () => app.quit() }
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
  const featureIntent = inferFeatureIntent(text);
  const emotion: OmegaEmotion = sad ? "sad" : happy ? "happy" : featureIntent === "capsule" ? "proud" : "calm_positive";
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
              ? `我听见了。太空舱安静得有些过分，所以我知道那种不太好受的感觉。你可以慢慢说，我会在这里。${screenNote}`
              : happy
                ? `嗯，我也有一点开心。像是舱壁上的灯忽然稳定了一些。${screenNote}`
                : `我在。你说的话会被我认真收起来，虽然我还不太擅长把感谢说得自然。${screenNote}`;

      const nChoices = sad
    ? ["???????", "???????", "??????", "????????"]
    : happy
      ? ["?????????", "?????????", "?????????", "?????"]
      : featureIntent === "capsule"
        ? ["????????", "???????", "???????", "??????"]
        : ["???????", "???????", "????????", "??????"]

  return {
    reply,
    emotion,
    moodDelta: sad ? -1 : 1,
    affinityDelta: sad ? 0 : 1,
    memorySummary: text.length > 8 ? `?????${text.slice(0, 80)}` : undefined,
    featureIntent
  };
}

async function capturePrimaryScreen() {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1280, height: 720 }
  });
  return sources[0]?.thumbnail.toDataURL();
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
  const allowedEmotions: OmegaEmotion[] = ["calm_positive", "calm_negative", "happy", "shy", "sad", "proud", "excited", "fearful"];
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

  // Build conversation history from sessionLog (last 6 turns = 12 messages)
  const historyMessages: Array<Record<string, unknown>> = sessionLog.slice(-12).map((entry) => ({
    role: entry.speaker === "omega" ? "assistant" : "user",
    content: entry.speaker === "omega" ? entry.text : entry.text
  }));

  const memoryContext = persisted.memories.length > 0
    ? "??????\n" + persisted.memories.slice(-5).join("\n")
    : "";

  const userContent: Array<Record<string, unknown>> = [
    { type: "text", text: memoryContext },
    { type: "text", text: "????" + text },
    { type: "text", text: "????????? narrativeChoices?2-4???????????????????????????" }
  ];

  if (screenshot) {
    userContent.push({ type: "text", text: "???????????????????????????????????" });
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
              "???????????????????????????????????JSON???Markdown???? reply, emotion, moodDelta, affinityDelta, memorySummary, featureIntent, narrativeChoices?emotion??? calm_positive, calm_negative, happy, shy, sad, proud, excited, fearful?featureIntent??? alarm, focus, capsule, game, null?"
          },
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

    if (!response.ok) return null;
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw);
    if (parsed?.options && Array.isArray(parsed.options) && parsed.options.length >= 2) {
      return parsed.options.slice(0, 3).map(String);
    }
    return null;
  } catch {
    return null;
  }
}

loadLocalEnv();

app.whenReady().then(async () => {
  persisted = await loadPersistedData();
  createTray();
  if (persisted.state.prologueDone) {
    createFloatingWindow();
  } else {
    createCapsuleWindow(true);
  }
});

app.on("window-all-closed", () => {});

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
  floatingWindow?.setPosition(position.x, position.y);
  await savePersistedData();
});

ipcMain.handle("window:quit", () => {
  app.quit();
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
  const screenshot = payload.includeScreenshot ? await capturePrimaryScreen().catch(() => undefined) : undefined;
  const aiResponse = (await cloudOmegaResponse(payload.text, screenshot)) ?? localOmegaResponse(payload.text, Boolean(screenshot));
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
  return { ...aiResponse, state: persisted.state, screenshotCaptured: Boolean(screenshot) };
});
/**
 * 提词器 Agent：本地生成三个回复选项
 * 根据 Ω 的发言文本 + 游戏状态启发式生成
 */

ipcMain.handle("options:generate", async (_event, payload: { omegaText: string }) => {
  const aiOptions = await cloudOmegaOptions(payload.omegaText).catch(() => null);
  if (aiOptions && aiOptions.length >= 2) return aiOptions;
  return [];
});
