import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  chromium,
  expect,
  test,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";

type ChartProfileSnapshot = {
  timestamp: number;
  status: string | null;
  frameRate: number | null;
  canvasResolution: [number, number] | null;
  canvasCssSize: [number, number] | null;
  diagnostics: {
    heatmap: {
      computeMs: number;
      width: number;
      height: number;
      cellCount: number;
    };
    frame: {
      avg: number;
      max: number;
    };
    heatmapUpload: {
      avg: number;
      max: number;
    };
    candleUpload: {
      avg: number;
      max: number;
    };
    drawSubmit: {
      avg: number;
      max: number;
    };
    heatmapUploadBytes: number;
  } | null;
};

type ProfileScenario = {
  name: string;
  viewport: {
    width: number;
    height: number;
  };
  deviceScaleFactor: number;
};

type ProfileResult = {
  scenario: string;
  cssViewport: string;
  deviceScaleFactor: number;
  chartStatus: string | null;
  canvasCssSize: string;
  canvasResolution: string;
  cellCount: number;
  frameRate: number;
  heatmapBuildAvgMs: number;
  heatmapBuildMaxMs: number;
  heatmapUploadAvgMs: number;
  heatmapUploadMaxMs: number;
  candleUploadAvgMs: number;
  drawSubmitAvgMs: number;
  frameAvgMs: number;
  frameMaxMs: number;
  heatmapUploadBytes: number;
};

const warmupMs = 750;
const sampleCount = 4;
const sampleIntervalMs = 200;
const profilingBrowserArgs = [
  "--enable-unsafe-webgpu",
  "--enable-features=Vulkan,UseSkiaRenderer",
  "--disable-vulkan-surface",
  "--use-angle=swiftshader-webgpu",
];

const scenarios: ProfileScenario[] = [
  {
    name: "720p @ 1x",
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  },
  {
    name: "720p @ 2x",
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
  },
  {
    name: "1080p @ 1x",
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  },
  {
    name: "1080p @ 2x",
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  },
  {
    name: "1440p @ 1x",
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1,
  },
  {
    name: "1440p @ 2x",
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 2,
  },
];

const average = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);

const formatMs = (value: number): string => `${value.toFixed(2)} ms`;

const formatBytes = (value: number): string =>
  value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(2)} MiB`
    : `${(value / 1024).toFixed(1)} KiB`;

const readSnapshot = async (page: Page): Promise<ChartProfileSnapshot | null> =>
  page.evaluate(() => {
    const profile = (
      window as Window & {
        __chartProfile?: {
          getSnapshot: () => ChartProfileSnapshot;
        };
      }
    ).__chartProfile;

    return profile?.getSnapshot() ?? null;
  });

const waitForChartReady = async (page: Page): Promise<void> => {
  await expect
    .poll(
      async () => {
        const snapshot = await readSnapshot(page);
        if (!snapshot) {
          return "missing";
        }
        return snapshot.diagnostics ? "ready" : (snapshot.status ?? "warming");
      },
      { timeout: 20_000, message: "waiting for chart diagnostics" },
    )
    .toBe("ready");
};

const profileScenario = async (
  browser: Browser,
  baseURL: string,
  scenario: ProfileScenario,
): Promise<ProfileResult> => {
  const context = await browser.newContext({
    viewport: scenario.viewport,
    deviceScaleFactor: scenario.deviceScaleFactor,
  });
  const page = await context.newPage();

  try {
    await page.goto(new URL("/?profile=full-viewport", baseURL).toString());
    await waitForChartReady(page);
    await page.waitForTimeout(warmupMs);

    const samples: ChartProfileSnapshot[] = [];

    for (let index = 0; index < sampleCount; index += 1) {
      const snapshot = await readSnapshot(page);
      if (!snapshot) {
        throw new Error(`Chart profiling hook is unavailable for ${scenario.name}.`);
      }
      if (!snapshot.diagnostics) {
        throw new Error(
          `Chart diagnostics were missing while profiling ${scenario.name}.`,
        );
      }

      samples.push(snapshot);
      await page.waitForTimeout(sampleIntervalMs);
    }

    const lastSample = samples[samples.length - 1]!;
    const expectedCanvasSize = `${scenario.viewport.width}x${scenario.viewport.height}`;
    const actualCanvasSize = lastSample.canvasCssSize?.join("x") ?? "n/a";

    expect(actualCanvasSize).toBe(expectedCanvasSize);

    const buildSamples = samples.map(
      (snapshot) => snapshot.diagnostics?.heatmap.computeMs ?? 0,
    );
    const lastDiagnostics = lastSample.diagnostics;

    return {
      scenario: scenario.name,
      cssViewport: `${scenario.viewport.width}x${scenario.viewport.height}`,
      deviceScaleFactor: scenario.deviceScaleFactor,
      chartStatus: lastSample.status,
      canvasCssSize: actualCanvasSize,
      canvasResolution: lastSample.canvasResolution?.join("x") ?? "n/a",
      cellCount: lastDiagnostics?.heatmap.cellCount ?? 0,
      frameRate: lastSample.frameRate ?? 0,
      heatmapBuildAvgMs: average(buildSamples),
      heatmapBuildMaxMs: Math.max(...buildSamples),
      heatmapUploadAvgMs: lastDiagnostics?.heatmapUpload.avg ?? 0,
      heatmapUploadMaxMs: lastDiagnostics?.heatmapUpload.max ?? 0,
      candleUploadAvgMs: lastDiagnostics?.candleUpload.avg ?? 0,
      drawSubmitAvgMs: lastDiagnostics?.drawSubmit.avg ?? 0,
      frameAvgMs: lastDiagnostics?.frame.avg ?? 0,
      frameMaxMs: lastDiagnostics?.frame.max ?? 0,
      heatmapUploadBytes: lastDiagnostics?.heatmapUploadBytes ?? 0,
    };
  } finally {
    await context.close();
  }
};

const buildMarkdownReport = (results: ProfileResult[]): string => {
  const lines = [
    "# Full-Viewport Heatmap Chart Profile",
    "",
    "| scenario | viewport | dpr | canvas | cells | fps | build avg | build max | upload avg | upload max | frame avg | upload size | status |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const result of results) {
    lines.push(
      `| ${result.scenario} | ${result.cssViewport} | ${result.deviceScaleFactor.toFixed(1)} | ${result.canvasResolution} | ${result.cellCount.toLocaleString()} | ${result.frameRate.toFixed(1)} | ${formatMs(result.heatmapBuildAvgMs)} | ${formatMs(result.heatmapBuildMaxMs)} | ${formatMs(result.heatmapUploadAvgMs)} | ${formatMs(result.heatmapUploadMaxMs)} | ${formatMs(result.frameAvgMs)} | ${formatBytes(result.heatmapUploadBytes)} | ${result.chartStatus ?? "ok"} |`,
    );
  }

  return `${lines.join("\n")}\n`;
};

const attachProfileReport = async (
  testInfo: TestInfo,
  results: ProfileResult[],
): Promise<void> => {
  const markdownReport = buildMarkdownReport(results);
  const reportDirectory = join(testInfo.config.rootDir, "test-results");
  const jsonReport = JSON.stringify(results, null, 2);

  await mkdir(reportDirectory, { recursive: true });
  await writeFile(join(reportDirectory, "chart-profile-report.md"), markdownReport);
  await writeFile(join(reportDirectory, "chart-profile-results.json"), jsonReport);

  await testInfo.attach("chart-profile-report.md", {
    body: Buffer.from(markdownReport),
    contentType: "text/markdown",
  });
  await testInfo.attach("chart-profile-results.json", {
    body: Buffer.from(jsonReport),
    contentType: "application/json",
  });
};

test("profiles full-viewport heatmap rendering across viewport and device scales", async (
  {},
  testInfo,
) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for chart profiling.");
  }

  const results: ProfileResult[] = [];
  const browser = await chromium.launch({
    headless: true,
    args: profilingBrowserArgs,
  });

  try {
    for (const scenario of scenarios) {
      results.push(await profileScenario(browser, baseURL, scenario));
    }
  } finally {
    await browser.close();
  }

  await attachProfileReport(testInfo, results);
});
