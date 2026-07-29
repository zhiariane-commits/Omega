/**
 * M0 开篇序章 — 完整演出流程
 *
 * Phase 0: Splash — 制作人名单淡入淡出
 * Phase 1: Intro — 黑屏白字对话 + 玩家选项
 * Phase 2: Nickname — 输入玩家昵称
 * Phase 3: CapsuleDialogue — 太空舱场景 + Ω 头顶对话气泡 + 选项
 * Phase 4: Tutorial — 书桌高亮引导 + 关闭提示
 */

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { OmegaEmotion, OmegaState } from "../types";
import { CapsuleScene } from "./CapsuleScene";

type Props = {
  state: OmegaState;
  updateState: (partial: Partial<OmegaState>) => Promise<OmegaState>;
};

type ProloguePhase =
  | "splash"
  | "intro"
  | "nickname"
  | "capsule_dialogue"
  | "tutorial";

type DialogueStep =
  | { role: "omega_text"; text: string; emotion?: OmegaEmotion }
  | { role: "omega_bubble"; text: string; emotion?: OmegaEmotion }
  | { role: "player_choice"; options: string[] }
  | { role: "system"; text: string };

const SPLASH_DURATION = 2800; // ms
const FADE_DURATION = 800;

// ======================= Intro Dialogue (black screen) =======================

const introSteps: DialogueStep[] = [
  {
    role: "omega_text",
    text: "你好，能听到我说话吗？",
    emotion: "calm_negative",
  },
  {
    role: "player_choice",
    options: ["你是谁？"],
  },
  {
    role: "omega_text",
    text: "……居然不是幻觉。我是Ω，也可以叫我欧米伽，蓝星星际研究院资料室的实习生。",
    emotion: "calm_positive",
  },
  {
    role: "player_choice",
    options: ["你为什么会出现在我的电脑上？"],
  },
  {
    role: "omega_text",
    text: "不知道，我们的世界灭亡了，我已经很久没和人这样说过话了。",
    emotion: "calm_negative",
  },
  {
    role: "omega_text",
    text: "我该怎么称呼你？",
    emotion: "calm_positive",
  },
  {
    role: "system",
    text: "nickname",
  },
];

// ======================= Capsule Dialogue (over capsule scene) =======================

const capsuleSteps: DialogueStep[] = [
  {
    role: "omega_bubble",
    text: "我这是，在一个方块里面？",
    emotion: "fearful",
  },
  {
    role: "player_choice",
    options: ["是的，这是我的电脑。"],
  },
  {
    role: "omega_bubble",
    text: "你可以听到我说话吗？",
    emotion: "shy",
  },
  {
    role: "player_choice",
    options: ["不能，但我能看到。"],
  },
  {
    role: "omega_bubble",
    text: "哦，那可能是某些高维转译器起了作用。真神奇……你就看我脑袋顶上的字幕吧，你是三维生物吗？",
    emotion: "calm_positive",
  },
  {
    role: "player_choice",
    options: ["呃，或许是？"],
  },
  {
    role: "omega_bubble",
    text: "我读过一些研究你们的书，但院士们的预测和现在的状况完全不一样。",
    emotion: "calm_negative",
  },
  {
    role: "omega_bubble",
    text: "那我可以在你的电脑里呆着吗？",
    emotion: "shy",
  },
  {
    role: "player_choice",
    options: ["当然可以。"],
  },
  {
    role: "omega_bubble",
    text: "谢谢你，我应该不会占用它太长时间。我的心境值很低，应该很快就会死。",
    emotion: "calm_negative",
  },
  {
    role: "player_choice",
    options: ["心境值，那是什么？"],
  },
  {
    role: "omega_bubble",
    text: "可以理解为描述心理状态和健康程度的指数——我期待这一天很久了。",
    emotion: "calm_positive",
  },
  {
    role: "system",
    text: "tutorial",
  },
];

// ======================= Emotion → face label for display =======================

const EMOTION_FACE_LABEL: Record<string, string> = {
  calm_positive: "(平静)",
  calm_negative: "(低落)",
  happy: "(开心)",
  shy: "(害羞)",
  sad: "(难过)",
  proud: "(骄傲)",
  excited: "(兴奋)",
  fearful: "(疑惑)",
};

// ======================= Component =======================

export default function M0Prologue({ state, updateState }: Props) {
  const [phase, setPhase] = useState<ProloguePhase>("splash");
  const [splashFade, setSplashFade] = useState<"in" | "show" | "out">("in");
  const [dialogueIdx, setDialogueIdx] = useState(0);
  const [nickname, setNickname] = useState(state.nickname || "");
  const [omegaExpression, setOmegaExpression] = useState<OmegaEmotion>("calm_negative");
  const [deskHighlighted, setDeskHighlighted] = useState(false);
  const [showCloseHint, setShowCloseHint] = useState(false);

  // Ref to track capsule scene container for close hint
  const capsuleShellRef = useRef<HTMLDivElement>(null);

  // ---------- Splash ----------
  useEffect(() => {
    if (phase !== "splash") return;
    const t1 = setTimeout(() => setSplashFade("show"), 400);
    const t2 = setTimeout(
      () => {
        setSplashFade("out");
        setTimeout(() => {
          setPhase("intro");
          setSplashFade("in");
        }, FADE_DURATION);
      },
      SPLASH_DURATION - 200
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase]);

  // ---------- Intro dialogue ----------
  const currentStep = phase === "intro"
    ? introSteps[dialogueIdx]
    : phase === "capsule_dialogue"
      ? capsuleSteps[dialogueIdx]
      : null;

  const handleOmegaTextContinue = useCallback(() => {
    setDialogueIdx((i) => i + 1);
  }, []);

  const handlePlayerChoice = useCallback(
    (_index: number) => {
      setDialogueIdx((i) => i + 1);
    },
    []
  );

  // Auto-advance system steps
  useEffect(() => {
    if (phase !== "intro" && phase !== "capsule_dialogue") return;
    if (!currentStep) return;
    if (currentStep.role === "system") {
      if (currentStep.text === "nickname") {
        setPhase("nickname");
        setDialogueIdx(0);
      } else if (currentStep.text === "tutorial") {
        setPhase("tutorial");
        setDeskHighlighted(true);
        setShowCloseHint(true);
      }
    }
    if (currentStep.role === "omega_text" || currentStep.role === "omega_bubble") {
      setOmegaExpression(
        (currentStep as Extract<DialogueStep, { role: "omega_text" }>).emotion ?? "calm_negative"
      );
    }
  }, [phase, currentStep, dialogueIdx]);

  // ---------- Nickname submit ----------
  const handleNicknameSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!nickname.trim()) return;
      await updateState({ nickname: nickname.trim() });
      setPhase("capsule_dialogue");
      setDialogueIdx(0);
    },
    [nickname, updateState]
  );

  // ---------- Finish prologue (go to floating window) ----------
  const finishPrologue = useCallback(async () => {
    await updateState({
      prologueDone: true,
      currentMode: "idle",
      mood: Math.max(30, state.mood + 5),
      affinity: Math.max(0, state.affinity + 1),
      emotion: "calm_positive",
      lastActiveTime: Date.now(),
    });
    await window.omega.window.showFloating();
    await window.omega.window.closeCapsule();
  }, [state, updateState]);

  // ---------- Render ----------

  // Splash screen: overlay on any phase
  if (phase === "splash") {
    return (
      <main className="m0-splash">
        <div className={`m0-splash__content m0-splash__content--${splashFade}`}>
          <p className="m0-splash__label">制作人</p>
          <p className="m0-splash__names">纸折鱼 &middot; Romanrose &middot; 合金 &middot; 固执</p>
        </div>
      </main>
    );
  }

  // Intro: black screen with white text
  if (phase === "intro") {
    if (!currentStep) return null;
    return (
      <main className="m0-intro">
        <div className="m0-intro__dialogue">
          {currentStep.role === "omega_text" && (
            <div className="m0-intro__line">
              <span className="m0-intro__speaker">Ω</span>
              <span className="m0-intro__emotion">
                {EMOTION_FACE_LABEL[currentStep.emotion ?? "calm_negative"]}
              </span>
              <p className="m0-intro__text">{currentStep.text}</p>
              <button
                type="button"
                className="m0-intro__continue"
                onClick={handleOmegaTextContinue}
              >
                继续
              </button>
            </div>
          )}
          {(currentStep as any).role === "player_choice" && (
            <div className="m0-intro__choices">
              {(currentStep as Extract<DialogueStep, { role: "player_choice" }>).options.map(
                (opt, i) => (
                  <button
                    key={i}
                    type="button"
                    className="m0-intro__choice-btn"
                    onClick={() => handlePlayerChoice(i)}
                  >
                    {opt}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </main>
    );
  }

  // Nickname input
  if (phase === "nickname") {
    return (
      <main className="m0-intro">
        <form className="m0-intro__nickname-form" onSubmit={handleNicknameSubmit}>
          <p className="m0-intro__nickname-question">
            <span className="m0-intro__speaker">Ω</span>
            <span className="m0-intro__emotion">(平静)</span>
          </p>
          <p className="m0-intro__nickname-hint">我该怎么称呼你？</p>
          <div className="m0-intro__nickname-row">
            <input
              className="m0-intro__nickname-input"
              value={nickname}
              onChange={(e) => setNickname(e.currentTarget.value)}
              placeholder="输入你的昵称..."
              autoFocus
              maxLength={20}
            />
            <button type="submit" className="m0-intro__nickname-submit">
              确定
            </button>
          </div>
        </form>
      </main>
    );
  }

  // Capsule dialogue: CapsuleScene background + speech bubble overlay
  if (phase === "capsule_dialogue") {
    if (!currentStep) return null;
    // After nickname, before first capsule bubble, show a quick reply from Ω
    const showNicknameReply = dialogueIdx === 0;
    return (
      <main className="capsule-shell" ref={capsuleShellRef}>
        <header className="capsule-topbar">
          <div>
            <strong>Ω 太空舱</strong>
          </div>
        </header>
        <CapsuleScene
          prologueDone={false}
          emotion={omegaExpression}
          mood={state.mood}
          equippedDecorations={state.equippedDecorations ?? {}}
          capsuleBackgroundDirty={state.capsuleBackgroundDirty}
          deskHighlighted={false}
        />
        {/* Dialogue overlay */}
        <div className="m0-capsule-overlay">
          {showNicknameReply && (
            <div className="m0-capsule-bubble">
              <div className="m0-capsule-bubble__tail" />
              <p className="m0-capsule-bubble__text">
                哦，好的……很高兴认识你，<strong>{nickname || state.nickname || "你"}</strong>……
              </p>
              <button
                type="button"
                className="m0-intro__continue m0-intro__continue--light"
                onClick={() => setDialogueIdx(1)}
              >
                继续
              </button>
            </div>
          )}
          {!showNicknameReply && currentStep.role === "omega_bubble" && (
            <div className="m0-capsule-bubble">
              <div className="m0-capsule-bubble__tail" />
              <span className="m0-capsule-bubble__emotion">
                {EMOTION_FACE_LABEL[currentStep.emotion ?? "calm_negative"]}
              </span>
              <p className="m0-capsule-bubble__text">{currentStep.text}</p>
              <button
                type="button"
                className="m0-intro__continue m0-intro__continue--light"
                onClick={handleOmegaTextContinue}
              >
                继续
              </button>
            </div>
          )}
          {!showNicknameReply && (currentStep as any).role === "player_choice" && (
            <div className="m0-capsule-choices">
              {(currentStep as Extract<DialogueStep, { role: "player_choice" }>).options.map(
                (opt, i) => (
                  <button
                    key={i}
                    type="button"
                    className="m0-intro__choice-btn m0-intro__choice-btn--light"
                    onClick={() => handlePlayerChoice(i)}
                  >
                    {opt}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </main>
    );
  }

  // Tutorial: CapsuleScene with desk highlighted + hint overlay
  if (phase === "tutorial") {
    return (
      <main className="capsule-shell" ref={capsuleShellRef}>
        <header className="capsule-topbar">
          <div>
            <strong>Ω 太空舱</strong>
          </div>
          <button
            type="button"
            className="m0-tutorial__close-btn"
            onClick={finishPrologue}
          >
            关闭太空舱
          </button>
        </header>
        <CapsuleScene
          prologueDone={false}
          emotion="calm_positive"
          mood={state.mood}
          equippedDecorations={state.equippedDecorations ?? {}}
          capsuleBackgroundDirty={state.capsuleBackgroundDirty}
          deskHighlighted={true}
          onDeskInteract={finishPrologue}
        />
        {showCloseHint && (
          <div className="m0-tutorial__hint">
            <p className="m0-tutorial__hint-text">
              <span className="m0-tutorial__hint-icon">💡</span>
              靠近书桌点击坐下
            </p>
            <p className="m0-tutorial__hint-sub">
              或点击右上角「关闭太空舱」启动悬浮窗
            </p>
          </div>
        )}
      </main>
    );
  }

  return null;
}
