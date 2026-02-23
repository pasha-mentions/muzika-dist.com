import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, RotateCcw, Gamepad2, Trophy, Copy, Check } from "lucide-react";

interface GameObject {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  type: "vinyl" | "bad";
  rotation: number;
}

const PROMO_CODE = "muzika#t4716mn";

const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 540;
const CATCHER_WIDTH = 56;
const CATCHER_HEIGHT = 56;
const ITEM_SIZE = 36;
const BASE_SPEED = 4.15;
const SPEED_INCREMENT = 0.83;
const SPAWN_INTERVAL_BASE = 1200;
const SPAWN_INTERVAL_MIN = 500;
const BAD_ITEM_CHANCE = 0.54;
const MAX_MISSED = 3;

function createGameAudio() {
  let ctx: AudioContext | null = null;
  let bgGain: GainNode | null = null;
  let bgInterval: ReturnType<typeof setInterval> | null = null;

  const getCtx = () => {
    if (!ctx) ctx = new AudioContext();
    return ctx;
  };

  const playCatch = () => {
    const ac = getCtx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ac.currentTime + 0.08);
    g.gain.setValueAtTime(0.15, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.15);
  };

  const playMiss = () => {
    const ac = getCtx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(220, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(110, ac.currentTime + 0.2);
    g.gain.setValueAtTime(0.12, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.25);
  };

  const playCrash = () => {
    const ac = getCtx();
    const bufSize = ac.sampleRate * 0.3;
    const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.2, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2000, ac.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.3);
    src.connect(filter).connect(g).connect(ac.destination);
    src.start();

    const o = ac.createOscillator();
    const og = ac.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(400, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.25);
    og.gain.setValueAtTime(0.1, ac.currentTime);
    og.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
    o.connect(og).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.25);
  };

  const startBgMusic = () => {
    const ac = getCtx();
    bgGain = ac.createGain();
    bgGain.gain.setValueAtTime(0.06, ac.currentTime);
    bgGain.connect(ac.destination);

    const bassNotes = [130.81, 146.83, 164.81, 146.83, 130.81, 110, 123.47, 130.81];
    const melodyNotes = [523.25, 659.25, 783.99, 659.25, 523.25, 440, 493.88, 523.25];
    let step = 0;

    const playStep = () => {
      if (!bgGain) return;
      const ac2 = getCtx();
      const noteIdx = step % bassNotes.length;

      const bass = ac2.createOscillator();
      const bassG = ac2.createGain();
      bass.type = "sine";
      bass.frequency.value = bassNotes[noteIdx];
      bassG.gain.setValueAtTime(0.08, ac2.currentTime);
      bassG.gain.exponentialRampToValueAtTime(0.001, ac2.currentTime + 0.28);
      bass.connect(bassG).connect(bgGain!);
      bass.start();
      bass.stop(ac2.currentTime + 0.3);

      const mel = ac2.createOscillator();
      const melG = ac2.createGain();
      mel.type = "square";
      mel.frequency.value = melodyNotes[noteIdx];
      melG.gain.setValueAtTime(0.03, ac2.currentTime);
      melG.gain.exponentialRampToValueAtTime(0.001, ac2.currentTime + 0.2);
      const melFilter = ac2.createBiquadFilter();
      melFilter.type = "lowpass";
      melFilter.frequency.value = 1500;
      mel.connect(melFilter).connect(melG).connect(bgGain!);
      mel.start();
      mel.stop(ac2.currentTime + 0.22);

      if (step % 2 === 0) {
        const hihat = ac2.createBufferSource();
        const hhBuf = ac2.createBuffer(1, ac2.sampleRate * 0.05, ac2.sampleRate);
        const hhData = hhBuf.getChannelData(0);
        for (let i = 0; i < hhData.length; i++) hhData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / hhData.length, 4);
        hihat.buffer = hhBuf;
        const hhG = ac2.createGain();
        hhG.gain.setValueAtTime(0.04, ac2.currentTime);
        const hhF = ac2.createBiquadFilter();
        hhF.type = "highpass";
        hhF.frequency.value = 8000;
        hihat.connect(hhF).connect(hhG).connect(bgGain!);
        hihat.start();
      }

      step++;
    };

    playStep();
    bgInterval = setInterval(playStep, 300);
  };

  const stopBgMusic = () => {
    if (bgInterval) { clearInterval(bgInterval); bgInterval = null; }
    if (bgGain) { bgGain.gain.setValueAtTime(0, getCtx().currentTime); bgGain = null; }
  };

  const cleanup = () => {
    stopBgMusic();
    if (ctx) { ctx.close().catch(() => {}); ctx = null; }
  };

  return { playCatch, playMiss, playCrash, startBgMusic, stopBgMusic, cleanup };
}

export default function Catch100Game({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<"intro" | "playing" | "gameover" | "won">("intro");
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState(0);
  const [copied, setCopied] = useState(false);
  const [gameOverReason, setGameOverReason] = useState<"bad" | "missed">("bad");

  const catcherXRef = useRef(CANVAS_WIDTH / 2 - CATCHER_WIDTH / 2);
  const objectsRef = useRef<GameObject[]>([]);
  const scoreRef = useRef(0);
  const missedRef = useRef(0);
  const gameStateRef = useRef<"intro" | "playing" | "gameover" | "won">("intro");
  const animFrameRef = useRef<number>(0);
  const lastSpawnRef = useRef(0);
  const touchStartRef = useRef<number | null>(null);
  const spotifyImgRef = useRef<HTMLImageElement | null>(null);
  const audioRef = useRef<ReturnType<typeof createGameAudio> | null>(null);

  const spotifyGreen = "#1DB954";

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 168 168"><path fill="#1ED760" d="M84 0C37.6 0 0 37.6 0 84s37.6 84 84 84 84-37.6 84-84S130.4 0 84 0zm38.5 121.2c-1.5 2.5-4.7 3.2-7.1 1.7-19.6-12-44.2-14.7-73.2-8-2.8.6-5.6-1.1-6.2-3.9-.6-2.8 1.1-5.6 3.9-6.2 31.8-7.3 59-4.2 81.1 9.3 2.5 1.5 3.2 4.7 1.5 7.1zm10.3-22.8c-1.9 3.1-5.9 4-9 2.1-22.4-13.8-56.6-17.8-83.1-9.7-3.4 1-7-1-8-4.4-1-3.4 1-7 4.4-8 30.3-9.2 68-4.8 93.7 11.1 3 1.8 4 5.9 2 9zm.9-23.8c-26.9-16-71.3-17.5-97-9.7-4.1 1.3-8.5-1-9.8-5.1-1.3-4.1 1-8.5 5.1-9.8 29.5-9 78.4-7.2 109.3 11.2 3.7 2.2 4.9 7 2.7 10.7-2.2 3.7-7 4.9-10.3 2.7z"/></svg>`);
    spotifyImgRef.current = img;
  }, []);

  const drawSpotifyCatcher = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
    if (spotifyImgRef.current && spotifyImgRef.current.complete) {
      ctx.drawImage(spotifyImgRef.current, x, y, size, size);
    } else {
      const cx = x + size / 2;
      const cy = y + size / 2;
      const r = size / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = spotifyGreen;
      ctx.fill();
    }
  }, []);

  const drawVinyl = useCallback((ctx: CanvasRenderingContext2D, obj: GameObject) => {
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    const r = obj.width / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(obj.rotation);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.3 + i * 0.18), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(80, 80, 80, 0.4)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = "#9333ea";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();

    ctx.restore();
  }, []);

  const drawBadItem = useCallback((ctx: CanvasRenderingContext2D, obj: GameObject) => {
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    const r = obj.width / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(obj.rotation);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.3 + i * 0.18), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(120, 40, 40, 0.4)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-r * 0.1, -r * 0.9);
    ctx.lineTo(r * 0.15, -r * 0.2);
    ctx.lineTo(-r * 0.05, r * 0.3);
    ctx.lineTo(r * 0.2, r * 0.85);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(r * 0.15, -r * 0.2);
    ctx.lineTo(r * 0.5, -r * 0.4);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-r * 0.05, r * 0.3);
    ctx.lineTo(-r * 0.4, r * 0.5);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }, []);

  const spawnObject = useCallback(() => {
    const type: "vinyl" | "bad" = Math.random() < BAD_ITEM_CHANCE ? "bad" : "vinyl";
    const speedMultiplier = 1 + Math.floor(scoreRef.current / 15) * SPEED_INCREMENT;
    const obj: GameObject = {
      x: Math.random() * (CANVAS_WIDTH - ITEM_SIZE),
      y: -ITEM_SIZE,
      width: ITEM_SIZE,
      height: ITEM_SIZE,
      speed: (BASE_SPEED + Math.random() * 1.5) * speedMultiplier,
      type,
      rotation: 0,
    };
    objectsRef.current.push(obj);
  }, []);

  const checkCollision = useCallback((obj: GameObject, catcherX: number) => {
    const catcherY = CANVAS_HEIGHT - CATCHER_HEIGHT - 10;
    return (
      obj.x + obj.width > catcherX &&
      obj.x < catcherX + CATCHER_WIDTH &&
      obj.y + obj.height > catcherY &&
      obj.y < catcherY + CATCHER_HEIGHT
    );
  }, []);

  const gameLoop = useCallback((timestamp: number) => {
    if (gameStateRef.current !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const spawnInterval = Math.max(
      SPAWN_INTERVAL_MIN,
      SPAWN_INTERVAL_BASE - Math.floor(scoreRef.current / 15) * 80
    );
    if (timestamp - lastSpawnRef.current > spawnInterval) {
      spawnObject();
      lastSpawnRef.current = timestamp;
    }

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = "rgba(33, 33, 33, 0.95)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, "rgba(147, 51, 234, 0.08)");
    gradient.addColorStop(0.5, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(1, "rgba(29, 185, 84, 0.08)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const catcherX = catcherXRef.current;
    const catcherY = CANVAS_HEIGHT - CATCHER_HEIGHT - 10;
    drawSpotifyCatcher(ctx, catcherX, catcherY, CATCHER_WIDTH);

    const newObjects: GameObject[] = [];
    for (const obj of objectsRef.current) {
      obj.y += obj.speed;
      obj.rotation += 0.03;

      if (checkCollision(obj, catcherX)) {
        if (obj.type === "bad") {
          audioRef.current?.playCrash();
          audioRef.current?.stopBgMusic();
          gameStateRef.current = "gameover";
          setGameOverReason("bad");
          setGameState("gameover");
          return;
        } else {
          audioRef.current?.playCatch();
          scoreRef.current += 1;
          setScore(scoreRef.current);
          if (scoreRef.current >= 100) {
            audioRef.current?.stopBgMusic();
            gameStateRef.current = "won";
            setGameState("won");
            return;
          }
          continue;
        }
      }

      if (obj.y >= CANVAS_HEIGHT + ITEM_SIZE) {
        if (obj.type === "vinyl") {
          audioRef.current?.playMiss();
          missedRef.current += 1;
          setMissed(missedRef.current);
          if (missedRef.current >= MAX_MISSED) {
            audioRef.current?.stopBgMusic();
            gameStateRef.current = "gameover";
            setGameOverReason("missed");
            setGameState("gameover");
            return;
          }
        }
        continue;
      }

      if (obj.type === "vinyl") {
        drawVinyl(ctx, obj);
      } else {
        drawBadItem(ctx, obj);
      }
      newObjects.push(obj);
    }
    objectsRef.current = newObjects;

    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${scoreRef.current}/100`, 12, 28);

    const progressWidth = (scoreRef.current / 100) * (CANVAS_WIDTH - 24);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(12, 36, CANVAS_WIDTH - 24, 4);
    ctx.fillStyle = spotifyGreen;
    ctx.fillRect(12, 36, progressWidth, 4);

    ctx.textAlign = "right";
    ctx.font = "12px Inter, sans-serif";
    ctx.fillStyle = "#ef4444";
    for (let i = 0; i < MAX_MISSED; i++) {
      const heartX = CANVAS_WIDTH - 14 - i * 20;
      if (i < missedRef.current) {
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillText("💿", heartX, 28);
      } else {
        ctx.fillStyle = "#fff";
        ctx.fillText("💿", heartX, 28);
      }
    }

    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [spawnObject, checkCollision, drawSpotifyCatcher, drawVinyl, drawBadItem]);

  const resetGame = useCallback(() => {
    scoreRef.current = 0;
    missedRef.current = 0;
    setScore(0);
    setMissed(0);
    objectsRef.current = [];
    catcherXRef.current = CANVAS_WIDTH / 2 - CATCHER_WIDTH / 2;
    lastSpawnRef.current = 0;
    gameStateRef.current = "playing";
    setGameState("playing");
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop]);

  const startGame = useCallback(() => {
    scoreRef.current = 0;
    missedRef.current = 0;
    setScore(0);
    setMissed(0);
    objectsRef.current = [];
    catcherXRef.current = CANVAS_WIDTH / 2 - CATCHER_WIDTH / 2;
    lastSpawnRef.current = 0;
    gameStateRef.current = "playing";
    setGameState("playing");
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || gameStateRef.current !== "playing") return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const x = (e.clientX - rect.left) * scaleX - CATCHER_WIDTH / 2;
      catcherXRef.current = Math.max(0, Math.min(CANVAS_WIDTH - CATCHER_WIDTH, x));
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas || gameStateRef.current !== "playing") return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const touch = e.touches[0];
      const x = (touch.clientX - rect.left) * scaleX - CATCHER_WIDTH / 2;
      catcherXRef.current = Math.max(0, Math.min(CANVAS_WIDTH - CATCHER_WIDTH, x));
    };

    const handleTouchStart = (e: TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const touch = e.touches[0];
      const x = (touch.clientX - rect.left) * scaleX - CATCHER_WIDTH / 2;
      catcherXRef.current = Math.max(0, Math.min(CANVAS_WIDTH - CATCHER_WIDTH, x));
      touchStartRef.current = touch.clientX;
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("mousemove", handleMouseMove);
      canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
      canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    }

    return () => {
      if (canvas) {
        canvas.removeEventListener("mousemove", handleMouseMove);
        canvas.removeEventListener("touchmove", handleTouchMove);
        canvas.removeEventListener("touchstart", handleTouchStart);
      }
    };
  }, [gameState]);

  const copyPromoCode = () => {
    navigator.clipboard.writeText(PROMO_CODE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative bg-zinc-900 rounded-xl border border-zinc-700 shadow-2xl overflow-hidden max-w-[400px] w-full">
        <div className="flex items-center justify-between p-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-white">Catch 100</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {gameState === "intro" && (
          <div className="p-6 space-y-5">
            <div className="text-center">
              <div className="text-5xl mb-3">💿</div>
              <h2 className="text-lg font-bold text-white mb-1">Catch 100</h2>
              <p className="text-zinc-400 text-sm">Злови 100 платівок — отримай приз!</p>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-300">Правила гри:</h3>
              <ul className="space-y-2">
                <li className="flex items-start gap-2.5 text-sm text-zinc-300">
                  <span className="text-lg leading-none mt-0.5">💿</span>
                  <span>Лови платівки, рухаючи логотип Spotify мишкою або пальцем</span>
                </li>
                <li className="flex items-start gap-2.5 text-sm text-zinc-300">
                  <span className="text-lg leading-none mt-0.5">🔴</span>
                  <span>Уникай тріснутих платівок (червоні) — одне торкання і гра закінчена!</span>
                </li>
                <li className="flex items-start gap-2.5 text-sm text-zinc-300">
                  <span className="text-lg leading-none mt-0.5">❌</span>
                  <span>Не пропускай платівки — 3 пропущені і гра завершена</span>
                </li>
                <li className="flex items-start gap-2.5 text-sm text-zinc-300">
                  <span className="text-lg leading-none mt-0.5">⚡</span>
                  <span>Кожні 15 зловлених — швидкість зростає</span>
                </li>
              </ul>
            </div>

            <div className="bg-zinc-800/60 rounded-lg p-3 border border-zinc-700">
              <p className="text-xs text-zinc-400 mb-1.5">Приз за 100 зловлених:</p>
              <ul className="space-y-1">
                <li className="flex items-start gap-1.5 text-xs text-zinc-200">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span>Безкоштовний аудіо реліз</span>
                </li>
                <li className="flex items-start gap-1.5 text-xs text-zinc-200">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span>Доставка музичного відео</span>
                </li>
                <li className="flex items-start gap-1.5 text-xs text-zinc-200">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span>Безкоштовний запуск реклами на YouTube</span>
                </li>
              </ul>
            </div>

            <Button
              onClick={startGame}
              className="w-full bg-primary hover:bg-primary/90 text-white font-semibold h-11 text-sm gap-2"
            >
              <Gamepad2 className="w-4 h-4" />
              Почати гру
            </Button>
          </div>
        )}

        {gameState !== "intro" && (
        <>
        <div className="relative flex justify-center">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="w-full max-w-[360px] cursor-none touch-none"
            style={{ aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}
          />

          {gameState === "gameover" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="text-center px-6">
                <div className="text-4xl mb-3">{gameOverReason === "bad" ? "💥" : "😢"}</div>
                <h3 className="text-xl font-bold text-white mb-1">Гру програно!</h3>
                <p className="text-zinc-400 text-sm mb-1">
                  {gameOverReason === "bad"
                    ? "Тріснута платівка зіпсувала все"
                    : `Пропущено ${MAX_MISSED} платівки`}
                </p>
                <p className="text-zinc-300 text-sm mb-4">
                  Зловлено: <span className="text-primary font-bold">{score}</span>/100
                </p>
                <Button
                  onClick={resetGame}
                  className="bg-primary hover:bg-primary/90 text-white gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Спробувати ще
                </Button>
              </div>
            </div>
          )}

          {gameState === "won" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="text-center px-6">
                <div className="text-4xl mb-2">🎉</div>
                <Trophy className="w-10 h-10 text-yellow-400 mx-auto mb-2" />
                <h3 className="text-xl font-bold text-white mb-1">Вітаємо!</h3>
                <p className="text-zinc-300 text-sm mb-3">
                  Ви зловили всі 100 платівок!
                </p>
                <div className="text-left bg-zinc-800/60 rounded-lg p-3 mb-3 border border-zinc-700">
                  <p className="text-xs text-zinc-400 mb-1.5">Ваш приз:</p>
                  <ul className="space-y-1">
                    <li className="flex items-start gap-1.5 text-xs text-zinc-200">
                      <span className="text-green-400 mt-0.5">✓</span>
                      <span>Безкоштовний аудіо реліз</span>
                    </li>
                    <li className="flex items-start gap-1.5 text-xs text-zinc-200">
                      <span className="text-green-400 mt-0.5">✓</span>
                      <span>Доставка музичного відео</span>
                    </li>
                    <li className="flex items-start gap-1.5 text-xs text-zinc-200">
                      <span className="text-green-400 mt-0.5">✓</span>
                      <span>Безкоштовний запуск реклами на YouTube</span>
                    </li>
                  </ul>
                </div>
                <p className="text-zinc-400 text-xs mb-2">
                  Ваш промокод:
                </p>
                <div className="flex items-center justify-center gap-2 bg-zinc-800 rounded-lg px-4 py-2.5 border border-zinc-600 mb-3">
                  <code className="text-primary font-mono font-bold text-lg tracking-wide">{PROMO_CODE}</code>
                  <button
                    onClick={copyPromoCode}
                    className="text-zinc-400 hover:text-white transition-colors p-1"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-zinc-500 text-xs mb-4">
                  Вкажіть цей код при оформленні релізу
                </p>
                <Button onClick={onClose} variant="outline" className="border-zinc-600 text-white hover:bg-zinc-800">
                  Закрити
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">Рахунок:</span>
            <span className="text-sm font-bold text-white">{score}/100</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Пропущено:</span>
            <span className={`text-sm font-bold ${missed >= 2 ? "text-red-400" : "text-white"}`}>{missed}/{MAX_MISSED}</span>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
