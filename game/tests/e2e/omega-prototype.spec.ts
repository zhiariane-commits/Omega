import { expect, test } from "@playwright/test";

const readyState = {
  nickname: "测试员",
  prologueDone: true,
  mood: 60,
  affinity: 12,
  emotion: "calm_positive",
  currentMode: "idle",
  unlocked: {
    activeGreeting: true,
    cleanCapsule: false,
    game: false,
    writing: false
  }
};

async function seedReadyState(page: import("@playwright/test").Page) {
  await page.addInitScript((state) => {
    window.localStorage.setItem("omega.browser.state", JSON.stringify(state));
    window.localStorage.removeItem("omega.browser.memories");
    window.localStorage.setItem("omega.browser.forceMock", "1");
  }, readyState);
}

test.describe("Ω desktop pet functional prototype", () => {
  test("default browser route starts with the prologue from the document", async ({ page }) => {
    // E2E 使用本地 mock：AI 配置阶段走模拟连通性测试
    await page.addInitScript(() => {
      window.localStorage.setItem("omega.browser.forceMock", "1");
    });
    await page.goto("/");

    // M0 序章：黑屏/制作人名单结束后进入 AI 配置（API KEY 填写）
    await expect(page.getByPlaceholder("粘贴视觉模型 API KEY")).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder("粘贴视觉模型 API KEY").fill("test-vision-key");
    await page.getByPlaceholder("粘贴对话模型 API KEY").fill("test-dialogue-key");
    await page.getByPlaceholder("推荐 doubao-seed-2-0-mini-260428").fill("custom-vision-model");
    await page.getByPlaceholder("推荐 https://ark.cn-beijing.volces.com/api/v3").fill("https://vision.example.com/v1");
    await page.getByPlaceholder("推荐 mimo-v2.5-pro").fill("custom-dialogue-model");
    await page.getByPlaceholder("推荐 https://api.xiaomimimo.com/v1").fill("https://dialogue.example.com/v1");
    await page.getByRole("button", { name: "连接测试" }).click();
    await expect(page.getByText("加载成功，祝您和Ω相处愉快！")).toBeVisible();

    // 成功后进入白字对话
    await expect(page.getByText("你好，能听到我说话吗？")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "继续" }).click();
    await page.getByRole("button", { name: "你是谁？" }).click();
    await expect(page.getByText("……居然不是幻觉。我是Ω，也可以叫我欧米伽，蓝星星际研究院资料室的实习生。")).toBeVisible();
    await page.getByRole("button", { name: "继续" }).click();
    await page.getByRole("button", { name: "你为什么会出现在我的电脑上？" }).click();
    await page.getByRole("button", { name: "继续" }).click();
    await page.getByRole("button", { name: "继续" }).click();
    await page.getByPlaceholder("输入你的昵称...").fill("测试员");
    await page.getByRole("button", { name: "确定" }).click();

    await expect(page.getByText("Ω 太空舱")).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("prologue AI config can be skipped and stays offline-playable", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("omega.browser.forceMock", "1");
    });
    await page.goto("/");

    await expect(page.getByPlaceholder("粘贴视觉模型 API KEY")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "暂不配置，跳过" }).click();
    await expect(page.getByText("你好，能听到我说话吗？")).toBeVisible({ timeout: 15_000 });
  });

  test("prologue AI config failure prompts to switch model", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("omega.browser.forceMock", "1");
    });
    await page.goto("/");

    await expect(page.getByPlaceholder("粘贴视觉模型 API KEY")).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder("粘贴视觉模型 API KEY").fill("invalid-vision");
    await page.getByPlaceholder("粘贴对话模型 API KEY").fill("invalid-dialogue");
    await page.getByRole("button", { name: "连接测试" }).click();
    await expect(page.getByText("视觉模型测试失败，请您换一个视觉模型试一试")).toBeVisible();
    await expect(page.getByText("对话模型测试失败，请您换一个对话模型试一试")).toBeVisible();
  });

  test("floating window exposes document-defined root and task bubbles", async ({ page }) => {
    await seedReadyState(page);
    await page.goto("/?view=floating");

    await expect(page.getByText("Ω · 平静（愉悦） · 好感 12")).toBeVisible();
    await page.getByRole("button", { name: "Ω" }).click();
    await expect(page.getByRole("button", { name: "输入" })).toBeVisible();
    await expect(page.getByRole("button", { name: "记录" })).toBeVisible();
    await expect(page.getByRole("button", { name: "事项" })).toBeVisible();
    await expect(page.getByRole("button", { name: "太空舱" })).toBeVisible();

    await page.getByRole("button", { name: "事项" }).click();
    await expect(page.getByRole("button", { name: "闹钟" })).toBeVisible();
    await expect(page.getByRole("button", { name: "游戏" })).toBeVisible();
    await expect(page.getByRole("button", { name: "专注模式" })).toBeVisible();
  });

  test("chat records recent bubbles, mood changes, and full session history", async ({ page }) => {
    await seedReadyState(page);
    await page.goto("/?view=floating");

    await page.getByRole("button", { name: "Ω" }).click();
    await page.getByRole("button", { name: "输入" }).click();
    await expect(page.getByRole("button", { name: "关闭聊天" })).toBeVisible();
    const chatInput = page.locator('input[placeholder="和Ω说话..."]');
    await chatInput.fill("谢谢你陪我测试这个功能");
    await expect(chatInput).toHaveValue("谢谢你陪我测试这个功能");
    await chatInput.press("Enter");

    await expect(page.getByLabel("Ω 对话")).toContainText("嗯，我也有一点开心。像是舱壁上的灯忽然稳定了一些。");
    await expect(page.getByText("Ω · 开心 · 好感 13")).toBeVisible();

    await page.getByRole("button", { name: "Ω" }).click();
    await page.getByRole("button", { name: "记录" }).click();
    const recordList = page.locator(".record-list");
    await expect(recordList).toContainText("测试员：");
    await expect(recordList).toContainText("谢谢你陪我测试这个功能");
    await expect(recordList).toContainText("Ω：");
    await expect(recordList).toContainText("嗯，我也有一点开心。像是舱壁上的灯忽然稳定了一些。");
  });

  test("chat bubble can be dismissed", async ({ page }) => {
    await seedReadyState(page);
    await page.goto("/?view=floating");

    await page.getByRole("button", { name: "Ω" }).click();
    await page.getByRole("button", { name: "输入" }).click();
    const chatInput = page.locator('input[placeholder="和Ω说话..."]');
    await chatInput.fill("在吗");
    await chatInput.press("Enter");
    await expect(page.getByLabel("Ω 对话")).toBeVisible();
    await page.getByRole("button", { name: "关闭聊天" }).click();
    await expect(page.getByLabel("Ω 对话")).toBeHidden();

    await page.getByRole("button", { name: "Ω" }).click();
    await page.getByRole("button", { name: "输入" }).click();
    await expect(page.getByLabel("Ω 对话")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Ω 对话")).toBeHidden();
  });

  test("dev panel shows the active idle action pool with detailed probabilities", async ({ page }) => {
    await seedReadyState(page);
    await page.goto("/?view=floating");

    // readyState：mood=60、写作/浇花未解锁 → 普通高心境池（跟随鼠标 40% / 发呆 10% / 看书 50%）
    await page.getByRole("button", { name: "开发者选项" }).click();
    await expect(page.getByText("当前动作池与概率")).toBeVisible();
    await expect(page.getByText("普通高心境池（mood >= 50）")).toBeVisible();
    const poolItems = page.locator(".dev-panel__pool-item");
    await expect(poolItems).toHaveCount(3);
    await expect(poolItems.filter({ hasText: "看着你这边" })).toContainText("40% · 权重 40 · 5min");
    await expect(poolItems.filter({ hasText: "望着窗外发呆" })).toContainText("10% · 权重 10 · 1min");
    await expect(poolItems.filter({ hasText: "在看书" })).toContainText("50% · 权重 50 · 5min");
  });

  test("capsule route renders the room, movement surface, and close action", async ({ page }) => {
    await seedReadyState(page);
    await page.goto("/?view=capsule");

    await expect(page.getByText("Ω 太空舱")).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible();

    await page.getByRole("button", { name: "关闭太空舱" }).click();
    await expect(page).toHaveURL(/view=floating/);
    await expect(page.getByRole("button", { name: "Ω" })).toBeVisible();
  });

  test("capsule desk bubble sit placeholder is dismissed by arrow keys and bubbles return", async ({ page }) => {
    await seedReadyState(page);
    await page.goto("/?view=capsule");

    // 打开书桌气泡菜单并选择“坐在书桌前”（动作占位）
    await page.getByRole("button", { name: "书桌", exact: true }).click();
    await page.getByRole("button", { name: "坐在书桌前" }).click();
    await expect(page.getByText("Ω 正在书桌前坐下……")).toBeVisible();

    // 按方向键自动起身：提示语消失、交互气泡恢复
    await page.keyboard.down("w");
    await expect(page.getByText("Ω 正在书桌前坐下……")).toBeHidden();
    await page.keyboard.up("w");
    await expect(page.getByRole("button", { name: "书桌", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "合成机", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "书架", exact: true })).toBeVisible();
  });

  test("M3 screen-recognition flow: red dots guide and complete after one vision round", async ({ page }) => {
    // M3 前置：M1/M2 已完成，且心境 >= 100、好感 >= 50
    await page.addInitScript((state) => {
      window.localStorage.setItem("omega.browser.state", JSON.stringify(state));
      window.localStorage.removeItem("omega.browser.memories");
      window.localStorage.setItem("omega.browser.forceMock", "1");
    }, {
      ...readyState,
      mood: 100,
      affinity: 50,
      completedMilestones: ["m1_first_greeting", "m2_clean_asked", "m2_clean_capsule"],
    });
    await page.goto("/?view=floating");

    // M3 触发后：悬浮窗「输入」气泡出现红点
    await page.getByRole("button", { name: "Ω" }).click();
    const inputButton = page.getByRole("button", { name: "输入" });
    await expect(inputButton).toHaveClass(/m3-red-dot/);

    // 输入界面：打招呼气泡替换为 M3 文案 + 屏幕识别选项出现红点
    await inputButton.click();
    await expect(page.getByLabel("Ω 对话")).toContainText("嗯......我想看看你那边的世界，或许你直接把图片展示在屏幕上就可以了。可以吗？");
    const screenToggle = page.locator(".screen-toggle");
    await expect(screenToggle).toHaveClass(/screen-toggle--alert/);

    // 勾选屏幕识别并发送一条消息（完成一轮对话）→ M3 完成、红点消失
    await screenToggle.locator('input[type="checkbox"]').check();
    const chatInput = page.locator('input[placeholder="和Ω说话..."]');
    await chatInput.fill("这就是我的世界");
    await chatInput.press("Enter");
    await expect(page.getByLabel("Ω 对话")).toContainText("我在。你说的话会被我认真收起来");
    await expect(screenToggle).not.toHaveClass(/screen-toggle--alert/);

    // 重新打开输入界面：打招呼气泡恢复正常（不再是 M3 文案）
    await page.getByRole("button", { name: "关闭聊天" }).click();
    await page.getByRole("button", { name: "Ω" }).click();
    await expect(page.getByRole("button", { name: "输入" })).not.toHaveClass(/m3-red-dot/);
    await page.getByRole("button", { name: "输入" }).click();
    await expect(page.getByLabel("Ω 对话")).not.toContainText("我想看看你那边的世界");
  });
  test("M4 childhood memory flow: input red dot guides and completes after one chat round", async ({ page }) => {
    // M4 前置：M1/M2/M3 已完成，且心境 >= 200、好感 > 50
    await page.addInitScript((state) => {
      window.localStorage.setItem("omega.browser.state", JSON.stringify(state));
      window.localStorage.removeItem("omega.browser.memories");
      window.localStorage.setItem("omega.browser.forceMock", "1");
    }, {
      ...readyState,
      mood: 200,
      affinity: 51,
      completedMilestones: ["m1_first_greeting", "m2_clean_asked", "m2_clean_capsule", "m3_show_world"],
    });
    await page.goto("/?view=floating");

    // M4 触发后：悬浮窗「输入」气泡出现红点
    await page.getByRole("button", { name: "Ω" }).click();
    const inputButton = page.getByRole("button", { name: "输入" });
    await expect(inputButton).toHaveClass(/m4-red-dot/);

    // 输入界面：打招呼气泡替换为 M4 童年记忆文案
    await inputButton.click();
    await expect(page.getByLabel("Ω 对话")).toContainText("我今天突然想到了过去");

    // 发送一条消息（完成一轮对话）→ M4 完成、红点消失
    const chatInput = page.locator('input[placeholder="和Ω说话..."]');
    await chatInput.fill("真好");
    await chatInput.press("Enter");
    await expect(page.getByLabel("Ω 对话")).toContainText("我在。你说的话会被我认真收起来");
    await expect(page.getByRole("button", { name: "关闭聊天" })).toBeVisible();

    // 重新打开输入界面：打招呼气泡恢复正常（不再是 M4 文案）
    await page.getByRole("button", { name: "关闭聊天" }).click();
    await page.getByRole("button", { name: "Ω" }).click();
    await expect(page.getByRole("button", { name: "输入" })).not.toHaveClass(/m4-red-dot/);
    await page.getByRole("button", { name: "输入" }).click();
    await expect(page.getByLabel("Ω 对话")).not.toContainText("我今天突然想到了过去");
  });
  test("crafting panel covers design-doc recipes and blueprint unlock at mood 300", async ({ page }) => {
    // 前置：M1/M2 已完成、心境 300 → 太空舱美化解锁 + 扩建图纸（心境值首次达到 300）可合成
    await page.addInitScript((state) => {
      window.localStorage.setItem("omega.browser.state", JSON.stringify(state));
      window.localStorage.removeItem("omega.browser.memories");
      window.localStorage.setItem("omega.browser.forceMock", "1");
    }, {
      ...readyState,
      mood: 300,
      affinity: 12,
      completedMilestones: ["m1_first_greeting", "m2_clean_asked", "m2_clean_capsule"],
    });
    await page.goto("/?view=floating");

    // 打开悬浮窗 → 事项 → 合成机
    await page.getByRole("button", { name: "Ω" }).click();
    await page.getByRole("button", { name: "事项" }).click();
    await page.getByRole("button", { name: "合成机" }).click();
    const panel = page.locator(".crafting-panel");
    await expect(panel).toBeVisible();

    // 设计稿：心境值达到 300 后「图纸」类别解锁（太空舱扩建图纸）
    await panel.getByRole("button", { name: "图纸" }).click();
    await expect(panel.getByText("太空舱扩建图纸")).toBeVisible();

    // 设计稿：太空舱美化新增「一整套新风格合成机」
    await panel.getByRole("button", { name: "合成机" }).click();
    await expect(panel.getByText("一整套新风格合成机")).toBeVisible();
    await panel.getByRole("button", { name: "合成", exact: true }).click();
    await expect(page.locator(".click-bubble")).toContainText("成功合成「一整套新风格合成机」！");

    // 合成后进入「已合成」列表
    await panel.getByRole("button", { name: "已合成" }).click();
    await expect(panel.getByText("一整套新风格合成机")).toBeVisible();
  });

  test("M5 construction flow: crafting unlock bubble, build until next launch, then expansion zone", async ({ page }) => {
    // 前置：M1/M2/M3/M4 已完成、心境 300、扩建图纸已购买（unlocked.construction）
    // 仅首次进入写入种子状态；reload 时保留游戏内已保存的进度（M5 下次启动判定）
    await page.addInitScript((state) => {
      window.localStorage.setItem("omega.browser.forceMock", "1");
      if (!window.localStorage.getItem("omega.browser.state")) {
        window.localStorage.setItem("omega.browser.state", JSON.stringify(state));
      }
      window.localStorage.removeItem("omega.browser.memories");
    }, {
      ...readyState,
      mood: 300,
      unlocked: {
        activeGreeting: true,
        cleanCapsule: false,
        game: false,
        writing: false,
        bookshelf: false,
        construction: true,
        gardening: false,
      },
      completedMilestones: ["m1_first_greeting", "m2_clean_asked", "m2_clean_capsule", "m3_show_world", "m4_childhood_story"],
    });
    await page.goto("/?view=floating");

    // M5 阶段1：条件满足 → 悬浮窗气泡提示合成机解锁新配方
    await expect(page.locator(".milestone-bubble")).toContainText("合成机似乎解锁了新的配方！");
    await page.locator(".milestone-bubble__dismiss").click();

    // 依次合成扩建图纸 / 扩建工具 / 扩建材料
    await page.getByRole("button", { name: "Ω" }).click();
    await page.getByRole("button", { name: "事项" }).click();
    await page.getByRole("button", { name: "合成机" }).click();
    const panel = page.locator(".crafting-panel");
    await expect(panel).toBeVisible();

    await panel.getByRole("button", { name: "图纸" }).click();
    await expect(panel.getByText("太空舱扩建图纸")).toBeVisible();
    await panel.getByRole("button", { name: "合成", exact: true }).click();

    await panel.getByRole("button", { name: "材料" }).click();
    await expect(panel.getByText("扩建工具")).toBeVisible();
    await panel.getByRole("button", { name: "合成", exact: true }).first().click();
    await panel.getByRole("button", { name: "合成", exact: true }).click();

    // 全部合成完成 → 进入建造阶段：悬浮窗提示 + 状态记录动工时间戳
    await panel.getByRole("button", { name: "✕" }).click();
    await expect(page.locator(".milestone-bubble")).toContainText("Ω好像开始在太空舱里动工了");
    await page.locator(".milestone-bubble__dismiss").click();
    const built = await page.evaluate(() => JSON.parse(localStorage.getItem("omega.browser.state") ?? "{}"));
    expect(built.m5ConstructStartAt).toBeGreaterThan(0);
    expect(built.completedMilestones).toContain("m5_craft_asked");

    // 模拟下次启动：刷新页面 → M5 完成
    await page.reload();
    await expect(page.locator(".milestone-bubble")).toContainText("扩建完成了！");
    await page.locator(".milestone-bubble__dismiss").click();
    const done = await page.evaluate(() => JSON.parse(localStorage.getItem("omega.browser.state") ?? "{}"));
    expect(done.completedMilestones).toContain("m5_construction");
    expect(done.room2Unlocked).toBe(true);

    // M5 完成后：太空舱新增「扩建区」气泡
    await page.getByRole("button", { name: "Ω" }).click();
    await page.getByRole("button", { name: "太空舱" }).click();
    await expect(page.getByText("Ω 太空舱")).toBeVisible();
    await expect(page.getByRole("button", { name: "扩建区", exact: true }).first()).toBeVisible();

    // 开发者选项重新触发 M5：默认刷新合成机相关内容状态，可重新合成材料
    await page.getByRole("button", { name: "关闭太空舱" }).click();
    await page.getByRole("button", { name: "开发者选项" }).click();
    const m5Row = page.locator(".dev-panel__milestone-item", { hasText: "M5 扩建完成" });
    await m5Row.getByRole("button", { name: "重新触发" }).click();
    await expect(m5Row.getByRole("button", { name: "重新触发" })).toBeDisabled();
    const reset = await page.evaluate(() => JSON.parse(localStorage.getItem("omega.browser.state") ?? "{}"));
    expect(reset.completedMilestones).not.toContain("m5_craft_asked");
    expect(reset.completedMilestones).not.toContain("m5_construction");
    expect(reset.purchasedItems).toEqual(
      expect.not.arrayContaining(["blueprint_expand", "material_tools", "material_supplies"])
    );
    expect(reset.m5ConstructStartAt).toBeNull();
    expect(reset.room2Unlocked).toBe(false);
    // 图纸为「首次达到 300 后永久解锁」：重触发保留扩建解锁，阶段1气泡重新出现
    expect(reset.unlocked.construction).toBe(true);

    // 先关闭开发者面板（气泡渲染在其下层），再处理重新触发的阶段1气泡
    await page.getByRole("button", { name: "关闭" }).click();
    await expect(page.locator(".milestone-bubble")).toContainText("合成机似乎解锁了新的配方！");
    await page.locator(".milestone-bubble__dismiss").click();

    // 心境已低于 300（图纸/工具/材料各耗 50 + M5 奖励 10），图纸仍应出现在合成机「图纸」列表
    await page.getByRole("button", { name: "Ω" }).click();
    await page.getByRole("button", { name: "事项" }).click();
    await page.getByRole("button", { name: "合成机" }).click();
    const panel2 = page.locator(".crafting-panel");
    await expect(panel2).toBeVisible();
    await panel2.getByRole("button", { name: "图纸" }).click();
    await expect(panel2.getByText("太空舱扩建图纸")).toBeVisible();
  });

  test("M5 room2 expansion zone opens and renders without crash", async ({ page }) => {
    // 前置：M5 已完成（room2Unlocked），直接进入扩建区验证 PixiJS 场景正常渲染
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.addInitScript((state) => {
      window.localStorage.setItem("omega.browser.forceMock", "1");
      if (!window.localStorage.getItem("omega.browser.state")) {
        window.localStorage.setItem("omega.browser.state", JSON.stringify(state));
      }
      window.localStorage.removeItem("omega.browser.memories");
    }, {
      ...readyState,
      mood: 300,
      unlocked: {
        activeGreeting: true,
        cleanCapsule: false,
        game: false,
        writing: false,
        bookshelf: false,
        construction: true,
        gardening: false,
      },
      completedMilestones: ["m1_first_greeting", "m2_clean_asked", "m2_clean_capsule", "m3_show_world", "m4_childhood_story", "m5_craft_asked", "m5_construction"],
      m5ConstructStartAt: null,
      room2Unlocked: true,
      purchasedItems: ["blueprint_expand", "material_tools", "material_supplies"],
    });
    await page.goto("/?view=capsule");
    await page.getByRole("button", { name: "扩建区", exact: true }).first().click();
    await expect(page.getByText("扩建空间")).toBeVisible();
    expect(pageErrors).toEqual([]);

    // 顶部常驻「回到主舱」按钮：点击后返回太空舱
    const backTop = page.getByRole("button", { name: "回到主舱" });
    await expect(backTop).toBeVisible();
    await backTop.click();
    await expect(page.getByText("Ω 太空舱")).toBeVisible();
  });
});
