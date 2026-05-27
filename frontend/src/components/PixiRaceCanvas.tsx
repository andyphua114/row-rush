import { useEffect, useRef } from "react";
import {
  Application,
  Container,
  Graphics,
  Text,
  type Ticker,
} from "pixi.js";
import type { BoatSummary, RaceState } from "../types";

const FINISH = 1000;
const RACE_TOP = 140;
const LEFT_GUTTER = 128;
const RIGHT_GUTTER = 168;

type BoatVisual = {
  container: Container;
  wake: Graphics;
  glow: Graphics;
  shadow: Graphics;
  hull: Graphics;
  oars: Graphics;
  rowers: Graphics;
  badge: Graphics;
  labelPanel: Graphics;
  nameLabel: Text;
  countLabel: Text;
  rankLabel: Text;
  color: string;
  x: number;
  y: number;
};

type PixiScene = {
  app: Application;
  background: Graphics;
  water: Graphics;
  lanes: Graphics;
  effects: Graphics;
  finish: Graphics;
  boatLayer: Container;
  boats: Map<string, BoatVisual>;
  staticKey: string;
  perf: {
    frameCount: number;
    frameIndex: number;
    frameTimes: Float32Array;
    maxMs: number;
    totalMs: number;
  };
};

declare global {
  interface Window {
    __rowRushPerf?: {
      avgMs: number;
      boatVisuals: number;
      canvases: number;
      fps: number;
      frames: number;
      maxMs: number;
    };
  }
}

export function PixiRaceCanvas({ state }: { state: RaceState }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const sceneRef = useRef<PixiScene | null>(null);
  stateRef.current = state;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const init = async () => {
      const app = new Application();
      await app.init({
        antialias: false,
        autoDensity: true,
        backgroundAlpha: 0,
        preference: "webgl",
        powerPreference: "high-performance",
        resizeTo: host,
        resolution: Math.min(window.devicePixelRatio || 1, 1.5),
      });

      if (disposed) {
        app.destroy(true);
        return;
      }

      app.canvas.className = "absolute inset-0 h-full w-full";
      host.appendChild(app.canvas);

      const background = new Graphics();
      const water = new Graphics();
      const lanes = new Graphics();
      const effects = new Graphics();
      const finish = new Graphics();
      const boatLayer = new Container();

      app.stage.addChild(background, water, lanes, finish, boatLayer, effects);

      const scene: PixiScene = {
        app,
        background,
        water,
        lanes,
        effects,
        finish,
        boatLayer,
        boats: new Map(),
        staticKey: "",
        perf: {
          frameCount: 0,
          frameIndex: 0,
          frameTimes: new Float32Array(120),
          maxMs: 0,
          totalMs: 0,
        },
      };
      sceneRef.current = scene;

      resizeObserver = new ResizeObserver(() => {
        app.renderer.resize(host.clientWidth, host.clientHeight);
      });
      resizeObserver.observe(host);

      app.ticker.add((ticker) => renderScene(scene, stateRef.current, ticker));
    };

    void init();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      const scene = sceneRef.current;
      sceneRef.current = null;
      if (!scene) return;
      if (scene.app.canvas.parentElement === host) {
        host.removeChild(scene.app.canvas);
      }
      scene.app.destroy(true, { children: true });
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0 h-full w-full overflow-hidden" />;
}

function renderScene(scene: PixiScene, state: RaceState, ticker: Ticker) {
  const { width, height } = scene.app.screen;
  const elapsed = performance.now() / 1000;
  const layout = getRaceLayout(width, height);
  recordFrameStats(scene, ticker);

  const staticKey = `${Math.round(width)}:${Math.round(height)}:${Math.round(layout.top)}:${Math.round(layout.laneHeight)}:${Math.round(layout.left)}:${Math.round(layout.right)}`;
  if (scene.staticKey !== staticKey) {
    scene.staticKey = staticKey;
    drawBackground(scene.background, width, height);
    drawLanes(scene.lanes, layout);
    drawFinish(scene.finish, layout);
  }

  drawWater(scene.water, width, height, elapsed);
  syncBoatVisuals(scene, state.boats);
  drawEventEffects(scene.effects, state.boats, layout, elapsed);

  state.boats.forEach((boat, index) => {
    const visual = scene.boats.get(boat.boat_id);
    if (!visual) return;

    const progress = Math.max(0, Math.min(1, (boat.position ?? 0) / FINISH));
    const targetX = layout.left + progress * (layout.right - layout.left);
    const targetY =
      layout.top +
      index * layout.laneHeight +
      layout.laneHeight / 2 +
      Math.sin(elapsed * 3.8 + index) * 5;

    const smoothing = Math.min(1, ticker.deltaMS / 90);
    visual.x += (targetX - visual.x) * smoothing;
    visual.y += (targetY - visual.y) * smoothing;
    visual.container.position.set(visual.x, visual.y);
    visual.container.scale.set(0.72 + index * 0.025);
    visual.container.rotation = Math.sin(elapsed * 2 + index) * 0.018 + speedToLean(boat.speed ?? 0);

    const speed = Math.max(0, Math.min(1, (boat.speed ?? 0) / 8));
    drawWake(visual.wake, speed, elapsed, boat.color);
    drawBoatGlow(visual.glow, boat);
    drawBoatShadow(visual.shadow, speed);
    drawOars(visual.oars, elapsed, index, speed);
    drawRowers(visual.rowers, elapsed, index, speed);
    if (visual.color !== boat.color) {
      visual.color = boat.color;
      drawHull(visual.hull, boat.color);
    }

    const rowerText = `${boat.rower_count ?? 0} rowers`;
    const rankText = `#${boat.rank ?? "-"}`;
    if (visual.nameLabel.text !== boat.name) visual.nameLabel.text = boat.name;
    if (visual.countLabel.text !== rowerText) visual.countLabel.text = rowerText;
    if (visual.rankLabel.text !== rankText) visual.rankLabel.text = rankText;
  });
}

function recordFrameStats(scene: PixiScene, ticker: Ticker) {
  const delta = ticker.deltaMS;
  const { perf } = scene;
  if (perf.frameCount >= perf.frameTimes.length) {
    perf.totalMs -= perf.frameTimes[perf.frameIndex];
  }
  perf.frameTimes[perf.frameIndex] = delta;
  perf.totalMs += delta;
  perf.frameIndex = (perf.frameIndex + 1) % perf.frameTimes.length;
  perf.frameCount += 1;
  perf.maxMs = Math.max(delta, perf.maxMs * 0.985);

  if (perf.frameCount % 30 !== 0) return;
  const sampleCount = Math.min(perf.frameCount, perf.frameTimes.length);
  const avgMs = perf.totalMs / sampleCount;
  window.__rowRushPerf = {
    avgMs: Number(avgMs.toFixed(2)),
    boatVisuals: scene.boats.size,
    canvases: document.querySelectorAll("canvas").length,
    fps: Number((1000 / avgMs).toFixed(1)),
    frames: perf.frameCount,
    maxMs: Number(perf.maxMs.toFixed(2)),
  };
  scene.app.canvas.dataset.rowRushPerf = JSON.stringify(window.__rowRushPerf);
}

function getRaceLayout(width: number, height: number) {
  const isNarrow = width < 720;
  const laneHeight = Math.max(isNarrow ? 104 : 92, (height - 236) / 5);
  const left = isNarrow ? 82 : Math.max(LEFT_GUTTER, width * 0.13);
  const right = isNarrow ? Math.max(left + 260, width - 92) : Math.max(left + 420, width - RIGHT_GUTTER);
  return {
    top: isNarrow ? 118 : RACE_TOP,
    laneHeight,
    left,
    right,
  };
}

function drawBackground(graphics: Graphics, width: number, height: number) {
  graphics.clear();
  graphics.rect(0, 0, width, height).fill(0x02121e);
  graphics.rect(0, 0, width, height).fill({ color: 0x063247, alpha: 0.86 });
  graphics.poly([0, 0, width * 0.18, 0, width * 0.08, height, 0, height], true).fill({
    color: 0x0f172a,
    alpha: 0.72,
  });
  graphics.poly([width, 0, width * 0.82, 0, width * 0.93, height, width, height], true).fill({
    color: 0x052e2b,
    alpha: 0.66,
  });
  graphics.poly([width * 0.13, 0, width * 0.87, 0, width * 0.78, height, width * 0.2, height], true).fill({
    color: 0x075f73,
    alpha: 0.46,
  });

  graphics.circle(width * 0.5, height * 0.1, width * 0.42).fill({
    color: 0x7dd3fc,
    alpha: 0.13,
  });
  graphics.circle(width * 0.5, height * 0.52, width * 0.58).fill({
    color: 0x2dd4bf,
    alpha: 0.08,
  });

  for (let i = 0; i < 22; i += 1) {
    const side = i % 2 === 0 ? 0.08 : 0.92;
    const x = width * side + Math.sin(i * 3.7) * width * 0.035;
    const y = (i * 97) % (height + 80) - 40;
    graphics.circle(x, y, 2 + (i % 3)).fill({
      color: i % 2 ? 0xfde68a : 0x67e8f9,
      alpha: 0.16 + (i % 4) * 0.035,
    });
    graphics.circle(x, y, 12 + (i % 4) * 6).fill({
      color: i % 2 ? 0xfde68a : 0x67e8f9,
      alpha: 0.035,
    });
  }
}

function drawWater(graphics: Graphics, width: number, height: number, time: number) {
  graphics.clear();

  const isNarrow = width < 720;
  for (let band = 0; band < (isNarrow ? 5 : 7); band += 1) {
    const y = ((band * 126 + time * 24) % (height + 180)) - 90;
    const offset = Math.sin(time * 0.7 + band) * 28;
    graphics.poly(
      [
        width * 0.15 + offset,
        y,
        width * 0.86 + offset * 0.4,
        y - 28,
        width * 0.78 - offset * 0.2,
        y + 36,
        width * 0.2 - offset * 0.3,
        y + 54,
      ],
      true,
    ).fill({ color: band % 2 ? 0x22d3ee : 0x99f6e4, alpha: 0.04 });
  }

  for (let y = -20; y < height + 40; y += isNarrow ? 24 : 18) {
    const alpha = 0.07 + ((y / 18) % 3) * 0.025;
    graphics.setStrokeStyle({
      width: y % 54 === 0 ? 3.2 : 1.6,
      color: 0xffffff,
      alpha,
      cap: "round",
      join: "round",
    });
    graphics.moveTo(-70, y);
    for (let x = -50; x < width + 70; x += 34) {
      const yy = y + Math.sin(x / 64 + time * 2.9 + y / 130) * 8;
      graphics.lineTo(x, yy);
    }
    graphics.stroke();
  }

  for (let i = 0; i < (isNarrow ? 42 : 72); i += 1) {
    const x = ((i * 137 + time * 44) % (width + 140)) - 70;
    const y = 92 + ((i * 83 + Math.sin(time + i) * 26) % Math.max(220, height - 110));
    const size = 1.4 + (i % 4) * 0.75;
    graphics.circle(x, y, size).fill({ color: 0xa7f3d0, alpha: 0.1 + (i % 3) * 0.035 });
  }
}

function drawLanes(
  graphics: Graphics,
  layout: ReturnType<typeof getRaceLayout>,
) {
  graphics.clear();
  const laneWidth = layout.right - layout.left + 58;

  for (let index = 0; index < 5; index += 1) {
    const laneTop = layout.top + index * layout.laneHeight + 10;
    const laneCenter = laneTop + layout.laneHeight / 2 - 10;
    const depth = index / 4;
    graphics.roundRect(layout.left - 38, laneTop, laneWidth + 18, layout.laneHeight - 18, 34).fill({
      color: index % 2 ? 0xffffff : 0x67e8f9,
      alpha: 0.035 + depth * 0.02,
    });
    graphics.roundRect(layout.left - 30, laneTop + 8, laneWidth - 4, layout.laneHeight - 34, 28).stroke({
      width: 1.5,
      color: 0xffffff,
      alpha: 0.1 + depth * 0.07,
    });

    graphics.setStrokeStyle({ width: 2.5, color: 0xffffff, alpha: 0.16 + depth * 0.05, cap: "round" });
    graphics.moveTo(layout.left, laneCenter);
    for (let x = layout.left; x < layout.right; x += 42) {
      graphics.lineTo(x, laneCenter + Math.sin(x / 120 + index) * 2);
    }
    graphics.stroke();

    for (let x = layout.left + 88; x < layout.right - 34; x += 124) {
      const bob = Math.sin(index + x / 80) * 2;
      graphics.circle(x, laneCenter + bob, 5.4).fill({
        color: index % 2 ? 0xf8fafc : 0xfef08a,
        alpha: 0.82,
      });
      graphics.circle(x, laneCenter + bob, 13).fill({ color: 0xffffff, alpha: 0.035 });
    }
  }
}

function drawFinish(
  graphics: Graphics,
  layout: ReturnType<typeof getRaceLayout>,
) {
  graphics.clear();
  const finishHeight = layout.laneHeight * 5 - 4;
  const x = layout.right;
  const y = layout.top - 16;

  graphics.rect(x - 8, y, 16, finishHeight).fill({ color: 0xf8fafc, alpha: 0.96 });
  for (let i = 0; i < finishHeight; i += 18) {
    graphics.rect(x - 8, y + i, 16, 18).fill(i % 36 === 0 ? 0x020617 : 0xf8fafc);
  }
  graphics.rect(x + 13, y, 6, finishHeight).fill(0xfde68a);
  graphics.circle(x + 16, y + finishHeight / 2, 44).fill({
    color: 0xfde68a,
    alpha: 0.06,
  });
}

function syncBoatVisuals(scene: PixiScene, boats: BoatSummary[]) {
  const seen = new Set(boats.map((boat) => boat.boat_id));

  boats.forEach((boat) => {
    if (scene.boats.has(boat.boat_id)) return;
    const visual = createBoatVisual(boat);
    scene.boats.set(boat.boat_id, visual);
    scene.boatLayer.addChild(visual.container);
  });

  for (const [boatId, visual] of scene.boats) {
    if (seen.has(boatId)) continue;
    visual.container.destroy({ children: true });
    scene.boats.delete(boatId);
  }
}

function createBoatVisual(boat: BoatSummary): BoatVisual {
  const container = new Container();
  const wake = new Graphics();
  const glow = new Graphics();
  const shadow = new Graphics();
  const hull = new Graphics();
  const oars = new Graphics();
  const rowers = new Graphics();
  const badge = new Graphics();
  const labelPanel = new Graphics();
  const nameLabel = new Text({
    text: boat.name,
    style: {
      fill: 0xffffff,
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 18,
      fontWeight: "900",
      dropShadow: {
        color: 0x020617,
        alpha: 0.5,
        blur: 5,
        distance: 2,
      },
    },
  });
  const countLabel = new Text({
    text: `${boat.rower_count ?? 0} rowers`,
    style: {
      fill: 0xcffafe,
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 13,
      fontWeight: "800",
    },
  });
  const rankLabel = new Text({
    text: `#${boat.rank ?? "-"}`,
    style: {
      fill: 0x020617,
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 16,
      fontWeight: "900",
    },
  });

  nameLabel.position.set(-78, -60);
  countLabel.position.set(-78, -38);
  rankLabel.anchor.set(0.5);
  rankLabel.position.set(34, -1);

  container.addChild(wake, glow, shadow, oars, hull, rowers, badge, labelPanel, nameLabel, countLabel, rankLabel);
  drawHull(hull, boat.color);
  drawBadge(badge);
  drawLabelPanel(labelPanel);

  return {
    container,
    wake,
    glow,
    shadow,
    hull,
    oars,
    rowers,
    badge,
    labelPanel,
    nameLabel,
    countLabel,
    rankLabel,
    color: boat.color,
    x: 0,
    y: 0,
  };
}

function drawHull(graphics: Graphics, color: string) {
  const boatColor = hexToPixi(color);
  graphics.clear();
  graphics.poly([64, 0, 38, 21, -50, 18, -66, 0, -50, -18, 38, -21], true).fill({
    color: boatColor,
    alpha: 1,
  });
  graphics.poly([64, 0, 38, 21, -50, 18, -66, 0, -50, -18, 38, -21], true).stroke({
    color: 0xffffff,
    alpha: 0.9,
    width: 2.5,
    join: "round",
  });
  graphics.poly([64, 0, 40, 12, 50, 0, 40, -12], true).fill({ color: 0xffffff, alpha: 0.22 });
  graphics.roundRect(-42, -11, 70, 22, 8).fill({ color: 0x020617, alpha: 0.7 });
  graphics.roundRect(-34, -6, 48, 12, 6).fill({ color: 0xffffff, alpha: 0.2 });
  graphics.rect(-50, -2, 86, 4).fill({ color: 0xffffff, alpha: 0.16 });
  graphics.circle(42, 0, 6).fill({ color: 0xffffff, alpha: 0.38 });
  graphics.poly([-66, 0, -82, -8, -78, 0, -82, 8], true).fill({ color: boatColor, alpha: 0.82 });
}

function drawBadge(graphics: Graphics) {
  graphics.clear();
  graphics.circle(34, 0, 15).fill({ color: 0xffffff, alpha: 0.94 });
  graphics.circle(34, 0, 19).stroke({ color: 0xffffff, alpha: 0.28, width: 2 });
}

function drawOars(graphics: Graphics, time: number, index: number, speed: number) {
  graphics.clear();
  const pull = Math.sin(time * (5 + speed * 5.8) + index) * (0.85 + speed * 0.6);
  graphics.setStrokeStyle({
    width: 3.5,
    color: 0xf8fafc,
    alpha: 0.76,
    cap: "round",
  });

  [-38, -18, 2, 22].forEach((offset, rowerIndex) => {
    const reach = 18 + pull * 6 + rowerIndex * 0.8;
    graphics.moveTo(offset, -15);
    graphics.lineTo(offset - reach, -36 - pull * 4);
    graphics.moveTo(offset, 15);
    graphics.lineTo(offset - reach, 36 + pull * 4);
  });
  graphics.stroke();

  [-38, -18, 2, 22].forEach((offset, rowerIndex) => {
    const reach = 18 + pull * 6 + rowerIndex * 0.8;
    graphics.roundRect(offset - reach - 6, -40 - pull * 4, 12, 6, 3).fill({ color: 0xfde68a, alpha: 0.78 });
    graphics.roundRect(offset - reach - 6, 34 + pull * 4, 12, 6, 3).fill({ color: 0xfde68a, alpha: 0.78 });
  });
}

function drawRowers(graphics: Graphics, time: number, index: number, speed: number) {
  graphics.clear();
  const lean = Math.sin(time * (5 + speed * 5.8) + index) * (1.5 + speed * 3);
  [-34, -14, 6, 26].forEach((offset, rowerIndex) => {
    const alpha = 0.72 + rowerIndex * 0.04;
    graphics.circle(offset + lean, -5, 3).fill({ color: 0xf8fafc, alpha });
    graphics.circle(offset + lean, 5, 3).fill({ color: 0xf8fafc, alpha });
  });
}

function drawBoatShadow(graphics: Graphics, speed: number) {
  graphics.clear();
  graphics.ellipse(-5, 13, 70 + speed * 16, 16).fill({ color: 0x020617, alpha: 0.24 });
}

function drawLabelPanel(graphics: Graphics) {
  graphics.clear();
  graphics.roundRect(-88, -66, 140, 40, 14).fill({ color: 0x020617, alpha: 0.4 });
  graphics.roundRect(-84, -63, 132, 32, 12).stroke({ color: 0xffffff, alpha: 0.11, width: 1 });
}

function drawWake(graphics: Graphics, speed: number, time: number, color?: string) {
  graphics.clear();
  const wakeColor = hexToPixi(color ?? "#ffffff");
  const length = 76 + speed * 78;
  graphics.setStrokeStyle({
    width: 4 + speed * 3,
    color: wakeColor,
    alpha: 0.26 + speed * 0.2,
    cap: "round",
  });
  for (let i = 0; i < 5; i += 1) {
    const start = -70 - i * 21;
    const wobble = Math.sin(time * 5 + i) * (8 + speed * 5);
    graphics.moveTo(start, -16 + i * 7);
    graphics.quadraticCurveTo(start - length * 0.36, wobble, start - length * 0.08, 17 - i * 3);
  }
  graphics.stroke();

  for (let i = 0; i < 10; i += 1) {
    const x = -72 - ((i * 18 + time * (34 + speed * 70)) % Math.max(92, length));
    const y = Math.sin(i * 1.7 + time * 4) * (10 + speed * 12);
    graphics.circle(x, y, 1.8 + (i % 3)).fill({ color: 0xffffff, alpha: 0.12 + speed * 0.18 });
  }
}

function drawBoatGlow(graphics: Graphics, boat: BoatSummary) {
  graphics.clear();
  if (!boat.active_event) return;
  const color =
    boat.active_event_kind === "negative"
      ? 0xfb7185
      : boat.active_event_kind === "mixed"
        ? 0xc084fc
        : 0xfde68a;
  graphics.circle(-4, 0, 76).fill({ color, alpha: 0.16 });
  graphics.circle(-4, 0, 48).stroke({ color, alpha: 0.38, width: 3 });
}

function drawEventEffects(
  graphics: Graphics,
  boats: BoatSummary[],
  layout: ReturnType<typeof getRaceLayout>,
  time: number,
) {
  graphics.clear();
  boats.forEach((boat, index) => {
    if (!boat.active_event) return;
    const progress = Math.max(0, Math.min(1, (boat.position ?? 0) / FINISH));
    const x = layout.left + progress * (layout.right - layout.left);
    const y = layout.top + index * layout.laneHeight + layout.laneHeight / 2;
    const color =
      boat.active_event_kind === "negative"
        ? 0xfb7185
        : boat.active_event_kind === "mixed"
          ? 0xc084fc
          : 0xfde68a;

    graphics.circle(x, y, 96 + Math.sin(time * 4) * 10).stroke({ color, alpha: 0.24, width: 4 });
    for (let i = 0; i < 22; i += 1) {
      const angle = time * 2.4 + i * 0.68;
      const radius = 44 + ((i * 13 + time * 46) % 62);
      graphics.circle(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.46, 3.2).fill({
        color,
        alpha: 0.32,
      });
    }
  });
}

function hexToPixi(value: string) {
  return Number.parseInt(value.replace("#", ""), 16);
}

function speedToLean(speed: number) {
  return Math.max(-0.035, Math.min(0.035, speed / 280));
}
