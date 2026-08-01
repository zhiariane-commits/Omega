# Ω 桌面宠物 · 项目宪法

> 本文件是项目的“宪法”：任何代码改动（人工或 AI 代理）都必须遵守。修改本文件需谨慎；`AGENTS.md` 为唯一规范源，`CLAUDE.md` 与其内容保持一致，`.cursor/rules/omega.mdc` 为其速览引用。

## 一、项目目标与范围

### 目标

本项目实现《设计文档/整体效果预估案.doc》所描述的桌面宠物 **Ω（Omega）** 的**可玩原型**。核心价值：

- 一个驻留桌面的 Live2D 宠物：悬浮窗 + 太空舱（2D 房间）双窗口形态，双窗口状态实时同步。
- 情感模拟：心境值（15–1000）、好感度、11 种情绪、待机行为概率池、被动增长（在线 tick / 离线补算 / 装饰加成）。
- 叙事与养成：M0 序幕 → M1 打招呼 → M2 清扫太空舱 → 看世界 → 童年记忆 → 扩建 → 游戏 → 书橱写作 的主线里程碑与分支对话树。
- AI 交互：OpenAI-compatible（默认 MIMO）Chat Completions 驱动聊天，支持屏幕截图识别（打碎第四面墙）；无密钥时自动降级本地 mock，保证离线可玩。
- 功能面板：输入 / 记录 / 事项（闹钟、游戏、专注模式）、合成机、装修、书架、房间 2。
- 状态持久化与跨窗口同步；提供浏览器调试模式（`src/browserBridge.ts`）支撑 E2E 测试。

### 不做什么（范围边界）

- 不做 Web / 服务端 / 数据库 / 多人在线：本项目是**本地桌面应用**，浏览器只是调试与测试载体。
- 不用 Next.js 或其他 SSR / 路由框架：渲染层保持 Vite + React SPA。
- 不做移动端、不做正式发行：Electron 是唯一交付形态。
- 不做正式美术与动画流水线：Live2D 表情/动作与 2D 场景以现有 `public/` 素材 + 占位为主。
- 不实现真实“游戏代打”（如原神自动操作）：“游戏”功能仅保留解锁条件与占位 UI。
- 不把 `game/README.md` 中“暂未实现”清单当作当前迭代目标：闹钟倒计时/专注累计时长、合成机/装修/扩建/书橱写作完整周期、主线 2 之后的完整剧情、正式美术资源。
- 不引入重型状态管理库（Redux/MobX 等）、不重写样式为 UI 框架（Tailwind 等）、不无理由重构既有目录与命名。

## 二、技术栈与规范

### 技术栈

| 层 | 选型 |
| --- | --- |
| 平台 | Electron ^39 + electron-builder（打包） |
| 渲染进程 | React ^19 + TypeScript ^5.9（`strict: true`） |
| 构建 / 开发 | Vite ^7（dev server + `/api/ai` 代理中间件） |
| 2D / 角色 | PixiJS ^6.5、pixi-live2d-display ^0.4、@greenmansk/react-live2d |
| 测试 | Playwright ^1.60（E2E，浏览器模式 + `omega.browser.forceMock=1`） |
| AI | OpenAI-compatible Chat Completions（默认 MIMO），视觉识别走 `VISION_*` |
| 包管理 | **npm**（存在 `game/package-lock.json`；不使用 pnpm） |

### 代码规范

- TypeScript `strict` 双工程：`tsconfig.json`（渲染进程 `src/`）、`tsconfig.node.json`（Electron `electron/`），两处都必须通过类型检查。
- 组件用函数组件 + hooks；纯逻辑放 `src/systems/`；共享类型集中在 `src/types.ts`；不要散落重复类型定义。
- 代码风格：2 空格缩进、双引号、行尾分号，与现有代码一致。当前**未配置** Prettier/ESLint/format 脚本，不得无谓大范围重排代码。
- UI 风格（依据设计文档）：科幻风、深色冷色调，机械 / 星际 / 赛博朋克元素需统一。
- 源文件一律 UTF-8；注释与用户可见文案使用中文。
- 环境变量：对话 `MIMO_API_KEY` / `MIMO_MODEL` / `MIMO_BASE_URL`（兼容 `OPENAI_*`）；视觉 `VISION_API_KEY` / `VISION_MODEL` / `VISION_BASE_URL`。配置位于 `game/.env.local`（当前被 Git 跟踪，提交时勿引入真实密钥）。

## 三、目录结构

```
omega/                                  # Git 仓库根（项目根）
├── AGENTS.md / CLAUDE.md / .cursor/    # 项目宪法（本文件）
├── game/                               # npm 工程：所有命令在此目录执行
│   ├── electron/
│   │   ├── main.ts                     # 主进程：窗口/托盘/IPC/持久化/AI 调用/截图
│   │   └── preload.ts                  # contextBridge 暴露 window.omega
│   ├── src/
│   │   ├── main.tsx                    # React 入口
│   │   ├── App.tsx                     # 视图路由（capsule/floating）+ 状态加载/心跳
│   │   ├── browserBridge.ts            # 浏览器调试模式：localStorage 版 window.omega
│   │   ├── types.ts                    # 共享类型 + window.omega 全局声明
│   │   ├── components/                 # UI 组件（悬浮窗/太空舱/序章/合成机/装修/书架/房间2等）
│   │   ├── systems/                    # 纯逻辑系统（心境/待机/叙事/合成/里程碑/音频等）
│   │   └── styles/app.css              # 全局样式
│   ├── public/                         # 静态资源：live2d 模型与表情、太空舱背景、待机贴图
│   ├── tests/e2e/                      # Playwright 用例（omega-prototype.spec.ts）
│   ├── scripts/                        # 一次性工具脚本（如去白底）
│   ├── index.html / vite.config.ts / tsconfig*.json / playwright.config.ts
│   ├── package.json / package-lock.json
│   └── 启动游戏.bat                    # 双击启动（等价 npm run dev）
├── 设计文档/                           # 玩法设计稿（.gitignore，不提交）
├── 新建文件夹 美工/                    # 美术源文件（.gitignore，不提交）
├── .gitignore / body.png 等            # 根目录历史遗留物
```

关键映射：

- `src/components/FloatingWindow.tsx` — 悬浮窗（气泡菜单、聊天输入与 Ω 回复气泡、提词器选项、本次记录、闹钟、专注模式）。
- `src/components/CapsuleWindow.tsx` / `CapsuleScene.tsx` — 太空舱窗口与 PixiJS 2D 场景（WASD 移动、书桌、床、书架、装修、合成机）。
- `src/components/M0Prologue.tsx` — 序幕：黑场白字、昵称输入（启动后不可更改）。
- `src/components/Live2DModel.tsx` — Live2D 模型加载与情绪表情封装。
- `src/systems/passiveMood.ts` — 心境值被动增长（在线 tick / 离线补算 / 装饰加成）。
- `src/systems/idleBehavior.ts` — 待机行为概率池（发呆/看书/写作/浇花/木牌等）。
- `src/systems/narrative.ts` — 分支对话树；`storyMilestones.ts` — 主线里程碑；`crafting.ts` — 合成配方表；`optionAgent.ts` — 玩家回复选项。

## 四、工作流程

所有 npm 命令都在 `game/` 目录下执行（`cd game`）。

### 开发

- `npm run dev` — 编译 Electron 主进程并同时启动 Vite（127.0.0.1:5173）与 Electron 窗口；也可双击 `game/启动游戏.bat`。
- 浏览器调试：单独运行 Vite 后访问 http://127.0.0.1:5173 （由 `browserBridge.ts` 接管 `window.omega`）。

### 每次修改后必做（强制性）

1. `npm run typecheck` — 渲染进程 + Electron 双工程类型检查，**任何代码修改后必须通过**。
2. 涉及交互/流程改动：`npm run test:e2e` — Playwright 基线用例（先 `build` 再 `preview` 于 4173 端口）。
3. 涉及构建/打包产物：`npm run build` 通过后再交付。
4. 涉及 Electron 表现：用 `npm run dev` 手工过一遍悬浮窗与太空舱窗口。

### 提交规范

- 提交前执行 `git status`，确认未误提交：`设计文档/`、`新建文件夹 美工/`、`node_modules/`、`dist/`、`dist-electron/`、`*.log`、`playwright-report/`、`test-results/`、`.env.local` 中的真实密钥。
- 提交信息用中文、动词开头，参照现有 git log 风格：`update: ...`、`fix: ...`、`chore: ...`。

## 五、变更同步检查清单

改动类型 / 状态字段 / IPC 时，必须同步以下所有位置：

- 类型定义：`src/types.ts` ↔ `electron/main.ts`（内联类型）↔ `electron/preload.ts` ↔ `src/browserBridge.ts` ↔ `vite.config.ts` 的类型注解。
- 默认状态：`electron/main.ts`（defaultState）、`src/browserBridge.ts`（defaultState）、`src/App.tsx`（fallbackState）三处需一致。
- IPC：新增能力时在 `electron/main.ts` 注册 `ipcMain.handle` → `electron/preload.ts` 暴露 → `src/types.ts` 补 `window.omega` 声明 → `src/browserBridge.ts` 提供浏览器版实现。
- 资源：图片/Live2D 素材统一放 `game/public/`，以相对路径引用，勿引用 gitignored 目录（`设计文档/`、`新建文件夹 美工/`）。
- 对话展示约定（现状，以代码为准）：聊天面板仅展示 Ω 当前回复气泡（打字机效果）与提词器回复选项；完整会话历史在“记录”面板查看（`sessionLog` 以单次启动为周期刷新，不跨启动持久化）；`recentLines = sessionLog.slice(-5)` 仅作为提词器选项的显隐条件。调整对话展示逻辑时须同步更新 `game/README.md`“已实现范围”。

## 六、测试与验收

- E2E 基线：`game/tests/e2e/omega-prototype.spec.ts` 覆盖序幕、悬浮窗气泡、聊天、心境/好感变化、太空舱 PixiJS 场景。
- 验收标准：设计文档《整体效果预估案.doc》是玩法依据；改动不得破坏已实现范围（见 `game/README.md`“已实现范围”）。