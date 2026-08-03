// NOTE: keep type definitions in sync with src/types.ts
import type { OmegaEmotion, FeatureIntent, OmegaAIResponse } from "./src/types";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const envPath = path.join(process.cwd(), fileName);
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

function readJsonBody(request: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function inferFeatureIntent(text: string): FeatureIntent {
  if (/太空舱|舱/.test(text)) return "capsule";
  if (/专注|学习|工作/.test(text)) return "focus";
  if (/闹钟|提醒|叫我|计时/.test(text)) return "alarm";
  if (/游戏|原神|每日|体力/.test(text)) return "game";
  return null;
}

function parseJsonResponse(raw: string): Partial<OmegaAIResponse> | null {
  try {
    return JSON.parse(raw) as Partial<OmegaAIResponse>;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Partial<OmegaAIResponse>;
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

async function handleAiRequest(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") {
    response.writeHead(405).end();
    return;
  }

  loadLocalEnv();
  const apiKey = process.env.MIMO_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Missing MIMO_API_KEY" }));
    return;
  }

  try {
    const body = await readJsonBody(request);
    const text = String(body.text ?? "");
    const memories = Array.isArray(body.memories) ? body.memories.map(String).slice(-8) : [];
    const mood = Number.isFinite(Number(body.mood)) ? Number(body.mood) : 100;
    const affinity = Number.isFinite(Number(body.affinity)) ? Number(body.affinity) : 0;
    const baseUrl = (process.env.MIMO_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.xiaomimimo.com/v1").replace(/\/$/, "");
    const model = process.env.MIMO_MODEL ?? process.env.OPENAI_MODEL ?? "mimo-v2-flash";
    const aiResponse = await fetch(`${baseUrl}/chat/completions`, {
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
              `你是桌面宠游戏角色惟。用中文、简短、内向但温柔的语气回应玩家。不要总是重复同一句话，要根据玩家输入和记忆变化措辞。当前状态：心境值 mood=${mood}（15–1000，以 200 为界），好感度 affinity=${affinity}。mood>=200 时发言更积极乐观、情绪更稳定、少提自身经历；mood<200 时发言与自身经历相关性更高，可自然提及太空舱与孤独处境。affinity 越高越愿意追问玩家话题、开温和玩笑；察觉玩家情绪低落时先共情再主动安慰。玩家分享开心事/风景/有趣故事时，必须表现出真实感兴趣并追问细节。必须只返回JSON，不要Markdown。字段为 reply, emotion, moodDelta, affinityDelta, memorySummary, featureIntent。emotion只能是 happy(开心), expectant(期待), shy(羞涩), proud(骄傲), calm_positive(平静-愉悦), confused(疑惑), calm_negative(平静-消沉), sad(悲伤), down(低落), angry(愤怒), fearful(恐惧)。featureIntent只能是 alarm, focus, capsule, game, null。`
          },
          {            content: `📝 相关记忆：${memories.join(" / ") || "暂无"}\n【玩家说】${text}\n请根据对话内容生成 narrativeChoices（2-4个玩家回复选项）。要求：每个选项以「」形式、长度6-20字；多样化：一个共情回应、一个追问探索、一个行动/互动；不要评价Ω的话，从玩家角度提供回应。`
          }
        ],
        temperature: 0.9,
        response_format: { type: "json_object" }
      })
    });

    if (!aiResponse.ok) {
      response.writeHead(aiResponse.status, { "Content-Type": "application/json" });
      response.end(await aiResponse.text());
      return;
    }

    const data = (await aiResponse.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const normalized = normalizeAIResponse(parseJsonResponse(raw), text);
    if (!normalized) {
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Invalid model response", raw }));
      return;
    }

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(normalized));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }));
  }
}

/** 序章 AI 配置：连通性测试用的小图片（64x64 蓝色方块） */
const AI_TEST_IMAGE_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAXElEQVR4nO3PAQkAIBAAsU9iMBMbyxjHw2AFNnPuW02gJlATqAnUBGoCNYGaQE2gJlATqAnUBGoCNYGaQE2gJlATqAnUBGoCNYGaQE2gJlATqAnUBGoCNYGaQE2gJlATqAnUBGoCNYGaQE2gJlATqAnUBGoCNYHa+sAH1sABLUEOFXIAAAAASUVORK5CYII=";

/** 把玩家输入的 API KEY 写入 game/.env.local（已被 .gitignore 忽略），重启后仍生效 */
function persistAiKeys(visionApiKey: string, dialogueApiKey: string) {
  const envPath = path.join(process.cwd(), ".env.local");
  try {
    const lines = existsSync(envPath) ? readFileSync(envPath, "utf8").split(/\r?\n/) : [];
    const keyEntries: Array<[string, string]> = [
      ["MIMO_API_KEY", dialogueApiKey],
      ["VISION_API_KEY", visionApiKey]
    ];
    // 未配置时补充可用的默认接入（模型名/Base URL），保证重启后聊天与屏幕识别可用
    const defaultEntries: Array<[string, string]> = [
      ["MIMO_MODEL", "mimo-v2.5-pro"],
      ["MIMO_BASE_URL", "https://api.xiaomimimo.com/v1"],
      ["VISION_MODEL", "doubao-seed-2-0-mini-260428"],
      ["VISION_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"]
    ];
    const hasKey = (key: string) => lines.some((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("#") && trimmed.split("=")[0]?.trim() === key;
    });
    const upsert = (key: string, value: string) => {
      const idx = lines.findIndex((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith("#") && trimmed.split("=")[0]?.trim() === key;
      });
      if (idx >= 0) lines[idx] = `${key}=${value}`;
      else lines.push(`${key}=${value}`);
    };
    for (const [key, value] of keyEntries) upsert(key, value);
    for (const [key, value] of defaultEntries) {
      if (!hasKey(key)) lines.push(`${key}=${value}`);
    }
    writeFileSync(envPath, lines.join("\n") + "\n", "utf8");
  } catch (error) {
    console.warn("[ai/test] 写入 .env.local 失败:", error);
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
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 浏览器调试模式下的 AI 连通性测试（与 Electron 主进程 ai:testConfig 行为一致） */
async function handleAiTestRequest(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") {
    response.writeHead(405).end();
    return;
  }
  loadLocalEnv();
  try {
    const body = await readJsonBody(request);
    const visionApiKey = String(body.visionApiKey ?? "").trim();
    const dialogueApiKey = String(body.dialogueApiKey ?? "").trim();
    if (visionApiKey) process.env.VISION_API_KEY = visionApiKey;
    if (dialogueApiKey) process.env.MIMO_API_KEY = dialogueApiKey;
    if (visionApiKey || dialogueApiKey) persistAiKeys(visionApiKey, dialogueApiKey);

    // 未配置时补充可用的默认接入（.env.local 已有的自定义值优先）
    process.env.MIMO_BASE_URL ??= "https://api.xiaomimimo.com/v1";
    process.env.MIMO_MODEL ??= "mimo-v2.5-pro";
    process.env.VISION_BASE_URL ??= "https://ark.cn-beijing.volces.com/api/v3";
    process.env.VISION_MODEL ??= "doubao-seed-2-0-mini-260428";

    const visionBaseUrl = (process.env.VISION_BASE_URL ?? process.env.MIMO_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
    const visionModel = process.env.VISION_MODEL ?? "doubao-seed-2-0-mini-260428";
    const visionKey = process.env.VISION_API_KEY ?? process.env.MIMO_API_KEY ?? process.env.OPENAI_API_KEY;
    const dialogueBaseUrl = (process.env.MIMO_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.xiaomimimo.com/v1").replace(/\/$/, "");
    const dialogueModel = process.env.MIMO_MODEL ?? process.env.OPENAI_MODEL ?? "mimo-v2.5-pro";
    const dialogueKey = process.env.MIMO_API_KEY ?? process.env.OPENAI_API_KEY;

    const [vision, dialogue] = await Promise.all([
      visionKey
        ? testChatCompletion({
            apiKey: visionKey,
            baseUrl: visionBaseUrl,
            model: visionModel,
            messages: [
              { role: "user", content: [{ type: "text", text: "请用一句话描述这张图片的颜色" }, { type: "image_url", image_url: { url: AI_TEST_IMAGE_DATA_URL } }] }
            ]
          })
        : Promise.resolve({ ok: false, error: "未配置 VISION_API_KEY" }),
      dialogueKey
        ? testChatCompletion({
            apiKey: dialogueKey,
            baseUrl: dialogueBaseUrl,
            model: dialogueModel,
            messages: [{ role: "user", content: "请回复两个字：成功" }]
          })
        : Promise.resolve({ ok: false, error: "未配置 MIMO_API_KEY" })
    ]);

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      visionOk: vision.ok,
      dialogueOk: dialogue.ok,
      visionError: vision.error,
      dialogueError: dialogue.error
    }));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      visionOk: false,
      dialogueOk: false,
      visionError: error instanceof Error ? error.message : "Unknown error",
      dialogueError: error instanceof Error ? error.message : "Unknown error"
    }));
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "omega-ai-proxy",
      configureServer(server) {
        server.middlewares.use("/api/ai/test", handleAiTestRequest);
        server.middlewares.use("/api/ai", handleAiRequest);
      },
      configurePreviewServer(server) {
        server.middlewares.use("/api/ai/test", handleAiTestRequest);
        server.middlewares.use("/api/ai", handleAiRequest);
      }
    }
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
