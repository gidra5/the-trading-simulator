import type { OrderBookHeatmap, PriceCandle } from "./market";
import type { ChartViewport } from "./Chart";

const floatsPerCandleInstance = 5;
const bytesPerFloat = 4;
const bytesPerCandleInstance = floatsPerCandleInstance * bytesPerFloat;
const floatsPerChartUniforms = 8;
const bytesPerChartUniforms = floatsPerChartUniforms * bytesPerFloat;
const floatsPerHeatmapUniforms = 4;
const bytesPerHeatmapUniforms = floatsPerHeatmapUniforms * bytesPerFloat;

type CandlePrices = {
  open: number;
  high: number;
  low: number;
  close: number;
};

type CandleInstance = {
  timeOffset: number;
  prices: CandlePrices;
};

type ChartUniforms = {
  priceRange: [min: number, max: number];
  resolution: [width: number, height: number];
  timeScale: [span: number, candleInterval: number];
  padding: [x: number, y: number];
};

export type RendererState = {
  context: GPUCanvasContext;
  device: GPUDevice;
  format: GPUTextureFormat;
  heatmapPipeline: GPURenderPipeline;
  candlePipeline: GPURenderPipeline;
  chartUniformBuffer: GPUBuffer;
  chartBindGroup: GPUBindGroup;
  heatmapUniformBuffer: GPUBuffer;
  heatmapSizeTexture: GPUTexture;
  heatmapSizeTextureView: GPUTextureView;
  heatmapNearestTexture: GPUTexture;
  heatmapNearestTextureView: GPUTextureView;
  heatmapBindGroup: GPUBindGroup;
  heatmapTextureSize: [width: number, height: number];
  heatmapSizeUploadCache: Float32Array;
  heatmapNearestUploadCache: Int32Array;
  candleInstanceBuffer: GPUBuffer;
  candleInstanceCapacity: number;
};

export type HeatmapTextureUploadStats = {
  width: number;
  height: number;
  sizeTextureBytes: number;
  nearestTextureBytes: number;
  totalBytes: number;
};

const missingNearestHeatmapColumn = -2147483648;

const heatmapShader = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct ChartUniforms {
  price_range: vec2<f32>,
  resolution: vec2<f32>,
  time_scale: vec2<f32>,
  padding: vec2<f32>,
};

@group(0) @binding(0) var<uniform> chart: ChartUniforms;
struct HeatmapUniforms {
  values: vec4<f32>,
};

@group(1) @binding(0) var<uniform> heatmap: HeatmapUniforms;
@group(1) @binding(1) var heatmapSizeTexture: texture_2d<f32>;
@group(1) @binding(2) var heatmapNearestTexture: texture_2d<i32>;

@vertex
fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );

  var output: VertexOutput;
  let position = positions[vertexIndex];
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = vec2<f32>(
    position.x * 0.5 + 0.5,
    0.5 - position.y * 0.5,
  );
  return output;
}

fn load_heatmap_size(
  column: i32,
  row: i32,
  dimensions: vec2<i32>,
) -> f32 {
  let clampedColumn = clamp(column, 0, dimensions.x - 1);
  let clampedRow = clamp(row, 0, dimensions.y - 1);
  return max(
    textureLoad(heatmapSizeTexture, vec2<i32>(clampedColumn, clampedRow), 0).x,
    0.0,
  );
}

fn sample_heatmap_cell(
  column: i32,
  row: i32,
  dimensions: vec2<i32>,
) -> f32 {
  let clampedColumn = clamp(column, 0, dimensions.x - 1);
  let nearest = textureLoad(
    heatmapNearestTexture,
    vec2<i32>(clampedColumn, 0),
    0,
  ).xy;
  if (nearest.x == clampedColumn && nearest.y == clampedColumn) {
    return load_heatmap_size(clampedColumn, row, dimensions);
  }
  if (nearest.x >= 0 && nearest.y >= 0 && nearest.x != nearest.y) {
    let leftSize = load_heatmap_size(nearest.x, row, dimensions);
    let rightSize = load_heatmap_size(nearest.y, row, dimensions);
    let span = max(nearest.y - nearest.x, 1);
    let t = clamp(f32(clampedColumn - nearest.x) / f32(span), 0.0, 1.0);
    return mix(leftSize, rightSize, t);
  }
  return 0.0;
}

fn to_heatmap_intensity(size: f32) -> f32 {
  if (size <= 0.0 || heatmap.values.x <= 0.0) {
    return 0.0;
  }
  return clamp(
    log(1.0 + size) / log(1.0 + heatmap.values.x),
    0.0,
    1.0,
  );
}

fn sample_heatmap_intensity(uv: vec2<f32>) -> f32 {
  let safeUv = clamp(uv, vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
  let dimensions = vec2<i32>(textureDimensions(heatmapSizeTexture));
  let grid = vec2<f32>(
    safeUv.x * f32(dimensions.x) - 0.5,
    (1.0 - safeUv.y) * f32(dimensions.y) - 0.5,
  );
  let base = vec2<i32>(floor(grid));
  let fraction = fract(grid);
  let intensity00 = to_heatmap_intensity(
    sample_heatmap_cell(base.x, base.y, dimensions),
  );
  let intensity10 = to_heatmap_intensity(
    sample_heatmap_cell(base.x + 1, base.y, dimensions),
  );
  let intensity01 = to_heatmap_intensity(
    sample_heatmap_cell(base.x, base.y + 1, dimensions),
  );
  let intensity11 = to_heatmap_intensity(
    sample_heatmap_cell(base.x + 1, base.y + 1, dimensions),
  );
  let lowRow = mix(intensity00, intensity10, fraction.x);
  let highRow = mix(intensity01, intensity11, fraction.x);
  return mix(lowRow, highRow, fraction.y);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let intensity = sample_heatmap_intensity(input.uv);
  let low = vec3<f32>(0.04, 0.09, 0.17);
  let mid = vec3<f32>(0.17, 0.48, 0.88);
  let high = vec3<f32>(0.98, 0.54, 0.16);
  let cool = mix(low, mid, smoothstep(0.0, 0.55, intensity));
  let warm = mix(mid, high, smoothstep(0.35, 1.0, intensity));
  let color = mix(cool, warm, smoothstep(0.45, 1.0, intensity));
  let alpha = 0.12 + intensity * 0.88;
  return vec4<f32>(color, alpha);
}
`;

const candleShader = /* wgsl */ `
const VIEWPORT_MIN_Y: f32 = 0.02;
const VIEWPORT_MAX_Y: f32 = 0.98;
const BODY_WIDTH_FACTOR: f32 = 0.38;
const WICK_WIDTH_FACTOR: f32 = 0.06;
const MIN_BODY_WIDTH_PIXELS: f32 = 3.0;
const MIN_WICK_WIDTH_PIXELS: f32 = 1.0;

struct CandlePrices {
  open: f32,
  high: f32,
  low: f32,
  close: f32,
};

struct CandleInstance {
  time_offset: f32,
  prices: CandlePrices,
};

struct ChartUniforms {
  price_range: vec2<f32>,
  resolution: vec2<f32>,
  time_scale: vec2<f32>,
  padding: vec2<f32>,
};

@group(0) @binding(0) var<uniform> chart: ChartUniforms;

struct CandleInstanceInput {
  @location(0) time_offset: f32,
  @location(1) prices: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

fn to_candle_instance(input: CandleInstanceInput) -> CandleInstance {
  return CandleInstance(
    input.time_offset,
    CandlePrices(
      input.prices.x,
      input.prices.y,
      input.prices.z,
      input.prices.w,
    ),
  );
}

fn to_viewport_y(price: f32) -> f32 {
  let span = max(chart.price_range.y - chart.price_range.x, 0.000001);
  let normalized = 1.0 - (price - chart.price_range.x) / span;
  return normalized;
}

fn candle_color(candle: CandleInstance) -> vec4<f32> {
  let is_rising = candle.prices.close >= candle.prices.open;
  return select(
    vec4<f32>(0.92, 0.34, 0.28, 1.0),
    vec4<f32>(0.18, 0.9, 0.56, 1.0),
    is_rising,
  );
}

fn align_odd_pixel_width(width_pixels: f32, minimum_width_pixels: f32) -> f32 {
  let rounded_width = max(round(width_pixels), minimum_width_pixels);
  let is_even_width = abs(fract(rounded_width * 0.5)) < 0.000001;
  return rounded_width + select(0.0, 1.0, is_even_width);
}

fn snap_to_pixel_center(x: f32) -> f32 {
  let resolution_x = max(chart.resolution.x, 1.0);
  return (round(x * resolution_x - 0.5) + 0.5) / resolution_x;
}

@vertex
fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  input: CandleInstanceInput,
) -> VertexOutput {
  let candle = to_candle_instance(input);
  let isWick = vertexIndex >= 6u;
  let localIndex = select(vertexIndex, vertexIndex - 6u, isWick);
  let time_span = chart.time_scale.x;
  let candle_interval = chart.time_scale.y;
  let candle_slot_width = candle_interval / time_span;
  let resolution_x = max(chart.resolution.x, 1.0);
  let slot_width_pixels = candle_slot_width * resolution_x;
  let body_width_pixels = align_odd_pixel_width(
    slot_width_pixels * BODY_WIDTH_FACTOR * 2.0,
    MIN_BODY_WIDTH_PIXELS,
  );
  let wick_width_pixels = align_odd_pixel_width(
    slot_width_pixels * WICK_WIDTH_FACTOR * 2.0,
    MIN_WICK_WIDTH_PIXELS,
  );
  let body_half_width = body_width_pixels * 0.5 / resolution_x;
  let wick_half_width = wick_width_pixels * 0.5 / resolution_x;
  let open_y = to_viewport_y(candle.prices.open);
  let close_y = to_viewport_y(candle.prices.close);
  let min_body_height = 2.0 / max(chart.resolution.y, 1.0);
  let body_mid_y = (open_y + close_y) * 0.5;
  let raw_body_top = min(open_y, close_y);
  let raw_body_bottom = max(open_y, close_y);
  let is_doji = abs(open_y - close_y) < 0.000001;
  let body_top = select(
    raw_body_top,
    body_mid_y - min_body_height * 0.5,
    is_doji,
  );
  let body_bottom = select(
    raw_body_bottom,
    body_mid_y + min_body_height * 0.5,
    is_doji,
  );
  let wick_top = min(to_viewport_y(candle.prices.high), body_top);
  let wick_bottom = max(to_viewport_y(candle.prices.low), body_bottom);
  let center_x = snap_to_pixel_center(
    (candle.time_offset + candle_interval * 0.5) / time_span,
  );

  var quad = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
  );

  let halfWidth = select(body_half_width, wick_half_width, isWick);
  let top = select(body_top, wick_top, isWick);
  let bottom = select(body_bottom, wick_bottom, isWick);
  let local = quad[localIndex];
  let x = center_x + local.x * halfWidth;
  let y = mix(top, bottom, local.y);

  var output: VertexOutput;
  output.position = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  output.color = candle_color(candle);
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return input.color;
}
`;

export const initializeRenderer = async (
  canvas: HTMLCanvasElement,
): Promise<RendererState> => {
  const gpu = (navigator as { gpu?: GPU }).gpu;
  if (!gpu) {
    throw new Error("WebGPU is not available in this browser.");
  }

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    throw new Error("Unable to acquire a WebGPU adapter.");
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
  if (!context) {
    throw new Error("Unable to create a WebGPU canvas context.");
  }

  const format = gpu.getPreferredCanvasFormat();
  const heatmapShaderModule = device.createShaderModule({
    code: heatmapShader,
  });
  const candleShaderModule = device.createShaderModule({
    code: candleShader,
  });
  const chartBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });
  const heatmapBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: "unfilterable-float",
          viewDimension: "2d",
          multisampled: false,
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: "sint",
          viewDimension: "2d",
          multisampled: false,
        },
      },
    ],
  });
  const sharedPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [chartBindGroupLayout],
  });
  const heatmapPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [chartBindGroupLayout, heatmapBindGroupLayout],
  });

  const heatmapPipeline = device.createRenderPipeline({
    layout: heatmapPipelineLayout,
    vertex: {
      module: heatmapShaderModule,
      entryPoint: "vertexMain",
    },
    fragment: {
      module: heatmapShaderModule,
      entryPoint: "fragmentMain",
      targets: [{ format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const candlePipeline = device.createRenderPipeline({
    layout: sharedPipelineLayout,
    vertex: {
      module: candleShaderModule,
      entryPoint: "vertexMain",
      buffers: [
        {
          arrayStride: bytesPerCandleInstance,
          stepMode: "instance",
          attributes: [
            {
              shaderLocation: 0,
              format: "float32",
              offset: 0,
            },
            {
              shaderLocation: 1,
              format: "float32x4",
              offset: bytesPerFloat,
            },
          ],
        },
      ],
    },
    fragment: {
      module: candleShaderModule,
      entryPoint: "fragmentMain",
      targets: [{ format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });
  const chartUniformBuffer = device.createBuffer({
    size: bytesPerChartUniforms,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const chartBindGroup = device.createBindGroup({
    layout: chartBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: chartUniformBuffer,
        },
      },
    ],
  });
  const heatmapUniformBuffer = device.createBuffer({
    size: bytesPerHeatmapUniforms,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const heatmapTextureSize: [number, number] = [1, 1];
  const heatmapSizeUploadCache = new Float32Array(1);
  heatmapSizeUploadCache.fill(Number.NaN);
  const heatmapSizeTexture = device.createTexture({
    size: {
      width: heatmapTextureSize[0],
      height: heatmapTextureSize[1],
      depthOrArrayLayers: 1,
    },
    format: "r32float",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const heatmapSizeTextureView = heatmapSizeTexture.createView();
  const heatmapNearestUploadCache = new Int32Array(2);
  heatmapNearestUploadCache.fill(missingNearestHeatmapColumn);
  const heatmapNearestTexture = device.createTexture({
    size: {
      width: heatmapTextureSize[0],
      height: 1,
      depthOrArrayLayers: 1,
    },
    format: "rg32sint",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const heatmapNearestTextureView = heatmapNearestTexture.createView();
  const heatmapBindGroup = device.createBindGroup({
    layout: heatmapBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: heatmapUniformBuffer,
        },
      },
      {
        binding: 1,
        resource: heatmapSizeTextureView,
      },
      {
        binding: 2,
        resource: heatmapNearestTextureView,
      },
    ],
  });

  const candleInstanceCapacity = 1;
  const candleInstanceBuffer = device.createBuffer({
    size: candleInstanceCapacity * bytesPerCandleInstance,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  return {
    context,
    device,
    format,
    heatmapPipeline,
    candlePipeline,
    chartUniformBuffer,
    chartBindGroup,
    heatmapUniformBuffer,
    heatmapSizeTexture,
    heatmapSizeTextureView,
    heatmapNearestTexture,
    heatmapNearestTextureView,
    heatmapBindGroup,
    heatmapTextureSize,
    heatmapSizeUploadCache,
    heatmapNearestUploadCache,
    candleInstanceBuffer,
    candleInstanceCapacity,
  };
};

export const getCanvasResolution = (
  canvas: HTMLCanvasElement,
): [width: number, height: number] => {
  const dpr = window.devicePixelRatio || 1;
  return [
    Math.max(1, Math.floor(canvas.clientWidth * dpr)),
    Math.max(1, Math.floor(canvas.clientHeight * dpr)),
  ];
};

const getVisibleCandles = (
  priceCandles: PriceCandle[],
  viewport: ChartViewport,
  candleInterval: number,
): PriceCandle[] => {
  const visibleFrom = viewport.time[0] - candleInterval;
  const visibleTo = viewport.time[1] + candleInterval;
  return priceCandles.filter(
    (candle) => candle.time >= visibleFrom && candle.time <= visibleTo,
  );
};

const ensureCandleInstanceCapacity = (
  renderer: RendererState,
  candleCount: number,
): void => {
  if (candleCount <= renderer.candleInstanceCapacity) {
    return;
  }

  const nextCapacity = Math.max(
    candleCount,
    renderer.candleInstanceCapacity * 2,
  );
  renderer.candleInstanceBuffer.destroy();
  renderer.candleInstanceBuffer = renderer.device.createBuffer({
    size: nextCapacity * bytesPerCandleInstance,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  renderer.candleInstanceCapacity = nextCapacity;
};

const recreateHeatmapTextures = (
  renderer: RendererState,
  width: number,
  height: number,
): void => {
  if (
    width === renderer.heatmapTextureSize[0] &&
    height === renderer.heatmapTextureSize[1]
  ) {
    return;
  }

  renderer.heatmapSizeTexture.destroy();
  renderer.heatmapSizeTexture = renderer.device.createTexture({
    size: {
      width,
      height,
      depthOrArrayLayers: 1,
    },
    format: "r32float",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  renderer.heatmapSizeTextureView = renderer.heatmapSizeTexture.createView();
  renderer.heatmapNearestTexture.destroy();
  renderer.heatmapNearestTexture = renderer.device.createTexture({
    size: {
      width,
      height: 1,
      depthOrArrayLayers: 1,
    },
    format: "rg32sint",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  renderer.heatmapNearestTextureView =
    renderer.heatmapNearestTexture.createView();
  renderer.heatmapBindGroup = renderer.device.createBindGroup({
    layout: renderer.heatmapPipeline.getBindGroupLayout(1),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: renderer.heatmapUniformBuffer,
        },
      },
      {
        binding: 1,
        resource: renderer.heatmapSizeTextureView,
      },
      {
        binding: 2,
        resource: renderer.heatmapNearestTextureView,
      },
    ],
  });
  renderer.heatmapTextureSize = [width, height];
  renderer.heatmapSizeUploadCache = new Float32Array(width * height);
  renderer.heatmapSizeUploadCache.fill(Number.NaN);
  renderer.heatmapNearestUploadCache = new Int32Array(width * 2);
  renderer.heatmapNearestUploadCache.fill(missingNearestHeatmapColumn);
};

const collectDirtyColumnRanges = (
  dirtyColumns: Uint8Array,
): Array<[startColumn: number, endColumnExclusive: number]> => {
  const ranges: Array<[startColumn: number, endColumnExclusive: number]> = [];
  let rangeStart = -1;

  for (let x = 0; x < dirtyColumns.length; x += 1) {
    if (dirtyColumns[x] === 1) {
      if (rangeStart < 0) {
        rangeStart = x;
      }
      continue;
    }

    if (rangeStart >= 0) {
      ranges.push([rangeStart, x]);
      rangeStart = -1;
    }
  }

  if (rangeStart >= 0) {
    ranges.push([rangeStart, dirtyColumns.length]);
  }

  return ranges;
};

const toFloat32UploadBuffer = (
  data: Float32Array,
): Float32Array<ArrayBuffer> =>
  data.buffer instanceof ArrayBuffer
    ? (data as Float32Array<ArrayBuffer>)
    : new Float32Array(data);

const toInt32UploadBuffer = (
  data: Int32Array,
): Int32Array<ArrayBuffer> =>
  data.buffer instanceof ArrayBuffer
    ? (data as Int32Array<ArrayBuffer>)
    : new Int32Array(data);

const writeHeatmapSizeColumns = (
  renderer: RendererState,
  sizes: Float32Array,
  width: number,
  height: number,
  startColumn: number,
  endColumnExclusive: number,
): number => {
  const rangeWidth = endColumnExclusive - startColumn;
  if (rangeWidth <= 0) {
    return 0;
  }

  const data =
    startColumn === 0 && endColumnExclusive === width
      ? sizes
      : new Float32Array(rangeWidth * height);

  if (data !== sizes) {
    for (let y = 0; y < height; y += 1) {
      const sourceOffset = y * width + startColumn;
      data.set(
        sizes.subarray(sourceOffset, sourceOffset + rangeWidth),
        y * rangeWidth,
      );
    }
  }

  renderer.device.queue.writeTexture(
    {
      texture: renderer.heatmapSizeTexture,
      origin: { x: startColumn, y: 0, z: 0 },
    },
    toFloat32UploadBuffer(data),
    {
      offset: 0,
      bytesPerRow: rangeWidth * bytesPerFloat,
      rowsPerImage: height,
    },
    {
      width: rangeWidth,
      height,
      depthOrArrayLayers: 1,
    },
  );

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width + startColumn;
    renderer.heatmapSizeUploadCache.set(
      sizes.subarray(rowOffset, rowOffset + rangeWidth),
      rowOffset,
    );
  }

  return rangeWidth * height * bytesPerFloat;
};

const writeHeatmapNearestColumns = (
  renderer: RendererState,
  nearestActiveColumns: Int32Array,
  width: number,
  startColumn: number,
  endColumnExclusive: number,
): number => {
  const rangeWidth = endColumnExclusive - startColumn;
  if (rangeWidth <= 0) {
    return 0;
  }

  const sourceOffset = startColumn * 2;
  const data = toInt32UploadBuffer(
    nearestActiveColumns.subarray(sourceOffset, endColumnExclusive * 2),
  );
  renderer.device.queue.writeTexture(
    {
      texture: renderer.heatmapNearestTexture,
      origin: { x: startColumn, y: 0, z: 0 },
    },
    data,
    {
      offset: 0,
      bytesPerRow: rangeWidth * bytesPerFloat * 2,
      rowsPerImage: 1,
    },
    {
      width: rangeWidth,
      height: 1,
      depthOrArrayLayers: 1,
    },
  );

  renderer.heatmapNearestUploadCache.set(
    nearestActiveColumns.subarray(sourceOffset, endColumnExclusive * 2),
    sourceOffset,
  );

  return rangeWidth * bytesPerFloat * 2;
};

export const writeChartUniforms = (
  renderer: RendererState,
  viewport: ChartViewport,
  candleInterval: number,
): void => {
  const chartUniforms: ChartUniforms = {
    priceRange: viewport.price,
    resolution: viewport.resolution,
    timeScale: [
      Math.max(viewport.time[1] - viewport.time[0], 1),
      candleInterval,
    ],
    padding: [0, 0],
  };

  renderer.device.queue.writeBuffer(
    renderer.chartUniformBuffer,
    0,
    new Float32Array([
      ...chartUniforms.priceRange,
      ...chartUniforms.resolution,
      ...chartUniforms.timeScale,
      ...chartUniforms.padding,
    ]),
  );
};

export const writeHeatmapTexture = (
  renderer: RendererState,
  orderBookHeatmap: OrderBookHeatmap,
): HeatmapTextureUploadStats | null => {
  const { width, height, sizes, activeColumns, maxSize } = orderBookHeatmap;
  if (width <= 0 || height <= 0) {
    return null;
  }

  recreateHeatmapTextures(renderer, width, height);

  const nearestActiveColumns = new Int32Array(width * 2).fill(-1);
  let lastActive = -1;
  for (let x = 0; x < width; x += 1) {
    if (activeColumns[x] === 1) {
      lastActive = x;
    }
    nearestActiveColumns[x * 2] = lastActive;
  }

  lastActive = -1;
  for (let x = width - 1; x >= 0; x -= 1) {
    if (activeColumns[x] === 1) {
      lastActive = x;
    }
    nearestActiveColumns[x * 2 + 1] = lastActive;
  }

  renderer.device.queue.writeBuffer(
    renderer.heatmapUniformBuffer,
    0,
    new Float32Array([maxSize, 0, 0, 0]),
  );

  const sizeDirtyColumns = new Uint8Array(width);
  for (let offset = 0; offset < sizes.length; offset += 1) {
    if (renderer.heatmapSizeUploadCache[offset] !== sizes[offset]) {
      sizeDirtyColumns[offset % width] = 1;
    }
  }

  let sizeTextureBytes = 0;
  for (const [startColumn, endColumnExclusive] of collectDirtyColumnRanges(
    sizeDirtyColumns,
  )) {
    sizeTextureBytes += writeHeatmapSizeColumns(
      renderer,
      sizes,
      width,
      height,
      startColumn,
      endColumnExclusive,
    );
  }

  const nearestDirtyColumns = new Uint8Array(width);
  for (let x = 0; x < width; x += 1) {
    const offset = x * 2;
    if (
      renderer.heatmapNearestUploadCache[offset] !==
        nearestActiveColumns[offset] ||
      renderer.heatmapNearestUploadCache[offset + 1] !==
        nearestActiveColumns[offset + 1]
    ) {
      nearestDirtyColumns[x] = 1;
    }
  }

  let nearestTextureBytes = 0;
  for (const [startColumn, endColumnExclusive] of collectDirtyColumnRanges(
    nearestDirtyColumns,
  )) {
    nearestTextureBytes += writeHeatmapNearestColumns(
      renderer,
      nearestActiveColumns,
      width,
      startColumn,
      endColumnExclusive,
    );
  }

  return {
    width,
    height,
    sizeTextureBytes,
    nearestTextureBytes,
    totalBytes: sizeTextureBytes + nearestTextureBytes,
  };
};

const writeCandleInstance = (
  target: Float32Array,
  index: number,
  candleInstance: CandleInstance,
): void => {
  const offset = index * floatsPerCandleInstance;

  target.set(
    [
      candleInstance.timeOffset,
      candleInstance.prices.open,
      candleInstance.prices.high,
      candleInstance.prices.low,
      candleInstance.prices.close,
    ],
    offset,
  );
};

export const writeCandleInstances = (
  renderer: RendererState,
  viewport: ChartViewport,
  priceCandles: PriceCandle[],
  candleInterval: number,
): number => {
  const visibleCandles = getVisibleCandles(
    priceCandles,
    viewport,
    candleInterval,
  );
  if (visibleCandles.length === 0) {
    return 0;
  }

  ensureCandleInstanceCapacity(renderer, visibleCandles.length);

  const instanceData = new Float32Array(
    visibleCandles.length * floatsPerCandleInstance,
  );

  visibleCandles.forEach((priceCandle, index) => {
    const candleInstance: CandleInstance = {
      timeOffset: priceCandle.time - viewport.time[0],
      prices: {
        open: priceCandle.open,
        high: priceCandle.high,
        low: priceCandle.low,
        close: priceCandle.close,
      },
    };

    writeCandleInstance(instanceData, index, candleInstance);
  });

  renderer.device.queue.writeBuffer(
    renderer.candleInstanceBuffer,
    0,
    instanceData,
  );
  return visibleCandles.length;
};

export const drawFrame = (
  renderer: RendererState,
  candleInstanceCount: number,
): void => {
  const commandEncoder = renderer.device.createCommandEncoder();
  const renderPass = commandEncoder.beginRenderPass({
    colorAttachments: [
      {
        view: renderer.context.getCurrentTexture().createView(),
        loadOp: "clear",
        storeOp: "store",
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      },
    ],
  });

  renderPass.setPipeline(renderer.heatmapPipeline);
  renderPass.setBindGroup(0, renderer.chartBindGroup);
  renderPass.setBindGroup(1, renderer.heatmapBindGroup);
  renderPass.draw(3);

  if (candleInstanceCount > 0) {
    renderPass.setPipeline(renderer.candlePipeline);
    renderPass.setBindGroup(0, renderer.chartBindGroup);
    renderPass.setVertexBuffer(0, renderer.candleInstanceBuffer);
    renderPass.draw(12, candleInstanceCount);
  }

  renderPass.end();
  renderer.device.queue.submit([commandEncoder.finish()]);
};
