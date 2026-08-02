import { FormEvent, useCallback, useEffect, useState } from "react";
import { lazy, Suspense } from "react";
import type { OmegaState } from "../types";
import { CapsuleScene } from "./CapsuleScene";
import { getM2CleanSteps, isM2CleanStoryPending, M2_CLEAN_HINT } from "../systems/storyMilestones";
import CapsuleStoryDialogue from "./CapsuleStoryDialogue";
import DecorationPanel from "./DecorationPanel";
import BookshelfPanel from "./BookshelfPanel";
import CraftingPanel from "./CraftingPanel";
import M0Prologue from "./M0Prologue";
// Lazy Room2Scene (pixi.js v7 API mismatch)

type Props = {
  state: OmegaState;
  updateState: (partial: Partial<OmegaState>) => Promise<OmegaState>;
};

export function CapsuleWindow({ state, updateState }: Props) {
  const [sleeping, setSleeping] = useState(false);
  const [sleepCountdown, setSleepCountdown] = useState(60);

  const [decorating, setDecorating] = useState(false);
  const [inRoom2, setInRoom2] = useState(false);
  const [bookshelfShow, setBookshelfShow] = useState(false);
  const [craftingShow, setCraftingShow] = useState(false);
  const canDecorate = state.prologueDone && !sleeping;
  // M2 清扫剧情：已提醒（或提醒气泡仍挂起）且尚未同意 → 进入剧情模式
  const m2StoryPending = isM2CleanStoryPending(state);

  const lowMoodGuide = !state.prologueDone ? false : state.mood < 15;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (sleeping && sleepCountdown > 0) {
      timer = setInterval(() => {
        setSleepCountdown((prev) => {
          if (prev <= 1) {
            if (timer) clearInterval(timer);
            setSleeping(false);
            updateState({
              mood: Math.max(30, state.mood + 10),
              emotion: "calm_positive",
              currentMode: "normal",
            }).catch(() => {});
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [sleeping, sleepCountdown, state.mood, updateState]);

  const handleBedRest = useCallback(async () => {
    setSleeping(true);
    setSleepCountdown(60);
  }, []);

  // M2 剧情完成：记录同意时间戳，并在悬浮窗显示提示气泡
  const handleM2Complete = useCallback(async () => {
    await updateState({
      m2CleanAgreedAt: Date.now(),
      pendingMilestoneEvent: M2_CLEAN_HINT,
    });
  }, [updateState]);


  // Pre-prologue: show M0 开篇序章
  if (!state.prologueDone) {
    return <M0Prologue state={state} updateState={updateState} />;
  }

  return (
    <main className="capsule-shell">
      <header className="capsule-topbar">
        <div>
          <strong>{'\u03A9 \u592A\u7A7A\u8231'}</strong>
          {lowMoodGuide && !sleeping && (
            <span className="low-mood-guide">
              {'\u03A9\u592A\u7D2F\u4E86\u2026\u2026\u8D70\u5230\u5E8A\u94FA\u9644\u8FD1\u4F11\u606F\u5427'}
            </span>
          )}
          {sleeping && (
            <span className="sleep-guide">
              {'\u03A9 \u6B63\u5728\u4F11\u606F\u2026 '}{sleepCountdown}s
            </span>
          )}
        </div>
        {canDecorate && !decorating && !m2StoryPending && (
          <button
            type="button"
            style={{ borderColor: '#00ccff', color: '#00ccff', marginRight: 8 }}
            onClick={() => setDecorating(true)}
          >
            {'\u88C5\u4FEE'}
          </button>
        )}
        {state.room2Unlocked && !inRoom2 && !decorating && !sleeping && !m2StoryPending && (
          <button
            type="button"
            style={{ borderColor: '#88ccff', color: '#88ccff', marginRight: 8 }}
            onClick={() => setInRoom2(true)}
          >
            {'\u6269\u5EFA\u533A'}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            window.omega.window.closeCapsule();
          }}
        >
          {'\u5173\u95ED\u592A\u7A7A\u8231'}
        </button>
      </header>

      {sleeping ? (
        <section className="sleep-overlay">
          <div className="sleep-overlay__content">
            <h2>{'\u03A9 \u6B63\u5728\u4F11\u606F'}</h2>
            <div className="sleep-overlay__timer">{sleepCountdown}s</div>
            <p>{'\u7761\u9192\u540E\u5FC3\u5883\u503C\u4F1A\u6062\u590D\u4E00\u4E9B'}</p>
          </div>
        </section>
      ) : m2StoryPending ? (
        <>
          <CapsuleScene
            prologueDone={true}
            emotion={state.emotion}
            mood={state.mood}
            equippedDecorations={state.equippedDecorations ?? {}}
            capsuleBackgroundDirty={state.capsuleBackgroundDirty}
            lowMood={state.mood < 15}
            room2Unlocked={state.room2Unlocked ?? false}
            onShelfInteract={() => setBookshelfShow(true)}
            onRoom2Door={() => { setInRoom2(true); }}
          />
          <CapsuleStoryDialogue
            steps={getM2CleanSteps(state.nickname)}
            onComplete={handleM2Complete}
          />
        </>
      ) : inRoom2 ? (
        <Suspense fallback={<div className="desk-hint">Loading...</div>}>
          <LazyRoom2
            emotion={state.emotion}
            equippedDecorations={state.equippedDecorations ?? {}}
            onBackToMainRoom={() => setInRoom2(false)}
            lowMood={state.mood < 15}
            state={state}
            updateState={updateState}
          />
        </Suspense>
      ) : craftingShow ? (
<div className="capsule-panel-center">
        <CraftingPanel
          state={state}
          updateState={updateState}
          onClose={() => setCraftingShow(false)}
          setClickBubble={(msg) => {
            console.log("Crafting:", msg);
          }}
        />
        </div>
      ) : bookshelfShow ? (
<div className="capsule-panel-center">
        <BookshelfPanel
          state={state}
          updateState={updateState}
          onClose={() => setBookshelfShow(false)}
        />
        </div>
      ) : decorating ? (
<div className="capsule-panel-center">
        <DecorationPanel
          state={state}
          updateState={updateState}
          onExit={() => setDecorating(false)}
          setClickBubble={function (msg: string | null) {
            console.log("Decoration:", msg);
          }}
        />
        </div>
      ) : (
        <CapsuleScene
          prologueDone={state.prologueDone}
          emotion={state.emotion}
          mood={state.mood}
          equippedDecorations={state.equippedDecorations ?? {}}
          capsuleBackgroundDirty={state.capsuleBackgroundDirty}
          onDeskInteract={state.prologueDone ? undefined : () => {}}
          onBedInteract={lowMoodGuide ? handleBedRest : undefined}
          lowMood={state.mood < 15}
          room2Unlocked={state.room2Unlocked ?? false}
          onShelfInteract={() => setBookshelfShow(true)}
          onRoom2Door={() => { setInRoom2(true); }}
          onOpenCrafting={() => setCraftingShow(true)}
          onOpenBookshelf={() => setBookshelfShow(true)}
          onGoFloating={() => { void window.omega.window.closeCapsule(); }}
        />
      )}
    </main>
  );
}
const LazyRoom2 = lazy(() => import("./Room2Scene"));
