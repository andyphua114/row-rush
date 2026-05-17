import { useEffect, useRef, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import { StatusPill } from "../components/StatusPill";
import { useRowRushSocket } from "../lib/socket";
import type { BoatSummary, RaceState } from "../types";

const FINISH = 1000;

export function ProjectorPage() {
  const { state, status } = useRowRushSocket<RaceState>("projector");
  const joinUrl = `${window.location.origin}/`;
  return (
    <div className="h-dvh overflow-hidden bg-slate-950 font-display text-white">
      <div className="absolute left-6 top-5 z-20">
        <p className="text-sm font-black uppercase tracking-[0.22em] text-teal-100">
          Row Rush
        </p>
        <h1 className="text-6xl font-black drop-shadow-lg">
          Round {Math.min(state?.round ?? 1, 3)}
        </h1>
      </div>
      <div className="absolute right-6 top-6 z-20">
        <StatusPill status={status} />
      </div>

      {!state || state.phase === "LOBBY" ? (
        <LobbyScreen joinUrl={joinUrl} />
      ) : null}
      {state?.phase === "BOAT_SELECTION" || state?.phase === "ADMIN_REVIEW" ? (
        <SelectionScreen state={state} />
      ) : null}
      {state ? <RaceCanvas state={state} /> : null}
      {state?.phase === "COUNTDOWN" && <Countdown value={state.countdown} />}
      {state?.phase === "RACING" && <RaceOverlay state={state} />}
      {state?.phase === "ROUND_RESULTS" && <RoundResults state={state} />}
      {state?.phase === "ROUND_LEADERBOARD" && (
        <Leaderboard
          state={state}
          title="Leaderboard"
          subtitle={`After round ${state.round}`}
        />
      )}
      {state?.phase === "FINAL_RESULTS" && (
        <Leaderboard
          state={state}
          title="Final Leaderboard"
          subtitle="Champion rowers"
        />
      )}
    </div>
  );
}

function RaceCanvas({ state }: { state: RaceState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const resize = () => {
      canvas.width = window.innerWidth * window.devicePixelRatio;
      canvas.height = window.innerHeight * window.devicePixelRatio;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(
        window.devicePixelRatio,
        0,
        0,
        window.devicePixelRatio,
        0,
        0,
      );
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (now: number) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const current = stateRef.current;
      const wave = now / 1000;
      ctx.clearRect(0, 0, width, height);
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#063247");
      gradient.addColorStop(0.38, "#0b7f86");
      gradient.addColorStop(1, "#031722");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const sun = ctx.createRadialGradient(
        width * 0.5,
        height * 0.12,
        20,
        width * 0.5,
        height * 0.12,
        width * 0.7,
      );
      sun.addColorStop(0, "rgba(125, 211, 252, 0.22)");
      sun.addColorStop(1, "rgba(125, 211, 252, 0)");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, width, height);

      for (let y = 0; y < height; y += 24) {
        ctx.strokeStyle = `rgba(255,255,255,${0.06 + ((y / 24) % 3) * 0.025})`;
        ctx.lineWidth = y % 48 === 0 ? 3 : 1.5;
        ctx.beginPath();
        for (let x = -40; x < width + 40; x += 24) {
          const yy = y + Math.sin(x / 58 + wave * 2.4 + y / 120) * 7;
          if (x === -40) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }

      const top = 140;
      const laneHeight = Math.max(78, (height - 220) / 5);
      const left = 90;
      const right = width - 140;
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 2;
      for (let index = 0; index < 5; index++) {
        const y = top + index * laneHeight;
        const laneGradient = ctx.createLinearGradient(left, y, right, y);
        laneGradient.addColorStop(0, "rgba(255,255,255,0.04)");
        laneGradient.addColorStop(0.5, "rgba(255,255,255,0.11)");
        laneGradient.addColorStop(1, "rgba(255,255,255,0.03)");
        ctx.fillStyle = laneGradient;
        roundRect(
          ctx,
          left - 18,
          y + 10,
          right - left + 52,
          laneHeight - 20,
          26,
        );
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(left, y + laneHeight / 2);
        ctx.lineTo(right, y + laneHeight / 2);
        ctx.stroke();
        drawBuoys(ctx, left, right, y + laneHeight / 2, index, wave);
      }
      drawFinishLine(ctx, right, top - 16, laneHeight * 5 - 4);

      current.boats.forEach((boat, index) => {
        const progress = Math.max(
          0,
          Math.min(1, (boat.position ?? 0) / FINISH),
        );
        const x = left + progress * (right - left);
        const y =
          top +
          index * laneHeight +
          laneHeight / 2 +
          Math.sin(wave * 4 + index) * 5;
        drawLaneLabel(ctx, 24, y, boat);
        drawWake(ctx, x, y, boat.color);
        drawBoat(ctx, x, y, boat);
      });

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
}

function drawBoat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  boat: BoatSummary,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = boat.color;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(48, 0);
  ctx.lineTo(20, 22);
  ctx.lineTo(-52, 18);
  ctx.lineTo(-64, 0);
  ctx.lineTo(-52, -18);
  ctx.lineTo(20, -22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 4;
  for (const offset of [-22, 0, 22]) {
    ctx.beginPath();
    ctx.moveTo(-8 + offset, -18);
    ctx.lineTo(-28 + offset, -38);
    ctx.moveTo(-8 + offset, 18);
    ctx.lineTo(-28 + offset, 38);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(15,23,42,0.86)";
  roundRect(ctx, -39, -13, 52, 26, 8);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "900 21px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${boat.rower_count ?? 0}`, -13, 8);
  ctx.restore();
}

function drawLaneLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  boat: BoatSummary,
) {
  ctx.save();
  ctx.fillStyle = "rgba(2,6,23,0.34)";
  roundRect(ctx, x - 12, y - 48, 190, 68, 18);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "900 18px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(boat.name, x, y - 20);
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "800 13px Inter, sans-serif";
  ctx.fillText(`${boat.rower_count ?? 0} rowers`, x, y + 2);
  ctx.restore();
}

function drawBuoys(
  ctx: CanvasRenderingContext2D,
  left: number,
  right: number,
  y: number,
  lane: number,
  wave: number,
) {
  ctx.save();
  for (let x = left + 110; x < right - 55; x += 170) {
    const bob = Math.sin(wave * 3 + lane + x / 80) * 2;
    ctx.fillStyle =
      lane % 2 === 0 ? "rgba(254, 240, 138, 0.85)" : "rgba(255,255,255,0.78)";
    ctx.beginPath();
    ctx.arc(x, y + bob, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFinishLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(x - 7, y, 14, height);
  for (let i = 0; i < height; i += 18) {
    ctx.fillStyle = i % 36 === 0 ? "#0f172a" : "#f8fafc";
    ctx.fillRect(x - 7, y + i, 14, 18);
  }
  ctx.fillStyle = "#fde68a";
  ctx.fillRect(x + 11, y, 5, height);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawWake(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color?: string,
) {
  ctx.save();
  ctx.strokeStyle = color || "white";
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x - 75 - i * 28, y - 12 + i * 10);
    ctx.quadraticCurveTo(x - 110 - i * 28, y, x - 75 - i * 28, y + 12 - i * 4);
    ctx.stroke();
  }
  ctx.restore();
}

function RaceOverlay({ state }: { state: RaceState }) {
  return (
    <>
      <div className="absolute bottom-6 right-6 z-20 rounded-2xl bg-white/92 px-6 py-4 text-right text-slate-950 shadow-2xl backdrop-blur">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
          Time
        </p>
        <p className="text-5xl font-black text-white">
          {Math.ceil(state.time_remaining)}s
        </p>
      </div>
      {state.events[0] && (
        <div className="absolute left-1/2 top-5 z-30 w-[min(680px,58vw)] -translate-x-1/2 rounded-2xl bg-amber-300 px-6 py-4 text-center text-slate-950 shadow-2xl ring-4 ring-amber-100/30">
          <p className="text-2xl font-black">{state.events[0].name}</p>
          <p className="text-base font-bold">
            {state.events[0].boat_name}: {state.events[0].description}
          </p>
        </div>
      )}
    </>
  );
}

function LobbyScreen({ joinUrl }: { joinUrl: string }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.72),#082f49_68%)] px-10 text-center">
      <div className="w-full max-w-6xl">
        <p className="text-xl font-black uppercase tracking-[0.28em] text-teal-100">
          Join the river
        </p>
        <h1 className="mt-3 text-8xl font-black drop-shadow-xl">Row Rush</h1>
        <p className="mt-5 text-3xl font-bold text-teal-50">
          Scan to grab a boat and row with your crew
        </p>
        <div className="mx-auto mt-10 grid w-fit gap-4 rounded-3xl bg-white p-6 text-slate-950 shadow-2xl">
          <QRCodeSVG
            value={joinUrl}
            size={220}
            level="M"
            fgColor="#020617"
            bgColor="#ffffff"
          />
          <p className="text-xl font-black">
            {joinUrl.replace(/^https?:\/\//, "")}
          </p>
        </div>
      </div>
    </div>
  );
}

function SelectionScreen({ state }: { state: RaceState }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950/55 px-8 text-center backdrop-blur-sm">
      <div className="projector-card rounded-3xl p-10">
        <h1 className="text-7xl font-black">Choose Your Boat</h1>
        <p className="mt-5 text-3xl font-bold text-teal-100">
          Open the game on your phone and pick a crew.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          {state.boats.map((boat) => (
            <div
              key={boat.boat_id}
              className="inline-flex items-center gap-4 rounded-2xl bg-white px-6 py-4 text-2xl font-black text-slate-950 shadow-xl"
            >
              <span
                className="boat-mark boat-mark-sm"
                style={{ "--boat-color": boat.color } as CSSProperties}
              />
              {boat.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Countdown({ value }: { value?: string | number | null }) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/55 text-[11rem] font-black backdrop-blur-sm">
      {value}
    </div>
  );
}

function RoundResults({ state }: { state: RaceState }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/70 p-8 backdrop-blur">
      <div className="w-full max-w-5xl">
        <h1 className="mb-6 text-center text-6xl font-black">Round Results</h1>
        <div className="grid gap-3">
          {state.round_results.map((result) => (
            <div
              key={result.boat_id}
              className="flex items-center justify-between rounded-2xl bg-white/95 px-6 py-4 text-slate-950 shadow-2xl"
            >
              <div className="flex items-center gap-4">
                <span className="text-4xl font-black">#{result.rank}</span>
                <span
                  className="boat-mark boat-mark-sm"
                  style={{ "--boat-color": result.color } as CSSProperties}
                />
                <div>
                  <p className="text-2xl font-black">{result.name}</p>
                  <p className="font-bold text-slate-500">
                    {result.power_name}: {result.power_trait}
                  </p>
                </div>
              </div>
              <div className="text-right text-xl font-black">
                {result.points} pts - {result.rower_count} rowers
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Leaderboard({
  state,
  title,
  subtitle,
}: {
  state: RaceState;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.76),#020617_70%)] p-8">
      <div className="w-full max-w-4xl">
        <p className="text-center text-2xl font-black uppercase tracking-[0.18em] text-teal-100">
          {subtitle}
        </p>
        <h1 className="mb-8 mt-2 text-center text-7xl font-black">{title}</h1>
        <div className="grid gap-3">
          {state.final_leaderboard.slice(0, 10).map((row, index) => (
            <div
              key={row.player_id}
              className="flex items-center justify-between rounded-2xl bg-white/95 px-6 py-4 text-slate-950 shadow-2xl"
            >
              <span className="text-3xl font-black">
                #{index + 1} {row.nickname}
              </span>
              <span className="text-3xl font-black text-teal-700">
                {row.score} pts
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
