/**
 * 太空舱剧情对话覆盖层（M0 Phase 4 演出格式）
 *
 * 在太空舱场景之上渲染 Ω 对话气泡（打字机效果）、玩家选项，
 * 最后一步点击「继续」后回调 onComplete。
 * M2 清扫剧情复用此组件。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { OmegaEmotion } from "../types";

export type CapsuleStoryStep =
  | { role: "omega_bubble"; text: string; emotion?: OmegaEmotion }
  | { role: "player_choice"; options: string[] };

type Props = {
  steps: CapsuleStoryStep[];
  onComplete: () => void;
};

/** 打字机文本（同 M0 实现） */
function TypewriterText({ text, speed = 35, active = true }: {
  text: string;
  speed?: number;
  active?: boolean;
}) {
  const [displayed, setDisplayed] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDisplayed("");
    if (!active || !text) return;

    let idx = 0;
    timerRef.current = setInterval(() => {
      idx += 1;
      if (idx >= text.length) {
        setDisplayed(text);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
      } else {
        setDisplayed(text.slice(0, idx));
      }
    }, speed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, speed, active]);

  if (!active) return <>{text}</>;
  return <>{displayed}</>;
}

export default function CapsuleStoryDialogue({ steps, onComplete }: Props) {
  const [dialogueIdx, setDialogueIdx] = useState(0);
  const [typewriterActive, setTypewriterActive] = useState(false);
  const lastOmegaBubbleRef = useRef<{ text: string; emotion: OmegaEmotion } | null>(null);

  const currentStep = steps[dialogueIdx];

  useEffect(() => {
    if (!currentStep) return;
    if (currentStep.role === "omega_bubble") {
      lastOmegaBubbleRef.current = {
        text: currentStep.text,
        emotion: currentStep.emotion ?? "calm_negative",
      };
      setTypewriterActive(true);
    } else {
      setTypewriterActive(false);
    }
  }, [currentStep]);

  const handleOmegaTextContinue = useCallback(() => {
    if (dialogueIdx + 1 >= steps.length) {
      onComplete();
      return;
    }
    setDialogueIdx((i) => i + 1);
    setTypewriterActive(false);
  }, [dialogueIdx, steps.length, onComplete]);

  const handlePlayerChoice = useCallback(() => {
    setDialogueIdx((i) => i + 1);
  }, []);

  if (!currentStep) return null;

  const isPlayerChoice = currentStep.role === "player_choice";
  const lastBubble = lastOmegaBubbleRef.current;

  return (
    <div className="m0-capsule-overlay">
      {!isPlayerChoice && (
        <div className="m0-capsule-bubble">
          <div className="m0-capsule-bubble__tail" />
          <p className="m0-capsule-bubble__text">
            <TypewriterText text={currentStep.text} active={typewriterActive} />
          </p>
          <button
            type="button"
            className="m0-intro__continue m0-intro__continue--light"
            onClick={handleOmegaTextContinue}
          >
            继续
          </button>
        </div>
      )}
      {isPlayerChoice && (
        <div className="m0-capsule-choices-area">
          {lastBubble && (
            <div className="m0-capsule-bubble m0-capsule-bubble--static">
              <div className="m0-capsule-bubble__tail" />
              <p className="m0-capsule-bubble__text">{lastBubble.text}</p>
            </div>
          )}
          <div className="m0-capsule-choices">
            {currentStep.options.map((opt: string, i: number) => (
              <button
                key={i}
                type="button"
                className="m0-intro__choice-btn m0-intro__choice-btn--light"
                onClick={() => handlePlayerChoice()}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}