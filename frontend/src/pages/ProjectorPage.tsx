import { useEffect, useRef } from "react";
import { StatusPill } from "../components/StatusPill";
import { useRowRushSocket } from "../lib/socket";
import type { BoatSummary, RaceState } from "../types";

const FINISH = 1000;

export function ProjectorPage() {
  const { state, status } = useRowRushSocket<RaceState>("projector");
  return (
    <div className="h-dvh overflow-hidden bg-slate-950 font-display text-white">
      <div className="absolute left-6 top-5 z-20">
        <p className="text-sm font-black uppercase tracking-[0.22em] text-teal-200">Row Rush</p>
        <h1 className="text-5xl font-black">Round {Math.min(state?.round ?? 1, 3)}</h1>
      </div>
      <div className="absolute right-6 top-6 z-20">
        <StatusPill status={status} />
      </div>

      {!state || state.phase === "LOBBY" ? <LobbyScreen /> : null}
      {state?.phase === "BOAT_SELECTION" || state?.phase === "ADMIN_REVIEW" ? <SelectionScreen state={state} /> : null}
      {state ? <RaceCanvas state={state} /> : null}
      {state?.phase === "COUNTDOWN" && <Countdown value={state.countdown} />}
      {state?.phase === "RACING" && <RaceOverlay state={state} />}
      {state?.phase === "ROUND_RESULTS" && <RoundResults state={state} />}
      {state?.phase === "ROUND_LEADERBOARD" && <Leaderboard state={state} title="Leaderboard" subtitle={`After round ${state.round}`} />}
      {state?.phase === "FINAL_RESULTS" && <Leaderboard state={state} title="Final Leaderboard" subtitle="Champion rowers" />}
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
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
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
      gradient.addColorStop(0, "#075985");
      gradient.addColorStop(0.48, "#0f766e");
      gradient.addColorStop(1, "#164e63");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      for (let y = 0; y < height; y += 28) {
        ctx.strokeStyle = `rgba(255,255,255,${0.08 + ((y / 28) % 2) * 0.03})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = -30; x < width + 30; x += 30) {
          const yy = y + Math.sin(x / 55 + wave * 2.2) * 7;
          if (x === -30) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }

      const top = 140;
      const laneHeight = Math.max(78, (height - 220) / 5);
      const left = 90;
      const right = width - 140;
      ctx.strokeStyle = "rgba(255,255,255,0.24)";
      ctx.lineWidth = 2;
      for (let index = 0; index < 5; index++) {
        const y = top + index * laneHeight;
        ctx.beginPath();
        ctx.moveTo(left, y + laneHeight / 2);
        ctx.lineTo(right, y + laneHeight / 2);
        ctx.stroke();
      }
      ctx.strokeStyle = "#fde68a";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(right, top - 16);
      ctx.lineTo(right, top + laneHeight * 5 - 20);
      ctx.stroke();

      current.boats.forEach((boat, index) => {
        const progress = Math.max(0, Math.min(1, (boat.position ?? 0) / FINISH));
        const x = left + progress * (right - left);
        const y = top + index * laneHeight + laneHeight / 2 + Math.sin(wave * 4 + index) * 5;
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

function drawBoat(ctx: CanvasRenderingContext2D, x: number, y: number, boat: BoatSummary) {
  ctx.save();
  ctx.translate(x, y);
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
  ctx.fillStyle = "rgba(15,23,42,0.86)";
  roundRect(ctx, -39, -13, 52, 26, 8);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "900 21px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${boat.rower_count ?? 0}`, -13, 8);
  ctx.restore();
}

function drawLaneLabel(ctx: CanvasRenderingContext2D, x: number, y: number, boat: BoatSummary) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "900 18px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(boat.name, x, y - 20);
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "800 13px Inter, sans-serif";
  ctx.fillText(`${boat.rower_count ?? 0} rowers`, x, y + 2);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawWake(ctx: CanvasRenderingContext2D, x: number, y: number, color?: string) {
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
      <div className="absolute bottom-6 right-6 z-20 rounded-lg bg-white px-6 py-4 text-right text-slate-950 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Time</p>
        <p className="text-5xl font-black">{Math.ceil(state.time_remaining)}s</p>
      </div>
      {state.events[0] && (
        <div className="absolute left-1/2 top-4 z-30 w-[min(620px,58vw)] -translate-x-1/2 rounded-lg bg-amber-300 px-6 py-3 text-center text-slate-950 shadow-2xl">
          <p className="text-2xl font-black">{state.events[0].name}</p>
          <p className="text-base font-bold">{state.events[0].boat_name}: {state.events[0].description}</p>
        </div>
      )}
    </>
  );
}

function LobbyScreen() {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-[radial-gradient(circle_at_center,#0f766e,#082f49_70%)] text-center">
      <div>
        <h1 className="text-8xl font-black">Row Rush</h1>
        <p className="mt-5 text-3xl font-bold text-teal-100">Scan the QR code and join on your phone</p>
        <div className="mx-auto mt-10 grid h-56 w-56 place-items-center rounded-lg bg-white text-xl font-black text-slate-950">
          QR PLACEHOLDER
        </div>
      </div>
    </div>
  );
}

function SelectionScreen({ state }: { state: RaceState }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950/50 text-center backdrop-blur-sm">
      <div>
        <h1 className="text-7xl font-black">Choose Your Boat</h1>
        <p className="mt-5 text-3xl font-bold text-teal-100">Open the game on your phone and pick a crew.</p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          {state.boats.map((boat) => (
            <div key={boat.boat_id} className="rounded-lg bg-white px-6 py-4 text-2xl font-black text-slate-950">
              <span className="mr-3 inline-block h-5 w-5 rounded-full" style={{ backgroundColor: boat.color }} />
              {boat.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Countdown({ value }: { value?: string | number | null }) {
  return <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/55 text-9xl font-black">{value}</div>;
}

function RoundResults({ state }: { state: RaceState }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/70 p-8 backdrop-blur">
      <div className="w-full max-w-5xl">
        <h1 className="mb-6 text-center text-6xl font-black">Round Results</h1>
        <div className="grid gap-3">
          {state.round_results.map((result) => (
            <div key={result.boat_id} className="flex items-center justify-between rounded-lg bg-white px-6 py-4 text-slate-950">
              <div className="flex items-center gap-4">
                <span className="text-4xl font-black">#{result.rank}</span>
                <span className="h-10 w-10 rounded-lg" style={{ backgroundColor: result.color }} />
                <div>
                  <p className="text-2xl font-black">{result.name}</p>
                  <p className="font-bold text-slate-500">{result.power_name}: {result.power_trait}</p>
                </div>
              </div>
              <div className="text-right text-xl font-black">{result.points} pts - {result.rower_count} rowers</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Leaderboard({ state, title, subtitle }: { state: RaceState; title: string; subtitle: string }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[radial-gradient(circle_at_top,#0f766e,#020617_70%)] p-8">
      <div className="w-full max-w-4xl">
        <p className="text-center text-2xl font-black uppercase tracking-[0.18em] text-teal-100">{subtitle}</p>
        <h1 className="mb-8 mt-2 text-center text-7xl font-black">{title}</h1>
        <div className="grid gap-3">
          {state.final_leaderboard.slice(0, 10).map((row, index) => (
            <div key={row.player_id} className="flex items-center justify-between rounded-lg bg-white px-6 py-4 text-slate-950">
              <span className="text-3xl font-black">#{index + 1} {row.nickname}</span>
              <span className="text-3xl font-black text-teal-700">{row.score} pts</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
