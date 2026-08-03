# Ω Desktop Pet Prototype

这是根据两份设定文档落地的首版桌宠原型，技术栈为 Electron + React + PixiJS。

## 运行

```bash
npm install
npm run dev
```

生产构建检查：

```bash
npm run typecheck
npm run build
npm run test:e2e
npm start
```

## AI 配置

没有环境变量时，应用自动降级为本地模式：聊天使用本地人格回复、提词器不生成 AI 选项、屏幕识别不可用，保证离线可玩（E2E 使用 `omega.browser.forceMock=1`，无需密钥）。

需要真实 AI 效果时，把 `game/.env.local.example` 复制为 `game/.env.local`，填入自己的密钥：

```bash
# 对话（Ω 聊天 + 提词器）—— 默认 MIMO（OpenAI-compatible）
MIMO_API_KEY=你的_key
MIMO_MODEL=mimo-v2.5-pro
MIMO_BASE_URL=https://api.xiaomimimo.com/v1

# 屏幕识别（视觉 agent）—— 火山方舟
VISION_API_KEY=你的_key
VISION_MODEL=doubao-seed-2-0-mini-260428
VISION_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

说明：

- `.env.local` 已被 `.gitignore` 忽略，不会随 Git 提交；请勿提交或外传真实密钥。
- 对话也可使用 `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL` 兼容其它供应商（优先级低于 `MIMO_*`）。
- 提示词按上述模型调优，使用其它模型时回复风格可能略有差异。
- 屏幕识别失败时只记录日志，不会把 `[vision ERROR]` 错误文本注入 Ω 上下文，聊天会正常降级继续。

启动：

```bash
npm run dev
```

## 已实现范围

- 首次启动进入太空舱序幕。
- 昵称输入与书桌引导。
- 完成序幕后打开透明置顶悬浮窗。
- 悬浮窗展示 Ω、心境值、好感度、情绪状态。
- 气泡菜单包含输入、记录、事项、太空舱。
- 聊天面板展示 Ω 当前回复气泡（打字机效果）与提词器回复选项；“记录”面板可查看本次启动的完整会话记录；支持记忆摘要与本地状态持久化。
- 对话策略随状态动态调整：心境值以 200 为界（≥200 时发言更积极乐观、情绪更稳定、少提自身经历；<200 时发言与自身经历相关性更高）；好感度越高越倾向追问话题与温和玩笑，察觉玩家情绪低落时先共情再主动安慰；玩家分享开心事/风景/有趣故事时始终表现出感兴趣。
- 聊天可勾选屏幕识别；截图失败时自动降级为纯文本。
- M3「看世界」触发后，悬浮窗「输入」气泡与输入界面「屏幕识别」选项出现红点引导；输入界面打招呼气泡切换为 M3 引导文案，启用屏幕识别并完成一轮对话后视为完成，红点消失并恢复常规打招呼。
- M4「童年记忆」触发后，悬浮窗「输入」气泡出现红点引导；输入界面打招呼气泡切换为 M4 引导文案，完成一轮对话后视为完成，红点消失并恢复常规打招呼。
- 单击悬浮窗 Ω 时，在其左侧中央位置展示与当前情绪对应的贴图（资源位于 public/emotion-stickers/）。
- 太空舱使用 PixiJS 绘制占位 2D 房间、Ω角色、书桌交互范围与 WASD 移动。
- 太空舱内置书桌/合成机/书架三个交互气泡：书桌气泡可选「坐在书桌前」（坐下动作暂为占位，按方向键起身）或「前往悬浮窗」（关闭太空舱回到悬浮窗）；合成机与书架气泡分别打开与悬浮窗「事项」中相同的合成机、书架面板（书架完成 M7 后解锁完整内容）。气泡坐标集中在 `src/components/CapsuleScene.tsx` 顶部的 `CAPSULE_BUBBLE_POS` 参数，便于后续调整。

## 功能测试

测试用例位于 `tests/e2e/omega-prototype.spec.ts`，覆盖设定文档首版范围：

- 首次启动序幕与昵称输入。
- 悬浮窗根气泡和事项气泡。
- 聊天回复气泡、心境/好感变化、本次记录。
- 太空舱场景、PixiJS canvas、关闭后回到悬浮窗。

运行：

```bash
npm run test:e2e
```

## 暂未实现

- 正式美术资源和动作序列。
- 闹钟倒计时、专注累计时长。
- 合成机、装修、扩建、书架写作周期。
- 游戏代打能力。
- 主线 2 以后完整剧情。
