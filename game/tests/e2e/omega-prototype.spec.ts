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

    await expect(page.getByText("Ω · 平静 · 好感 12")).toBeVisible();
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
});
