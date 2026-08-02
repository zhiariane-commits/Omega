import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Live2DModel as PixiL2D } from "pixi-live2d-display/cubism4";
PixiL2D.registerTicker(PIXI.Ticker);
import type { OmegaEmotion } from "../types";

export type AnimationId = "idle" | "click" | "angry";

interface Live2DModelProps {
  modelPath?: string;
  scale?: number;
  emotion?: OmegaEmotion;
  mousePos?: { x: number; y: number };
  animationId?: AnimationId;
  /** 视线是否跟随鼠标（发呆等动作时关闭） */
  gazeEnabled?: boolean;
}

const modelPaths: Record<AnimationId, string> = {
  idle: "/live2d/omega/omega.model3.json",
  click: "/live2d/click/click.model3.json",
  angry: "/live2d/omega/omega.model3.json",
};

/** 普通（非单击）状态的固定表情：不受当前情绪影响 */
const NEUTRAL_EXPRESSION = "calm_positive";

function getMouthOpenValue(emotion: string): number {
  // NOTE: this model's ParamMouthOpenY is inverted (1 = closed, 0 = open)
  return emotion === "expectant" || emotion === "fearful" ? 0.6 :
         emotion === "happy" ? 0.1 :
         emotion === "confused" || emotion === "angry" ? 0.95 :
         emotion === "sad" ? 0.92 :
         1;
}

/** 当前应生效的嘴部开合值：仅「单击表情态」跟随情绪（开心张嘴等），其余状态固定闭合（开合=1） */
function getActiveMouthValue(animationId: AnimationId, emotion: string): number {
  return animationId === "click" ? getMouthOpenValue(emotion) : 1;
}

function setModelExpression(model: any, emotion: string, animationId: AnimationId) {
  // 普通状态固定展示中性表情（不受情绪影响）；仅单击时应用当前情绪表情
  const expressionName = animationId === "click" ? emotion : NEUTRAL_EXPRESSION;
  try { model.expression(expressionName).catch(() => {}); } catch {}

  // Directly set mouth parameter via low-level API
  // (expression system alone may not override .moc3 default values)
  try {
    const core = model.internalModel?.coreModel;
    if (core && typeof core.setParameterValueById === "function") {
      core.setParameterValueById("ParamMouthOpenY", getActiveMouthValue(animationId, emotion));
    }
  } catch {}
}

async function createAndAttachModel(
  app: PIXI.Application,
  path: string,
  scale: number,
  emotion: string,
  animationId: AnimationId,
  motionName?: string,
) {
  const model = await PixiL2D.from(path, { autoUpdate: true, autoInteract: true });
  model.anchor.set(0.5, 0.5);

  // Guard: app.destroy() sets renderer=null, which makes app.screen getter crash
  if (!app || !app.renderer) {
    console.warn("[Live2D] app destroyed before model finished loading");
    try { model.destroy(); } catch {}
    return null;
  }
  const screenW = app.screen.width;
  const screenH = app.screen.height;

  let cw = 2048, ch = 2048;
  const im = model.internalModel as any;
  if (im && im.canvasSize) {
    cw = im.canvasSize[0];
    ch = im.canvasSize[1];
  }

  const s = Math.min((screenW * 0.75) / cw, (screenH * 0.85) / ch) * scale;
  model.scale.set(s);
  model.position.set(screenW / 2, screenH / 2);
  app.stage.addChild(model);

  setModelExpression(model, emotion, animationId);

  // 单击模型：加载后立即播放点击动画（点击动画为循环 motion）
  if (motionName) {
    // 单击动画期间暂时关闭键鼠眼球跟踪：每帧清零 focusController，内部 updateFocus 不再叠加跟踪值
    try {
      const im = model.internalModel as any;
      im?.on?.("afterMotionUpdate", () => {
        const fc = im.focusController;
        if (fc) {
          fc.targetX = 0;
          fc.targetY = 0;
          fc.x = 0;
          fc.y = 0;
        }
      });
    } catch {}
    try { model.motion(motionName); } catch {}
  }

  return model;
}

export default function OmegaLive2DModel({
  modelPath: _propPath,
  scale = 1,
  emotion = "calm_negative",
  mousePos = { x: 0.5, y: 0.5 },
  animationId = "idle",
  gazeEnabled = true,
}: Live2DModelProps) {
  const [modelReady, setModelReady] = useState(false);
  const divRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<any>(null);
  const prevAnimRef = useRef(animationId);

  // Init PIXI app once, load initial model
  useEffect(() => {
    if (!divRef.current) return;
    const el = divRef.current;
    const w = el.clientWidth || 360;
    const h = el.clientHeight || 520;

    let app: PIXI.Application;
    try {
      app = new PIXI.Application({
        width: w,
        height: h,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.max(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      el.appendChild(app.view as HTMLCanvasElement);
      appRef.current = app;
    } catch {
      return;
    }

    const path = modelPaths[animationId] || modelPaths.idle;
    createAndAttachModel(app, path, scale, emotion, animationId, animationId === "click" ? "click" : undefined)
      .then((model) => {
        if (!model) return;
        // 异步加载期间 app 可能已被卸载/替换，此时丢弃新模型，避免泄漏在全局 ticker 上
        if (!appRef.current || appRef.current !== app || !appRef.current.renderer) {
          try { model.destroy(); } catch {}
          return;
        }
        modelRef.current = model;
        setModelReady(true);
      })
      .catch((err) => console.error("[Live2D] load error:", err));

    const handleResize = () => {
      if (!appRef.current || !divRef.current) return;
      const cw = divRef.current.clientWidth || 360;
      const ch = divRef.current.clientHeight || 520;
      appRef.current.renderer.resize(cw, ch);
      if (modelRef.current) modelRef.current.position.set(cw / 2, ch / 2);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (modelRef.current) {
        try { modelRef.current.destroy(); } catch {}
        modelRef.current = null;
      }
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch model on animation change
  useEffect(() => {
    if (prevAnimRef.current === animationId || !appRef.current) return;

    const app = appRef.current;
    const path = modelPaths[animationId];
    if (!path) return;

    // idle/angry 都用 omega 模型：如果当前已加载的不是 click 模型，直接复用避免重复加载
    if ((animationId === "idle" || animationId === "angry") && modelRef.current && prevAnimRef.current !== "click") {
      if (animationId === "angry") {
        try { modelRef.current.motion("angry"); } catch {}
      }
      prevAnimRef.current = animationId;
      return;
    }

    if (modelRef.current) {
      try { modelRef.current.destroy(); } catch {}
      modelRef.current = null;
    }

    createAndAttachModel(app, path, scale, emotion, animationId, animationId === "click" ? "click" : undefined)
      .then((model) => {
        if (!model) return;
        if (!appRef.current || appRef.current !== app || !appRef.current.renderer) {
          try { model.destroy(); } catch {}
          return;
        }
        modelRef.current = model;
        prevAnimRef.current = animationId;
        setModelReady(true);
      })
      .catch((err) => console.error("[Live2D] switch error:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationId]);

  // Update expression when emotion changes or model becomes ready
  useEffect(() => {
    if (modelRef.current) setModelExpression(modelRef.current, emotion, animationId);
  }, [emotion, modelReady, animationId]);

  // Force mouth parameter every frame via Pixi ticker.
  // Cubium resets parameters during internalModel.update() each frame,
  // so we must re-apply ParamMouthOpenY after the model update completes.
  useEffect(() => {
    if (!appRef.current || !modelRef.current) return;
    const ticker = appRef.current.ticker;
    const forceMouth = () => {
      const m = modelRef.current;
      if (!m) return;
      try {
        const core = m.internalModel?.coreModel;
        if (!core) return;
        if (typeof core.setParameterValueById !== "function") return;
        core.setParameterValueById("ParamMouthOpenY", getActiveMouthValue(animationId, emotion));
      } catch {}
    };
    ticker.add(forceMouth);
    return () => {
      // app.destroy(true) 会销毁 ticker（_head=Null），此时 remove 会抛错
      try { ticker.remove(forceMouth); } catch {}
    };
  }, [emotion, modelReady, animationId]);

  // Eye tracking (gazeEnabled=false 时视线回到正中，不跟随鼠标)
  useEffect(() => {
    const m = modelRef.current;
    if (!m) return;
    try {
      const core = m.internalModel?.coreModel;
      if (core && typeof core.setParameterValueById === "function") {
        // 单击动画期间眼球由 motion 曲线控制，不叠加键鼠跟踪
        if (animationId === "click") return;
        if (!gazeEnabled) {
          core.setParameterValueById("ParamEyeBallX", 0);
          core.setParameterValueById("ParamEyeBallY", 0);
          core.setParameterValueById("ParamAngleX", 0);
          core.setParameterValueById("ParamAngleY", 0);
          return;
        }
        const eyeX = -(mousePos.x - 0.5) * 12;
        const eyeY = (mousePos.y - 0.5) * 12;

        core.setParameterValueById("ParamEyeBallX", eyeX);
        core.setParameterValueById("ParamEyeBallY", eyeY);
        const angleX = -(mousePos.x - 0.5) * 10;
        const angleY = (mousePos.y - 0.5) * 6;
        core.setParameterValueById("ParamAngleX", angleX);
        core.setParameterValueById("ParamAngleY", angleY);
      }
    } catch {}
  }, [mousePos, gazeEnabled, animationId]);

  return (
    <div ref={divRef} style={{ width: "100%", height: "100%", overflow: "hidden" }} />
  );
}



