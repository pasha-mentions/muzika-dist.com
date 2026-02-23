import { spawn, execSync } from "child_process";
import { promises as fs, existsSync, readFileSync, writeFileSync, chmodSync, cpSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import puppeteer from "puppeteer-core";
import ffmpegStatic from "ffmpeg-static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface VideoSettings {
  format: "vertical" | "square" | "portrait" | "landscape";
  backgroundType: "blurred" | "solid" | "gradient" | "video";
  solidColor: string;
  gradientColor1: string;
  gradientColor2: string;
  videoBackgroundFileId?: string;
  tagline: string;
  taglineColor: "black" | "white" | "none";
  promoTitle: string;
  promoTitleColor: "black" | "white" | "none";
  template: "glow-player" | "promo-card";
  promoLayout?: "cover" | "fullscreen" | "textonly";
  duration: number;
  storeIcons: string[];
  storeIconStyle: "black" | "white";
  audioStart: number;
  videoDarken?: boolean;
}

const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1440 },
  landscape: { width: 1920, height: 1080 },
};

interface BuildPaths {
  chromiumPath?: string;
  chromiumLdLibraryPath?: string;
  ffmpegPath?: string;
  chromiumWrapperPath?: string;
}

let _buildPaths: BuildPaths | null = null;
function getBuildPaths(): BuildPaths {
  if (_buildPaths) return _buildPaths;
  try {
    const pathsFile = path.join(__dirname, "binary-paths.json");
    if (existsSync(pathsFile)) {
      _buildPaths = JSON.parse(readFileSync(pathsFile, "utf-8"));
      console.log("Loaded build-time binary paths:", JSON.stringify(_buildPaths));
      return _buildPaths!;
    }
  } catch (err) {
    console.warn("Failed to load build-time binary paths:", err);
  }
  _buildPaths = {};
  return _buildPaths;
}

const isProduction = process.env.NODE_ENV === "production";

function isNixStorePath(p: string): boolean {
  return p.startsWith("/nix/store/") || p.startsWith("/home/runner/");
}

function testBinary(p: string, name: string): boolean {
  if (!existsSync(p)) return false;
  try {
    execSync(`"${p}" --version 2>/dev/null`, { timeout: 5000 });
    return true;
  } catch {
    console.warn(`${name} at ${p} exists but --version failed`);
    return false;
  }
}

export function isBinaryError(err: any): boolean {
  const msg = (err?.message || "") + " " + (err?.stderr?.toString() || "");
  const strErr = String(err);
  const combined = msg + " " + strErr;
  return (
    err?.status === 126 ||
    err?.code === "EIO" ||
    combined.includes("Input/output error") ||
    combined.includes("Bus error") ||
    combined.includes("EIO") ||
    combined.includes("core dumped") ||
    combined.includes("socket hang up") ||
    combined.includes("SIGBUS") ||
    combined.includes("Protocol error") ||
    combined.includes("Target closed") ||
    combined.includes("Session closed") ||
    combined.includes("Connection closed") ||
    combined.includes("WebSocket is not open") ||
    (err?.constructor?.name === "ErrorEvent" && err?.target?._closeCode === 1006)
  );
}

function copyBinaryToTmp(sourcePath: string, name: string): string | null {
  try {
    const tmpPath = path.join(os.tmpdir(), `muzika_${name}`);
    if (existsSync(tmpPath) && testBinary(tmpPath, name)) {
      return tmpPath;
    }
    console.log(`Copying ${name} from ${sourcePath} to ${tmpPath}...`);
    const data = readFileSync(sourcePath);
    console.log(`Read ${data.length} bytes from ${sourcePath}`);
    writeFileSync(tmpPath, data);
    chmodSync(tmpPath, 0o755);
    if (testBinary(tmpPath, name)) {
      console.log(`Successfully copied ${name} to ${tmpPath}`);
      return tmpPath;
    }
    console.warn(`${name} copied to ${tmpPath} but still fails`);
    return null;
  } catch (err) {
    console.warn(`Failed to copy ${name} to tmp:`, err);
    return null;
  }
}

function copyChromiumDirToTmp(chromiumBinaryPath: string): string | null {
  try {
    const chromiumDir = path.dirname(chromiumBinaryPath);
    const tmpChromiumDir = path.join(os.tmpdir(), "muzika_chromium");
    const tmpBinary = path.join(tmpChromiumDir, path.basename(chromiumBinaryPath));

    if (existsSync(tmpBinary) && testBinary(tmpBinary, "chromium")) {
      return tmpBinary;
    }

    try {
      const tmpMount = execSync("mount | grep /tmp || echo 'no /tmp mount'", { encoding: "utf-8", timeout: 5000 }).trim();
      console.log(`/tmp mount info: ${tmpMount}`);
      const dfTmp = execSync("df -h /tmp 2>/dev/null || echo 'df failed'", { encoding: "utf-8", timeout: 5000 }).trim();
      console.log(`/tmp disk space: ${dfTmp}`);
    } catch {}

    console.log(`Copying chromium directory from ${chromiumDir} to ${tmpChromiumDir}...`);
    if (existsSync(tmpChromiumDir)) {
      execSync(`rm -rf "${tmpChromiumDir}"`, { timeout: 10000 });
    }
    cpSync(chromiumDir, tmpChromiumDir, { recursive: true });
    execSync(`chmod -R 755 "${tmpChromiumDir}"`, { timeout: 10000 });

    if (testBinary(tmpBinary, "chromium")) {
      console.log(`Successfully copied chromium to ${tmpBinary}`);
      return tmpBinary;
    }
    console.warn(`Chromium copied to ${tmpBinary} but still fails`);
    return null;
  } catch (err) {
    console.warn("Failed to copy chromium dir to tmp:", err);
    return null;
  }
}

let _chromiumPath: string | null = null;
let _chromiumLdPath: string | null = null;

function getChromiumPath(): string {
  if (_chromiumPath) return _chromiumPath;

  const bp = getBuildPaths();

  const candidates: string[] = [];
  if (process.env.CHROMIUM_PATH) candidates.push(process.env.CHROMIUM_PATH);
  if (bp.chromiumWrapperPath) candidates.push(bp.chromiumWrapperPath);
  if (bp.chromiumPath) candidates.push(bp.chromiumPath);
  try {
    const w = execSync("which chromium 2>/dev/null", { encoding: "utf-8", timeout: 5000 }).trim();
    if (w) candidates.push(w);
  } catch {}

  if (isProduction) {
    for (const p of candidates) {
      if (!existsSync(p)) continue;
      const tmpChromium = copyChromiumDirToTmp(p);
      if (tmpChromium) {
        _chromiumPath = tmpChromium;
        _chromiumLdPath = bp.chromiumLdLibraryPath || null;
        console.log(`[production] Using tmp-copied chromium at: ${tmpChromium}`);
        return _chromiumPath;
      }
      if (testBinary(p, "chromium")) {
        _chromiumPath = p;
        _chromiumLdPath = bp.chromiumLdLibraryPath || null;
        console.log(`[production] Using chromium at: ${p}`);
        return p;
      }
    }
  }

  for (const p of candidates) {
    if (testBinary(p, "chromium")) {
      _chromiumPath = p;
      console.log(`Using chromium at: ${p}`);
      return p;
    }
  }

  if (bp.chromiumPath && existsSync(bp.chromiumPath)) {
    const tmpChromium = copyChromiumDirToTmp(bp.chromiumPath);
    if (tmpChromium) {
      _chromiumPath = tmpChromium;
      _chromiumLdPath = bp.chromiumLdLibraryPath || null;
      console.log(`Using tmp-copied chromium at: ${tmpChromium}`);
      return _chromiumPath;
    }

    _chromiumPath = bp.chromiumPath;
    _chromiumLdPath = bp.chromiumLdLibraryPath || null;
    console.log(`Using build-resolved chromium at: ${bp.chromiumPath} (with LD_LIBRARY_PATH)`);
    return _chromiumPath;
  }

  console.warn("chromium: no working binary found, falling back to 'chromium'");
  _chromiumPath = "chromium";
  return _chromiumPath;
}

export function getChromiumLdPath(): string | null {
  getChromiumPath();
  return _chromiumLdPath;
}

export function resetChromiumPath(): void {
  _chromiumPath = null;
  _chromiumLdPath = null;
}

let _ffmpegPath: string | null = null;
export function getFfmpegPath(): string {
  if (_ffmpegPath) return _ffmpegPath;

  const bp = getBuildPaths();
  const candidates: (string | null | undefined)[] = [
    process.env.FFMPEG_PATH,
    ffmpegStatic,
    bp.ffmpegPath,
  ];
  try {
    const w = execSync("which ffmpeg 2>/dev/null", { encoding: "utf-8", timeout: 5000 }).trim();
    if (w) candidates.push(w);
  } catch {}

  if (isProduction) {
    for (const p of candidates) {
      if (!p || !existsSync(p)) continue;
      const tmpResult = copyBinaryToTmp(p, "ffmpeg");
      if (tmpResult) {
        _ffmpegPath = tmpResult;
        console.log(`[production] Using tmp-copied ffmpeg at: ${tmpResult}`);
        return _ffmpegPath;
      }
      if (testBinary(p, "ffmpeg")) {
        _ffmpegPath = p;
        console.log(`[production] Using ffmpeg at: ${p}`);
        return p;
      }
    }
  }

  for (const p of candidates) {
    if (!p) continue;
    if (testBinary(p, "ffmpeg")) {
      _ffmpegPath = p;
      console.log(`Using ffmpeg at: ${p}`);
      return p;
    }
  }

  for (const p of candidates) {
    if (!p) continue;
    if (existsSync(p)) {
      const tmpResult = copyBinaryToTmp(p, "ffmpeg");
      if (tmpResult) {
        _ffmpegPath = tmpResult;
        console.log(`Using tmp-copied ffmpeg at: ${tmpResult}`);
        return _ffmpegPath;
      }
    }
  }

  console.warn("ffmpeg: no working binary found, falling back to 'ffmpeg'");
  _ffmpegPath = "ffmpeg";
  return _ffmpegPath;
}

export function resetFfmpegPath(): void {
  _ffmpegPath = null;
}

export function initializeBinaries(): void {
  console.log("Pre-resolving binary paths...");
  try {
    const ffmpeg = getFfmpegPath();
    console.log(`ffmpeg resolved to: ${ffmpeg}`);
  } catch (err) {
    console.warn("Failed to pre-resolve ffmpeg:", err);
  }
  try {
    const chromium = getChromiumPath();
    console.log(`chromium resolved to: ${chromium}`);
  } catch (err) {
    console.warn("Failed to pre-resolve chromium:", err);
  }
}

export async function renderMotionVideo(
  artworkBuffer: Buffer | null,
  audioBuffer: Buffer | null,
  trackTitle: string,
  artistName: string,
  settings: VideoSettings,
  onProgress?: (percent: number, stage: string) => void,
  videoBackgroundBuffer?: Buffer | null,
): Promise<Buffer> {
  if (settings.promoLayout === 'textonly' && settings.backgroundType !== 'video') {
    settings.backgroundType = 'video';
  }
  const dims = FORMAT_DIMENSIONS[settings.format] || FORMAT_DIMENSIONS.vertical;
  const { width, height } = dims;
  const fps = 20;
  const totalFrames = fps * settings.duration;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "muzika-video-"));
  const outputPath = path.join(tmpDir, "output.mp4");
  const audioPath = audioBuffer ? path.join(tmpDir, "audio.wav") : null;

  let browser: any = null;

  try {
    if (audioBuffer && audioPath) {
      await fs.writeFile(audioPath, audioBuffer);
    }

    const videoBgPath = (settings.backgroundType === "video" && videoBackgroundBuffer)
      ? path.join(tmpDir, "videobg.mp4")
      : null;
    if (videoBgPath && videoBackgroundBuffer) {
      await fs.writeFile(videoBgPath, videoBackgroundBuffer);
    }
    const useVideoBg = !!videoBgPath;
    const framesDir = useVideoBg ? path.join(tmpDir, "frames") : null;
    if (framesDir) {
      await fs.mkdir(framesDir, { recursive: true });
    }

    let artworkDataUrl: string | null = null;
    if (artworkBuffer) {
      const ext = artworkBuffer[0] === 0x89 ? "png" : "jpeg";
      artworkDataUrl = `data:image/${ext};base64,${artworkBuffer.toString("base64")}`;
    }

    onProgress?.(2, "preparing");

    const htmlPath = path.join(__dirname, "video-render-page.html");
    const htmlContent = await fs.readFile(htmlPath, "utf-8");
    const renderPagePath = path.join(tmpDir, "render.html");
    await fs.writeFile(renderPagePath, htmlContent);

    onProgress?.(3, "launching");

    const launchBrowser = async () => {
      const chromiumPath = getChromiumPath();
      const ldPath = getChromiumLdPath();
      console.log("Launching Chromium from:", chromiumPath, "NODE_ENV:", process.env.NODE_ENV, ldPath ? "(with custom LD_LIBRARY_PATH)" : "");

      const env = ldPath ? {
        ...process.env,
        LD_LIBRARY_PATH: ldPath + (process.env.LD_LIBRARY_PATH ? ":" + process.env.LD_LIBRARY_PATH : ""),
      } : undefined;

      return puppeteer.launch({
        executablePath: chromiumPath,
        headless: "new",
        protocolTimeout: 180000,
        timeout: 90000,
        env,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--disable-extensions",
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--disable-software-rasterizer",
          "--disable-features=site-per-process,TranslateUI",
          "--js-flags=--max-old-space-size=512",
          "--font-render-hinting=none",
          "--disable-ipc-flooding-protection",
          "--disable-component-update",
          "--disable-domain-reliability",
          "--disable-print-preview",
          "--mute-audio",
          "--hide-scrollbars",
          "--single-process",
          "--no-zygote",
        ],
      });
    };

    const attemptLaunch = async (attempt: number): Promise<any> => {
      try {
        return await launchBrowser();
      } catch (launchErr: any) {
        if (isBinaryError(launchErr) && attempt < 3) {
          console.warn(`Chromium launch failed (attempt ${attempt}), resetting path and retrying in 2s...`, launchErr?.message?.substring(0, 200));
          resetChromiumPath();
          try {
            const tmpChromiumDir = path.join(os.tmpdir(), "muzika_chromium");
            if (existsSync(tmpChromiumDir)) {
              execSync(`rm -rf "${tmpChromiumDir}"`, { timeout: 10000 });
              console.log("Cleaned /tmp chromium dir for fresh retry");
            }
          } catch {}
          await new Promise(r => setTimeout(r, 2000));
          return attemptLaunch(attempt + 1);
        }
        throw launchErr;
      }
    };

    browser = await attemptLaunch(1);
    console.log("Chromium launched successfully");

    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(`file://${renderPagePath}`, { waitUntil: "load" });
    await page.waitForFunction("window.__ready === true", { timeout: 10000 });

    onProgress?.(4, "loading");

    if (artworkDataUrl) {
      await page.evaluate((url: string) => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        });
      }, artworkDataUrl);
    }

    await page.evaluate(
      (config: any) => {
        (window as any).initLayout(config);
      },
      {
        width,
        height,
        settings,
        artworkUrl: artworkDataUrl,
        trackTitle,
        artistName,
      },
    );

    await new Promise((r) => setTimeout(r, 100));

    onProgress?.(5, "rendering");

    if (useVideoBg) {
      for (let frame = 0; frame < totalFrames; frame++) {
        const progress = frame / totalFrames;

        try {
          await page.evaluate((p: number, dur: number) => {
            (window as any).updateFrame(p, dur);
          }, progress, settings.duration);

          const screenshotBuf = await page.screenshot({
            type: "png",
            clip: { x: 0, y: 0, width, height },
            omitBackground: true,
          });

          const framePath = path.join(framesDir!, `frame_${String(frame).padStart(6, '0')}.png`);
          writeFileSync(framePath, screenshotBuf);
        } catch (frameErr: any) {
          console.error(`Frame ${frame}/${totalFrames} capture failed:`, frameErr?.message?.substring(0, 200));
          throw frameErr;
        }

        if (frame % 15 === 0 || frame === totalFrames - 1) {
          const pct = Math.round(5 + (progress * 75));
          onProgress?.(pct, "rendering");
        }
      }

      onProgress?.(80, "compositing");

      const compositeArgs = [
        "-y",
        "-stream_loop", "-1",
        "-i", videoBgPath!,
        "-framerate", `${fps}`,
        "-i", path.join(framesDir!, "frame_%06d.png"),
      ];

      if (audioPath) {
        compositeArgs.push(
          "-ss", `${settings.audioStart}`,
          "-i", audioPath,
          "-t", `${settings.duration}`,
        );
      }

      const darkenFilter = settings.videoDarken !== false ? ",eq=brightness=-0.3:saturation=1" : "";
      compositeArgs.push(
        "-filter_complex",
        `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1${darkenFilter}[bg];[1:v]format=rgba[fg];[bg][fg]overlay=0:0:shortest=1[out]`,
        "-map", "[out]",
      );

      if (audioPath) {
        compositeArgs.push("-map", "2:a");
      }

      compositeArgs.push(
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-t", `${settings.duration}`,
      );

      if (audioPath) {
        compositeArgs.push(
          "-c:a", "aac",
          "-b:a", "128k",
          "-shortest",
        );
      }

      compositeArgs.push(outputPath);

      const compositeProc = spawn(getFfmpegPath(), compositeArgs, { stdio: ["pipe", "pipe", "pipe"] });
      let compStderr = "";
      compositeProc.stderr?.on("data", (chunk: Buffer) => { compStderr += chunk.toString(); });

      await new Promise<void>((resolve, reject) => {
        compositeProc.on("close", (code: number) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg composite exited with code ${code}: ${compStderr.slice(-500)}`));
        });
        compositeProc.on("error", reject);
      });
    } else {
      const ffmpegArgs = [
        "-y",
        "-f", "mjpeg",
        "-framerate", `${fps}`,
        "-i", "pipe:0",
      ];

      if (audioPath) {
        ffmpegArgs.push(
          "-ss", `${settings.audioStart}`,
          "-i", audioPath,
          "-t", `${settings.duration}`,
        );
      }

      ffmpegArgs.push(
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
      );

      if (audioPath) {
        ffmpegArgs.push(
          "-c:a", "aac",
          "-b:a", "128k",
          "-shortest",
        );
      }

      ffmpegArgs.push(outputPath);

      const launchFfmpeg = () => {
        const proc = spawn(getFfmpegPath(), ffmpegArgs, { stdio: ["pipe", "pipe", "pipe"] });
        return proc;
      };

      let ffmpeg = launchFfmpeg();
      let ffmpegReady = true;

      await new Promise<void>((resolve, reject) => {
        const onReady = () => resolve();
        ffmpeg.on("spawn", onReady);
        ffmpeg.on("error", (err: any) => {
          ffmpeg.removeListener("spawn", onReady);
          if (isBinaryError(err)) {
            console.warn("ffmpeg spawn failed with binary error, resetting path and retrying...", err?.message?.substring(0, 200));
            resetFfmpegPath();
            ffmpeg = launchFfmpeg();
            ffmpeg.on("spawn", () => resolve());
            ffmpeg.on("error", (retryErr) => {
              ffmpegReady = false;
              reject(retryErr);
            });
          } else {
            ffmpegReady = false;
            reject(err);
          }
        });
      });

      let stderrData = "";
      ffmpeg.stderr?.on("data", (chunk: Buffer) => {
        stderrData += chunk.toString();
      });

      for (let frame = 0; frame < totalFrames; frame++) {
        const progress = frame / totalFrames;

        try {
          await page.evaluate((p: number, dur: number) => {
            (window as any).updateFrame(p, dur);
          }, progress, settings.duration);

          const screenshotBuf = await page.screenshot({
            type: "jpeg",
            quality: 85,
            clip: { x: 0, y: 0, width, height },
            omitBackground: false,
          });

          const canWrite = ffmpeg.stdin?.write(screenshotBuf);
          if (!canWrite) {
            await new Promise<void>((resolve) => {
              const timeout = setTimeout(() => resolve(), 10000);
              ffmpeg.stdin?.once("drain", () => { clearTimeout(timeout); resolve(); });
            });
          }
        } catch (frameErr: any) {
          console.error(`Frame ${frame}/${totalFrames} capture failed:`, frameErr?.message?.substring(0, 200));
          throw frameErr;
        }

        if (frame % 15 === 0 || frame === totalFrames - 1) {
          const pct = Math.round(5 + (progress * 85));
          onProgress?.(pct, "rendering");
        }
      }

      ffmpeg.stdin?.end();
      onProgress?.(90, "encoding");

      await new Promise<void>((resolve, reject) => {
        ffmpeg.on("close", (code: number) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg exited with code ${code}: ${stderrData.slice(-500)}`));
        });
        ffmpeg.on("error", reject);
      });
    }

    onProgress?.(95, "finalizing");
    const result = await fs.readFile(outputPath);
    onProgress?.(100, "done");
    return result;
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
