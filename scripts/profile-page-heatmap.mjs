import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const outputDir = resolve(root, "profiling");
const port = Number(process.env.PAGE_PROFILE_PORT ?? 3100);
const url = `http://127.0.0.1:${port}/`;
const durationMs = Number(process.env.PAGE_PROFILE_DURATION_MS ?? 12_000);
const viewportWidth = Number(process.env.PAGE_PROFILE_WIDTH ?? 1440);
const viewportHeight = Number(process.env.PAGE_PROFILE_HEIGHT ?? 900);
const deviceScaleFactor = Number(process.env.PAGE_PROFILE_DPR ?? 1);
const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
const reportPath = resolve(outputDir, `heatmap-page-profile-${timestamp}.json`);
const tracePath = resolve(outputDir, `heatmap-page-profile-${timestamp}.trace.json`);

const waitForServer = async () => {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(200);
  }

  throw new Error(`Vite dev server did not become ready at ${url}`);
};

const readTraceStream = async (client, stream) => {
  const chunks = [];

  while (true) {
    const result = await client.send("IO.read", { handle: stream });
    chunks.push(result.data ?? "");
    if (result.eof) break;
  }

  await client.send("IO.close", { handle: stream });
  return chunks.join("");
};

const summarizeTrace = (trace) => {
  const events = trace.traceEvents ?? [];
  const durationsByName = new Map();

  for (const event of events) {
    if (event.ph !== "X" || typeof event.dur !== "number") continue;
    const current = durationsByName.get(event.name) ?? { count: 0, totalUs: 0, maxUs: 0 };
    current.count += 1;
    current.totalUs += event.dur;
    current.maxUs = Math.max(current.maxUs, event.dur);
    durationsByName.set(event.name, current);
  }

  return Array.from(durationsByName.entries())
    .map(([name, value]) => ({
      name,
      count: value.count,
      totalMs: value.totalUs / 1_000,
      maxMs: value.maxUs / 1_000,
    }))
    .sort((left, right) => right.totalMs - left.totalMs)
    .slice(0, 30);
};

const summarizeFrameIntervals = (intervals) => {
  const sorted = [...intervals].sort((left, right) => left - right);
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? null;
  const over = (ms) => intervals.filter((interval) => interval >= ms).length;

  return {
    count: intervals.length,
    avgMs: intervals.reduce((total, interval) => total + interval, 0) / Math.max(intervals.length, 1),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: sorted.at(-1) ?? null,
    over33ms: over(33),
    over50ms: over(50),
    over100ms: over(100),
  };
};

const slowFramesFrom = (frames, heatmapEnabledAt) =>
  frames
    .filter((frame) => frame.interval >= 33)
    .map((frame) => ({
      startAfterHeatmapMs: frame.start - heatmapEnabledAt,
      endAfterHeatmapMs: frame.end - heatmapEnabledAt,
      intervalMs: frame.interval,
    }))
    .sort((left, right) => right.intervalMs - left.intervalMs)
    .slice(0, 30);

const summarizeWindows = (frames, longTasks, requestedDurationMs, actualDurationMs) => {
  const end = Math.max(requestedDurationMs, actualDurationMs);
  const windows = [];
  for (let startMs = 0; startMs < end; startMs += 5_000) {
    windows.push([startMs, startMs + 5_000]);
  }

  return windows.map(([startMs, endMs]) => {
    const windowFrames = frames.filter(
      (frame) => frame.startAfterHeatmapMs >= startMs && frame.startAfterHeatmapMs < endMs,
    );
    const windowLongTasks = longTasks.filter(
      (task) => task.startAfterHeatmapMs >= startMs && task.startAfterHeatmapMs < endMs,
    );

    return {
      window: `${startMs / 1_000}-${endMs / 1_000}s`,
      framesOver33ms: windowFrames.filter((frame) => frame.intervalMs >= 33).length,
      framesOver50ms: windowFrames.filter((frame) => frame.intervalMs >= 50).length,
      framesOver100ms: windowFrames.filter((frame) => frame.intervalMs >= 100).length,
      maxFrameMs: Math.max(0, ...windowFrames.map((frame) => frame.intervalMs)),
      longTasks: windowLongTasks.length,
      maxLongTaskMs: Math.max(0, ...windowLongTasks.map((task) => task.duration)),
      totalLongTaskMs: windowLongTasks.reduce((total, task) => total + task.duration, 0),
    };
  });
};

await mkdir(outputDir, { recursive: true });

const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

let browser;
try {
  await waitForServer();

  browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan,WebGPU",
      "--disable-background-timer-throttling",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
    deviceScaleFactor,
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];

  page.on("console", (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text(),
    });
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.stack ?? error.message);
  });

  await page.addInitScript(() => {
    window.__heatmapProfile = {
      frameIntervals: [],
      frames: [],
      frameTimes: [],
      longTasks: [],
      errors: [],
      unhandledRejections: [],
    };

    let previousFrameTime = 0;
    const sampleFrame = (time) => {
      if (previousFrameTime !== 0) {
        const interval = time - previousFrameTime;
        window.__heatmapProfile.frameIntervals.push(interval);
        window.__heatmapProfile.frames.push({
          start: previousFrameTime,
          end: time,
          interval,
        });
      }
      window.__heatmapProfile.frameTimes.push(time);
      previousFrameTime = time;
      window.requestAnimationFrame(sampleFrame);
    };
    window.requestAnimationFrame(sampleFrame);

    window.addEventListener("error", (event) => {
      window.__heatmapProfile.errors.push(String(event.error?.stack ?? event.message));
    });
    window.addEventListener("unhandledrejection", (event) => {
      window.__heatmapProfile.unhandledRejections.push(String(event.reason?.stack ?? event.reason));
    });

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__heatmapProfile.longTasks.push({
            startTime: entry.startTime,
            duration: entry.duration,
            name: entry.name,
          });
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      // Long task timing is not available in every browser mode.
    }
  });

  await page.goto(url, { waitUntil: "networkidle" });
  const client = await context.newCDPSession(page);
  await client.send("Tracing.start", {
    transferMode: "ReturnAsStream",
    categories: [
      "devtools.timeline",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-v8.cpu_profiler",
      "v8",
      "blink.user_timing",
      "loading",
      "toplevel",
    ].join(","),
  });

  await page.getByLabel("Show heatmap").check();
  const heatmapEnabledAt = await page.evaluate(() => performance.now());
  await page.waitForTimeout(durationMs);
  const captureEndedAt = await page.evaluate(() => performance.now());

  const tracingComplete = new Promise((resolveTracing) => {
    client.once("Tracing.tracingComplete", resolveTracing);
  });
  await client.send("Tracing.end");
  const tracingResult = await tracingComplete;
  const traceText = await readTraceStream(client, tracingResult.stream);
  await writeFile(tracePath, traceText);

  const pageProfile = await page.evaluate(() => window.__heatmapProfile);
  const trace = JSON.parse(traceText);
  const framesAfterHeatmap = pageProfile.frames
    .filter((frame) => frame.end >= heatmapEnabledAt && frame.start <= captureEndedAt)
    .map((frame) => ({
      startAfterHeatmapMs: frame.start - heatmapEnabledAt,
      endAfterHeatmapMs: frame.end - heatmapEnabledAt,
      intervalMs: frame.interval,
    }));
  const intervalsAfterHeatmap = framesAfterHeatmap.map((frame) => frame.intervalMs);
  const longTasksAfterHeatmap = pageProfile.longTasks
    .filter((task) => task.startTime >= heatmapEnabledAt && task.startTime <= captureEndedAt)
    .map((task) => ({
      ...task,
      startAfterHeatmapMs: task.startTime - heatmapEnabledAt,
    }));
  const report = {
    url,
    durationMs,
    viewport: {
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor,
    },
    frameIntervals: summarizeFrameIntervals(intervalsAfterHeatmap),
    windows: summarizeWindows(
      framesAfterHeatmap,
      longTasksAfterHeatmap,
      durationMs,
      captureEndedAt - heatmapEnabledAt,
    ),
    slowFrames: slowFramesFrom(pageProfile.frames, heatmapEnabledAt).filter(
      (frame) => frame.startAfterHeatmapMs <= captureEndedAt - heatmapEnabledAt,
    ),
    longTasks: {
      count: longTasksAfterHeatmap.length,
      totalMs: longTasksAfterHeatmap.reduce((total, task) => total + task.duration, 0),
      maxMs: Math.max(0, ...longTasksAfterHeatmap.map((task) => task.duration)),
      tasks: longTasksAfterHeatmap.slice(0, 50),
    },
    traceHotspots: summarizeTrace(trace),
    consoleMessages,
    pageErrors,
    inPageErrors: pageProfile.errors,
    inPageUnhandledRejections: pageProfile.unhandledRejections,
    files: {
      report: reportPath,
      trace: tracePath,
    },
    heatmapEnabledAt,
    captureEndedAt,
    serverOutput,
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  server.stdout.destroy();
  server.stderr.destroy();
}
