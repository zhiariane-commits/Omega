import { Application, BaseTexture, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OmegaEmotion, OmegaState } from "../types";
import { ALL_RECIPES } from "../systems/crafting";

type Props = {
  emotion: OmegaEmotion;
  equippedDecorations: Record<string, string>;
  onBackToMainRoom: () => void;
  lowMood?: boolean;
  state: OmegaState;
  updateState: (partial: Partial<OmegaState>) => Promise<OmegaState>;
};

type Position = { x: number; y: number };

const DECO_EMOJIS: Record<string, string> = {
  vase: "🏺",
  wall_lamp: "💡",
  small_table: "🪑",
  window: "🪟",
  planet_model: "🌍",
  plant: "🌱",
  bean_bag: "🛁",
  wardrobe: "🧥",
  record_player: "🎵",
};

export default function Room2Scene({
  emotion,
  equippedDecorations,
  onBackToMainRoom,
  lowMood,
  state,
  updateState,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const playerRef = useRef<Container | null>(null);
  const faceRef = useRef<Graphics | null>(null);
  const decorRef = useRef<Container | null>(null);
  const positionRef = useRef<Position>({ x: 512, y: 400 });
  const keysRef = useRef(new Set<string>());
  const [nearDoor, setNearDoor] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [selectedDeco, setSelectedDeco] = useState<string | null>(null);
  const [furniture, setFurniture] = useState<Record<string, Position>>(
    state.room2Furniture ?? {}
  );
  const placingPos = useRef<Position>({ x: 400, y: 300 });
  const placingId = useRef<string | null>(null);
  const furnitureRef = useRef(furniture);
  furnitureRef.current = furniture;

  // Owned room2 decor items from crafting
  const ownedDecoItems = ALL_RECIPES.filter(
    (r) =>
      r.category === "room2_decor" &&
      (state.purchasedItems ?? []).includes(r.id)
  );

  const saveFurniture = useCallback(
    async (newFurniture: Record<string, Position>) => {
      setFurniture(newFurniture);
      await updateState({ room2Furniture: newFurniture });
    },
    [updateState]
  );

  useEffect(() => {
    let disposed = false;
    const host = hostRef.current!;
    if (!host) return;

    function keyDown(event: KeyboardEvent) {
      keysRef.current.add(event.key.toLowerCase());
      if (event.key === "Escape") {
        setPlacing(false);
        setSelectedDeco(null);
      }
    }
    function keyUp(event: KeyboardEvent) {
      keysRef.current.delete(event.key.toLowerCase());
    }
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    async function init() {
      const app = new Application({
        width: host.clientWidth,
        height: host.clientHeight,
        transparent: true,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })
      if (disposed) {
        app.destroy(true);
        return;
      }
      appRef.current = app;
      host.appendChild(app.view as unknown as Node);

      // Background：M5 完成后使用「新房间.png」全屏贴图（失败时回退绘制背景）
      let bgLoaded = false;
      try {
        const bgTexture = await loadImageAsTexture(
          app.renderer as any,
          "/capusle/room2-bg.png"
        );
        if (disposed) return;
        const bgSprite = new Sprite(bgTexture);
        bgSprite.width = app.screen.width;
        bgSprite.height = app.screen.height;
        app.stage.addChildAt(bgSprite, 0);
        bgLoaded = true;
      } catch {
        /* fallback below */
      }
      if (!bgLoaded) {
        const bg = new Graphics();
        bg.beginFill(0x080e14);
        bg.drawRect(0, 0, app.screen.width, app.screen.height);
        bg.endFill();
        app.stage.addChild(bg);
        const floor = new Graphics();
        const wallBottom = app.screen.height * 0.5;
        floor.beginFill(0x0f1a24);
        floor.drawRect(0, wallBottom, app.screen.width, app.screen.height - wallBottom);
        floor.endFill();
        floor.lineStyle(1, 0x1a2a3a, 0.2);
        for (let y = wallBottom; y < app.screen.height; y += 40) {
          floor.moveTo(0, y);
          floor.lineTo(app.screen.width, y);
        }
        for (let x = 0; x < app.screen.width; x += 60) {
          floor.moveTo(x, wallBottom);
          floor.lineTo(x, app.screen.height);
        }
        floor.lineStyle(0);
        app.stage.addChild(floor);
        const walls = new Graphics();
        walls.beginFill(0x121e2a);
        walls.drawRect(0, 60, app.screen.width, app.screen.height * 0.5 - 60);
        walls.endFill();
        walls.lineStyle(1, 0x1a2a3a, 0.15);
        for (let y = 60; y < app.screen.height * 0.5; y += 50) {
          walls.moveTo(0, y);
          walls.lineTo(app.screen.width, y);
        }
        walls.lineStyle(0);
        app.stage.addChild(walls);
      }

      // Furniture layer
      const decorLayer = new Container();
      decorRef.current = decorLayer;
      app.stage.addChild(decorLayer);
      renderFurniture(decorLayer, app.screen.width, app.screen.height, furnitureRef.current);

      // Omega player
      let omegaTexture: Texture | undefined;
      try {
        omegaTexture = await loadImageAsTexture(
          app.renderer as any,
          "/live2d/omega-transparent.png"
        );
      } catch {
        /* fallback */
      }
      const player = drawOmegaFallback(emotion, omegaTexture);
      const faceG = new Graphics();
      drawFaceGraphicsRoom2(faceG, emotion);
      faceRef.current = faceG;
      player.addChild(faceG);
      player.position.set(positionRef.current.x, positionRef.current.y);
      playerRef.current = player;
      app.stage.addChild(player);

      // Placing preview (follows placingPos)
      const preview = new Container();
      app.stage.addChild(preview);

      const handleResize = () =>
        app.renderer.resize(host.clientWidth, host.clientHeight);
      window.addEventListener("resize", handleResize);

      app.ticker.add((dt: number) => {
        const speed = 3.1 * dt;

        if (placing && placingId.current) {
          // Move the placing preview
          const p = placingPos.current;
          if (keysRef.current.has("w")) {
            p.y -= speed * 0.8;
            // perspective: moving up = smaller
          }
          if (keysRef.current.has("s")) {
            p.y += speed * 0.8;
          }
          if (keysRef.current.has("a")) p.x -= speed;
          if (keysRef.current.has("d")) p.x += speed;
          p.x = Math.max(40, Math.min(app.screen.width - 40, p.x));
          p.y = Math.max(120, Math.min(app.screen.height - 40, p.y));

          // Update preview
          preview.removeChildren();
          const itemId = placingId.current;
          const color = 0x00ccff;
          const previewG = new Graphics();
          previewG.beginFill(color, 0.3);
          previewG.drawRoundedRect(0, 0, 36, 36, 6);
          previewG.endFill();
          previewG.lineStyle(2, color, 0.6);
          previewG.drawRoundedRect(0, 0, 36, 36, 6);
          previewG.lineStyle(0);
          preview.addChild(previewG);
          const previewText = new Text(DECO_EMOJIS[itemId] ?? "❓", {
            fill: color,
            fontSize: 16,
            fontWeight: "700",
          });
          previewText.anchor.set(0.5);
          previewText.position.set(18, 18);
          preview.addChild(previewText);
          preview.position.set(p.x - 18, p.y - 18);
        } else {
          preview.removeChildren();
          // Normal player movement
          const pos = positionRef.current;
          if (keysRef.current.has("w")) pos.y -= speed * 0.8;
          if (keysRef.current.has("s")) pos.y += speed * 0.8;
          if (keysRef.current.has("a")) pos.x -= speed;
          if (keysRef.current.has("d")) pos.x += speed;
          // 移动范围与太空舱内一致（去除桌子的梯形格挡）：X 150~宽-150，Y 380~490
          pos.x = Math.max(150, Math.min(app.screen.width - 150, pos.x));
          pos.y = Math.max(380, Math.min(490, pos.y));
          player.position.set(pos.x, pos.y);
          player.scale.set(0.8 + (pos.y - 380) / 600);

          // Door proximity（默认放在左下可移动区域内，参数后续可微调）
          const doorDist = Math.hypot(pos.x - 90, pos.y - app.screen.height * 0.6);
          setNearDoor(doorDist < 120);
        }
      });
    }

    void init();
    return () => {
      disposed = true;
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      appRef.current?.destroy(true);
      appRef.current = null;
      if (host) host.replaceChildren();
    };
  }, [emotion, equippedDecorations, placing]);

  // --- Reactive face updates when emotion changes ---
  useEffect(() => {
    if (faceRef.current) {
      drawFaceGraphicsRoom2(faceRef.current, emotion);
    }
  }, [emotion]);

  // Render furniture when it changes
  useEffect(() => {
    if (decorRef.current && appRef.current) {
      decorRef.current.removeChildren();
      renderFurniture(
        decorRef.current,
        appRef.current.screen.width,
        appRef.current.screen.height,
        furniture
      );
    }
  }, [furniture]);

  function startPlacing(itemId: string) {
    placingId.current = itemId;
    setSelectedDeco(itemId);
    setPlacing(true);
    // Start at center-ish
    placingPos.current = { x: 400, y: 300 };
  }

  function confirmPlace() {
    if (!placingId.current) return;
    const id = placingId.current;
    const pos = { ...placingPos.current };

    // Simple collision check
    const currentFurniture = furnitureRef.current;
    const collision = Object.entries(currentFurniture).some(
      ([existingId, existingPos]) =>
        existingId !== id &&
        Math.abs(existingPos.x - pos.x) < 50 &&
        Math.abs(existingPos.y - pos.y) < 50
    );

    if (collision) {
      return; // Can't place overlapping
    }

    const updated = { ...currentFurniture, [id]: pos };
    void saveFurniture(updated);
    setPlacing(false);
    setSelectedDeco(null);
    placingId.current = null;
  }

  function removeFurniture(itemId: string) {
    const updated = { ...furnitureRef.current };
    delete updated[itemId];
    void saveFurniture(updated);
  }

  return (
    <section className="scene-wrap">
      <div ref={hostRef} className="pixi-host" />

      {/* Door back button */}
      {!placing && nearDoor && (
        <button
          className="desk-action"
          type="button"
          onClick={onBackToMainRoom}
        >
          {'\u8FD4\u56DE\u4E3B\u8231'}
        </button>
      )}

      {/* Placement mode header */}
      <section className="room2-toolbar">
        <button
          type="button"
          className={`room2-btn ${placing ? "room2-btn--active" : ""}`}
          onClick={() => {
            if (placing) {
              setPlacing(false);
              setSelectedDeco(null);
              placingId.current = null;
            } else {
              setPlacing(true);
            }
          }}
        >
          {placing ? "\u9000\u51FA\u6446\u653E" : "\u6446\u653E\u5BB6\u5177"}
        </button>
        {placing && selectedDeco && (
          <button
            type="button"
            className="room2-btn room2-btn--confirm"
            onClick={confirmPlace}
          >
            \u786E\u8BA4\u653E\u7F6E (Enter)
          </button>
        )}
      </section>

      {/* Item palette */}
      {placing && !selectedDeco && (
        <section className="room2-palette">
          <p className="room2-palette__hint">\u9009\u62E9\u8981\u6446\u653E\u7684\u7269\u54C1\uFF1A</p>
          <div className="room2-palette__items">
            {ownedDecoItems.length === 0 ? (
              <p className="room2-palette__empty">
                (\u8FD8\u6CA1\u6709\u53EF\u653E\u7F6E\u7684\u7269\u54C1\uFF0C\u5148\u53BB\u5408\u6210\u673A\u5236\u9020\u5427)
              </p>
            ) : (
              ownedDecoItems.map((item) => {
                const placed = furniture[item.id] != null;
                const color = 0x00ccff;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`room2-palette__item ${placed ? "room2-palette__item--placed" : ""}`}
                    onClick={() => {
                      if (placed) {
                        removeFurniture(item.id);
                      } else {
                        startPlacing(item.id);
                      }
                    }}
                  >
                    <span
                      className="room2-palette__swatch"
                      style={{ backgroundColor: `#${color.toString(16).padStart(6, "0")}` }}
                    >
                      {DECO_EMOJIS[item.id] ?? "\u2753"}
                    </span>
                    <span className="room2-palette__name">{item.name}</span>
                    {placed && <span className="room2-palette__badge">\u5DF2\u653E\u7F6E</span>}
                  </button>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* Placement hint */}
      {placing && selectedDeco && (
        <p className="room2-placement-hint">
          WASD \u79FB\u52A8\u7269\u54C1\uFF0CEnter \u786E\u8BA4\u653E\u7F6E\uFF0CEsc \u53D6\u6D88
        </p>
      )}

      {!placing && <p className="room2-label">{'\u6269\u5EFA\u7A7A\u95F4'}</p>}
    </section>
  );
}

function renderFurniture(
  layer: Container,
  width: number,
  height: number,
  furniture: Record<string, Position>
) {
  for (const [id, pos] of Object.entries(furniture)) {
    const emoji = DECO_EMOJIS[id] ?? "\u2753";

    // Perspective scaling: items higher up = smaller
    const scaleFactor = 0.5 + ((pos.y - 120) / (height - 160)) * 0.5;
    const fontSize = Math.round(36 * scaleFactor);

    const t = new Text(emoji, {
      fill: 0x00ccff,
      fontSize: fontSize,
      fontWeight: "700",
    });
    t.anchor.set(0.5);
    t.position.set(pos.x, pos.y);
    layer.addChild(t);
  }
}

function loadImageAsTexture(_renderer: any, url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const base = new BaseTexture(img);
      resolve(new Texture(base));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function drawFaceGraphicsRoom2(face: Graphics, emotion: OmegaEmotion) {
  face.clear();
  const eyeColor = emotion === "sad" || emotion === "down" || emotion === "angry" || emotion === "fearful" || emotion === "calm_negative" ? 0x9a835a : 0x5d4037;
  face.beginFill(eyeColor);
  face.drawRoundedRect(-18, -8, 10, 4, 2);
  face.drawRoundedRect(8, -8, 10, 4, 2);
  face.endFill();
  if (emotion === "happy" || emotion === "proud") {
    face.lineStyle(2, 0x5d4037);
    face.arc(0, 8, 14, 0, Math.PI);
    face.lineStyle(0);
  } else if (emotion === "sad") {
    face.lineStyle(2, 0x9a835a);
    face.arc(0, 20, 11, Math.PI, Math.PI * 2);
    face.lineStyle(0);
  } else {
    face.lineStyle(2, 0x5d4037);
    face.moveTo(-10, 14);
    face.lineTo(10, 14);
    face.lineStyle(0);
  }
}

function drawOmegaFallback(emotion: OmegaEmotion, texture?: Texture) {
  const root = new Container();
  if (texture) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 1);
    sprite.width = 130;
    sprite.height = 218;
    sprite.y = 130;
    root.addChild(sprite);
  } else {
    const body = new Graphics();
    body.beginFill(0xfffaf0);
    body.drawRoundedRect(-34, 29, 68, 101, 26);
    body.endFill();
    body.lineStyle(2, 0x19c8b9);
    body.drawRoundedRect(-34, 29, 68, 101, 26);
    body.lineStyle(0);
    root.addChild(body);
    const head = new Graphics();
    head.beginFill(0xfffdf4);
    head.drawCircle(0, 0, 42);
    head.endFill();
    head.lineStyle(2, 0xdfd4be);
    head.drawCircle(0, 0, 42);
    head.lineStyle(0);
    root.addChild(head);
  }
  const glow = new Graphics();
  glow.beginFill(0x19c8b9, 0.15);
  glow.drawEllipse(0, 120, 49, 10);
  glow.endFill();
  root.addChild(glow);
  return root;
}

