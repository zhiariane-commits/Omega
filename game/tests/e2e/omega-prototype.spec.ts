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
    await page.goto("/");

    // M0 序章：黑屏/制作人名单结束后进入白字对话
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
});
