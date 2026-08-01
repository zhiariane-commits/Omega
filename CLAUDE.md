# CLAUDE.md

> Claude 入口文件。**规范源是根目录 `AGENTS.md`**，本文件与之一致；修改时请两处同步。下方内容对 Claude 与其他工具同等有效。

## 一、项目目标与范围

### 目标

本项目实现《设计文档/整体效果预估案.doc》所描述的桌面宠物 **Ω（Omega）** 的**可玩原型**：

- 驻留桌面的 Live2D 宠物：悬浮窗 + 太空舱（2D 房间）双窗口形态，状态实时同步。
- 情感模拟：心境值（15–1000）、好感度、11 种情绪、待机行为概率池、被动增长（在线 tick / 离线补算 / 装饰加成）。
- 叙事与养成：M0 序幕 → M1 打招呼 → M2 清扫太空舱 → 看世界 → 童年记忆 → 扩建 → 游戏 → 书橱写作 的主线里程碑与分支对话树。
- AI 交互：OpenAI-compatible（默认 MIMO）聊天 + 屏幕截图识别；无密钥时降级本地 mock。
- 功能面板：输入 / 记录 / 事项（闹钟、游戏、专注模式）、合成机、装修、书架、房间 2。

### 不做什么（范围边界）

- 不做 Web / 服务端 / 数据库 / 多人在线；浏览器只是调试与测试载体。
- 不用 Next.js 或其他 SSR / 路由框架；渲染层保持 Vite + React SPA。
- 不做移动端、不做正式发行；Electron 是唯一交付形态。
- 不做正式美术与动画流水线；Live2D 与 2D 场景以现有 `public/` 素材 + 占位为主。
- 不实现真实“游戏代打”（原神等自动操作）：“游戏”功能仅保留解锁条件与占位 UI。
- 不把 `game/README.md`“暂未实现”清单当作当前迭代目标（闹钟倒计时/专注累计、合成机/装修/扩建/书橱写作完整周期、主线 2 之后完整剧情、正式美术资源）。
- 不引入重型状态管理库、不重写样式为 UI 框架、不无理由重构既有目录与命名。

## 二、技术栈与规范

| 层 | 选型 |
| --- | --- |
| 平台 | Electron ^39 + electron-builder |
| 渲染进程 | React ^19 + TypeScript ^5.9（`strict: true`） |
| 构建 / 开发 | Vite ^7（dev server + `/api/ai` 代理中间件） |
| 2D / 角色 | PixiJS ^6.5、pixi-live2d-display ^0.4、@greenmansk/react-live2d |
| 测试 | Playwright ^1.60（E2E，浏览器模式 + `omega.browser.forceMock=1`） |
| AI | OpenAI-compatible Chat Completions（默认 MIMO），视觉识别走 `VISION_*` |
| 包管理 | **npm**（不使用 pnpm） |

规范要点：

- TypeScript `strict` 双工程：`tsconfig.json`（`src/`）+ `tsconfig.node.json`（`electron/`），都须通过类型检查。
- 函数组件 + hooks；纯逻辑放 `src/systems/`；共享类型集中在 `src/types.ts`。
- 风格：2 空格、双引号、分号，与现有代码一致；当前未配置 Prettier/ESLint/format 脚本。
- UI 风格：科幻风、深色冷色调，机械 / 星际 / 赛博朋克元素需统一。
- 源文件 UTF-8；注释与文案用中文。
- 环境变量：`MIMO_API_KEY` / `MIMO_MODEL` / `MIMO_BASE_URL`（兼容 `OPENAI_*`）、`VISION_API_KEY` / `VISION_MODEL` / `VISION_BASE_URL`，位于 `game/.env.local`（已被 Git 跟踪，勿提交真实密钥）。

## 三、目录结构

- 工程根在 `game/`（npm 工程，所有命令在此执行）。
- `game/electron/` — 主进程 `main.ts`、preload `preload.ts`（contextBridge → `window.omega`）。
- `game/src/` — React 渲染进程：`App.tsx`（capsule/floating 视图路由）、`browserBridge.ts`（浏览器调试模式）、`types.ts`（共享类型）、`components/`（UI）、`systems/`（纯逻辑）、`styles/app.css`。
- `game/public/` — 静态资源（live2d 模型与表情、太空舱背景、待机贴图）。
- `game/tests/e2e/` — Playwright 用例；`game/scripts/` — 工具脚本。
- 根目录 `设计文档/`（设计稿）、`新建文件夹 美工/`（美术源）均被 gitignore，不提交。

## 四、工作流程

所有 npm 命令在 `game/` 下执行。

- 开发：`npm run dev`（Electron + Vite），或双击 `game/启动游戏.bat`；浏览器调试访问 http://127.0.0.1:5173。
- **每次修改后必做**：`npm run typecheck`；涉及交互流程跑 `npm run test:e2e`；涉及构建跑 `npm run build`；涉及 Electron 表现用 `npm run dev` 手工验证。
- 提交前 `git status`，确认未误提交：`设计文档/`、`新建文件夹 美工/`、`node_modules/`、`dist*`、`*.log`、`playwright-report/`、`test-results/`、真实密钥。
- 提交信息：中文、动词开头（`update:` / `fix:` / `chore:`）。

## 五、变更同步检查清单

- 类型：`src/types.ts` ↔ `electron/main.ts` ↔ `electron/preload.ts` ↔ `src/browserBridge.ts` ↔ `vite.config.ts`。
- 默认状态：`electron/main.ts`、`src/browserBridge.ts`、`src/App.tsx`（fallbackState）三处一致。
- 新增 IPC：`main.ts` 注册 → `preload.ts` 暴露 → `types.ts` 声明 → `browserBridge.ts` 浏览器版实现。
- 资源统一放 `game/public/`，勿引用 gitignored 目录。