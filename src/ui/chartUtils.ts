import type { OrderBookHeatmapEntry, PriceCandle } from "../market/index";
import type { ChartViewport } from "./Chart";
import { assert } from "../utils";

const floatsPerCandleInstance = 5;
const bytesPerFloat = 4;
const bytesPerCandleInstance = floatsPerCandleInstance * bytesPerFloat;
const floatsPerChartUniforms = 8;
const bytesPerChartUniforms = floatsPerChartUniforms * bytesPerFloat;

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
  heatmapSampler: GPUSampler;
  heatmapTexture: GPUTexture;
  heatmapTextureView: GPUTextureView;
  heatmapBindGroup: GPUBindGroup;
  heatmapTextureSize: [width: number, height: number];
  candleInstanceBuffer: GPUBuffer;
  candleInstanceCapacity: number;
};

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
@group(1) @binding(0) var heatmapSampler: sampler;
@group(1) @binding(1) var heatmapTexture: texture_2d<f32>;

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

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let textureSize = vec2<f32>(textureDimensions(heatmapTexture));
  let texelSize = 1.0 / max(textureSize, vec2<f32>(1.0, 1.0));
  let sampleUv = clamp(
    input.uv * (1.0 - texelSize) + texelSize * 0.5,
    texelSize * 0.5,
    vec2<f32>(1.0, 1.0) - texelSize * 0.5,
  );
  let intensity = clamp(textureSampleLevel(heatmapTexture, heatmapSampler, sampleUv, 0.0).r, 0.0, 1.0);
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
  let is_doji = abs(open_y - close_y) < min_body_height;
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

export const initializeRenderer = async (canvas: HTMLCanvasElement): Promise<RendererState> => {
  const gpu = (navigator as { gpu?: GPU }).gpu;
  assert(gpu, "WebGPU is not available in this browser.");

  const adapter = await gpu.requestAdapter();
  assert(adapter, "Unable to acquire a WebGPU adapter.");

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
  assert(context, "Unable to create a WebGPU canvas context.");

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
        sampler: {
          type: "filtering",
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: "float",
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
  const heatmapSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });
  const heatmapTextureSize: [number, number] = [1, 1];
  const heatmapTexture = device.createTexture({
    size: {
      width: heatmapTextureSize[0],
      height: heatmapTextureSize[1],
      depthOrArrayLayers: 1,
    },
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const heatmapTextureView = heatmapTexture.createView();
  const heatmapBindGroup = device.createBindGroup({
    layout: heatmapBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: heatmapSampler,
      },
      {
        binding: 1,
        resource: heatmapTextureView,
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
    heatmapSampler,
    heatmapTexture,
    heatmapTextureView,
    heatmapBindGroup,
    heatmapTextureSize,
    candleInstanceBuffer,
    candleInstanceCapacity,
  };
};

export const getCanvasResolution = (canvas: HTMLCanvasElement): [width: number, height: number] => {
  const dpr = window.devicePixelRatio || 1;
  return [Math.max(1, Math.floor(canvas.clientWidth * dpr)), Math.max(1, Math.floor(canvas.clientHeight * dpr))];
};

const getVisibleCandles = (
  priceCandles: PriceCandle[],
  viewport: ChartViewport,
  candleInterval: number,
): PriceCandle[] => {
  const visibleFrom = viewport.time[0] - candleInterval;
  const visibleTo = viewport.time[1] + candleInterval;
  return priceCandles.filter((candle) => candle.time >= visibleFrom && candle.time <= visibleTo);
};

const ensureCandleInstanceCapacity = (renderer: RendererState, candleCount: number): void => {
  if (candleCount <= renderer.candleInstanceCapacity) {
    return;
  }

  const nextCapacity = Math.max(candleCount, renderer.candleInstanceCapacity * 2);
  renderer.candleInstanceBuffer.destroy();
  renderer.candleInstanceBuffer = renderer.device.createBuffer({
    size: nextCapacity * bytesPerCandleInstance,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  renderer.candleInstanceCapacity = nextCapacity;
};

const recreateHeatmapTexture = (renderer: RendererState, width: number, height: number): void => {
  if (width === renderer.heatmapTextureSize[0] && height === renderer.heatmapTextureSize[1]) {
    return;
  }

  renderer.heatmapTexture.destroy();
  renderer.heatmapTexture = renderer.device.createTexture({
    size: {
      width,
      height,
      depthOrArrayLayers: 1,
    },
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  renderer.heatmapTextureView = renderer.heatmapTexture.createView();
  renderer.heatmapBindGroup = renderer.device.createBindGroup({
    layout: renderer.heatmapPipeline.getBindGroupLayout(1),
    entries: [
      {
        binding: 0,
        resource: renderer.heatmapSampler,
      },
      {
        binding: 1,
        resource: renderer.heatmapTextureView,
      },
    ],
  });
  renderer.heatmapTextureSize = [width, height];
};

export const writeChartUniforms = (renderer: RendererState, viewport: ChartViewport, candleInterval: number): void => {
  const chartUniforms: ChartUniforms = {
    priceRange: viewport.price,
    resolution: viewport.resolution,
    timeScale: [Math.max(viewport.time[1] - viewport.time[0], 1), candleInterval],
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

export const writeHeatmapTexture = (renderer: RendererState, orderBookHeatmap: OrderBookHeatmapEntry[]) => {
  if (orderBookHeatmap.length === 0) {
    return 0;
  }

  const width = orderBookHeatmap.reduce((current, entry) => Math.max(current, entry.x), -1) + 1;
  const height = orderBookHeatmap.reduce((current, entry) => Math.max(current, entry.y), -1) + 1;
  if (width <= 0 || height <= 0) {
    return 0;
  }

  recreateHeatmapTexture(renderer, width, height);

  const heatmapSizes = new Float32Array(width * height);
  const activeColumns = new Array<boolean>(width).fill(false);
  let maxSize = 0;

  orderBookHeatmap.forEach((entry) => {
    const offset = entry.y * width + entry.x;
    heatmapSizes[offset] = entry.size;
    activeColumns[entry.x] ||= entry.size > 0;
    maxSize = Math.max(maxSize, entry.size);
  });

  const nearestActiveLeft = new Int32Array(width).fill(-1);
  const nearestActiveRight = new Int32Array(width).fill(-1);
  let lastActive = -1;
  for (let x = 0; x < width; x += 1) {
    if (activeColumns[x]) {
      lastActive = x;
    }
    nearestActiveLeft[x] = lastActive;
  }

  lastActive = -1;
  for (let x = width - 1; x >= 0; x -= 1) {
    if (activeColumns[x]) {
      lastActive = x;
    }
    nearestActiveRight[x] = lastActive;
  }

  const textureData = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = y * width + x;
      let size = heatmapSizes[sourceOffset];

      if (!activeColumns[x]) {
        const left = nearestActiveLeft[x];
        const right = nearestActiveRight[x];

        if (left >= 0 && right >= 0 && left !== right) {
          const leftSize = heatmapSizes[y * width + left];
          const rightSize = heatmapSizes[y * width + right];
          const t = (x - left) / (right - left);
          size = leftSize + (rightSize - leftSize) * t;
        }
      }

      const intensity = maxSize > 0 ? Math.log1p(size) / Math.log1p(maxSize) : 0;
      const row = height - 1 - y;
      const textureOffset = (row * width + x) * 4;
      const channel = Math.round(intensity * 255);
      textureData[textureOffset] = channel;
      textureData[textureOffset + 1] = channel;
      textureData[textureOffset + 2] = channel;
      textureData[textureOffset + 3] = 255;
    }
  }

  renderer.device.queue.writeTexture(
    { texture: renderer.heatmapTexture },
    textureData,
    {
      offset: 0,
      bytesPerRow: width * 4,
      rowsPerImage: height,
    },
    {
      width,
      height,
      depthOrArrayLayers: 1,
    },
  );
};

const writeCandleInstance = (target: Float32Array, index: number, candleInstance: CandleInstance): void => {
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
  const visibleCandles = getVisibleCandles(priceCandles, viewport, candleInterval);
  if (visibleCandles.length === 0) {
    return 0;
  }

  ensureCandleInstanceCapacity(renderer, visibleCandles.length);

  const instanceData = new Float32Array(visibleCandles.length * floatsPerCandleInstance);

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

  renderer.device.queue.writeBuffer(renderer.candleInstanceBuffer, 0, instanceData);
  return visibleCandles.length;
};

export const drawFrame = (renderer: RendererState, candleInstanceCount: number, drawHeatmap: boolean): void => {
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

  if (drawHeatmap) {
    renderPass.setPipeline(renderer.heatmapPipeline);
    renderPass.setBindGroup(0, renderer.chartBindGroup);
    renderPass.setBindGroup(1, renderer.heatmapBindGroup);
    renderPass.draw(3);
  }

  if (candleInstanceCount > 0) {
    renderPass.setPipeline(renderer.candlePipeline);
    renderPass.setBindGroup(0, renderer.chartBindGroup);
    renderPass.setVertexBuffer(0, renderer.candleInstanceBuffer);
    renderPass.draw(12, candleInstanceCount);
  }

  renderPass.end();
  renderer.device.queue.submit([commandEncoder.finish()]);
};
