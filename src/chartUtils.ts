import type { PriceCandle } from "./market";
import type { ChartViewport } from "./Chart";

const floatsPerCandleInstance = 8;
const bytesPerFloat = 4;
const bytesPerCandleInstance = floatsPerCandleInstance * bytesPerFloat;
const floatsPerChartUniforms = 8;
const bytesPerChartUniforms = floatsPerChartUniforms * bytesPerFloat;

type CandleTiming = {
  timeOffset: number;
  padding0: number;
  padding1: number;
  padding2: number;
};

type CandlePrices = {
  open: number;
  high: number;
  low: number;
  close: number;
};

type CandleInstance = {
  timing: CandleTiming;
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
  backgroundPipeline: GPURenderPipeline;
  candlePipeline: GPURenderPipeline;
  chartUniformBuffer: GPUBuffer;
  chartBindGroup: GPUBindGroup;
  candleInstanceBuffer: GPUBuffer;
  candleInstanceCapacity: number;
};

const backgroundShader = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(3.0, 1.0),
  );

  var output: VertexOutput;
  let position = positions[vertexIndex];
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = position * 0.5 + vec2<f32>(0.5, 0.5);
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let uv = clamp(input.uv, vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
  let top = vec3<f32>(0.02, 0.06, 0.16);
  let bottom = vec3<f32>(0.96, 0.33, 0.12);
  let accent = vec3<f32>(0.98, 0.84, 0.28);
  let base = mix(bottom, top, uv.y);
  let glow = 1.0 - smoothstep(0.0, 0.55, distance(uv, vec2<f32>(0.72, 0.2)));
  let streak = smoothstep(0.0, 1.0, uv.x) * 0.09;
  let color = base + accent * glow * 0.18 + vec3<f32>(streak, streak * 0.6, streak * 0.2);

  return vec4<f32>(color, 1.0);
}
`;

const candleShader = /* wgsl */ `
const VIEWPORT_MIN_Y: f32 = 0.02;
const VIEWPORT_MAX_Y: f32 = 0.98;
const BODY_WIDTH_FACTOR: f32 = 0.38;
const WICK_WIDTH_FACTOR: f32 = 0.06;
const MIN_WICK_HALF_WIDTH: f32 = 0.0006;

struct CandleTiming {
  time_offset: f32,
  padding0: f32,
  padding1: f32,
  padding2: f32,
};

struct CandlePrices {
  open: f32,
  high: f32,
  low: f32,
  close: f32,
};

struct CandleInstance {
  timing: CandleTiming,
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
  @location(0) timing: vec4<f32>,
  @location(1) prices: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

fn to_candle_instance(input: CandleInstanceInput) -> CandleInstance {
  return CandleInstance(
    CandleTiming(
      input.timing.x,
      input.timing.y,
      input.timing.z,
      input.timing.w,
    ),
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
  return clamp(normalized, VIEWPORT_MIN_Y, VIEWPORT_MAX_Y);
}

fn candle_color(candle: CandleInstance) -> vec4<f32> {
  let is_rising = candle.prices.close >= candle.prices.open;
  return select(
    vec4<f32>(0.92, 0.34, 0.28, 1.0),
    vec4<f32>(0.18, 0.9, 0.56, 1.0),
    is_rising,
  );
}

@vertex
fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  input: CandleInstanceInput,
) -> VertexOutput {
  let candle = to_candle_instance(input);
  let isWick = vertexIndex >= 6u;
  let localIndex = select(vertexIndex, vertexIndex - 6u, isWick);
  let time_span = max(chart.time_scale.x, 1.0);
  let candle_interval = chart.time_scale.y;
  let candle_slot_width = candle_interval / time_span;
  let body_half_width = candle_slot_width * BODY_WIDTH_FACTOR;
  let wick_half_width = max(candle_slot_width * WICK_WIDTH_FACTOR, MIN_WICK_HALF_WIDTH);
  let open_y = to_viewport_y(candle.prices.open);
  let close_y = to_viewport_y(candle.prices.close);
  let body_mid_y = (open_y + close_y) * 0.5;
  let min_body_height = 2.0 / max(chart.resolution.y, 1.0);
  let body_half_height = max(abs(open_y - close_y), min_body_height) * 0.5;
  let body_top = clamp(body_mid_y - body_half_height, VIEWPORT_MIN_Y, VIEWPORT_MAX_Y);
  let body_bottom = clamp(body_mid_y + body_half_height, VIEWPORT_MIN_Y, VIEWPORT_MAX_Y);
  let wick_top = min(to_viewport_y(candle.prices.high), body_top);
  let wick_bottom = max(to_viewport_y(candle.prices.low), body_bottom);
  let center_x = clamp(
    (candle.timing.time_offset + candle_interval * 0.5) / time_span,
    0.0,
    1.0,
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
  const backgroundShaderModule = device.createShaderModule({
    code: backgroundShader,
  });
  const candleShaderModule = device.createShaderModule({
    code: candleShader,
  });

  const backgroundPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: backgroundShaderModule,
      entryPoint: "vertexMain",
    },
    fragment: {
      module: backgroundShaderModule,
      entryPoint: "fragmentMain",
      targets: [{ format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const candlePipeline = device.createRenderPipeline({
    layout: "auto",
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
              format: "float32x4",
              offset: 0,
            },
            {
              shaderLocation: 1,
              format: "float32x4",
              offset: 16,
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
    layout: candlePipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: chartUniformBuffer,
        },
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
    backgroundPipeline,
    candlePipeline,
    chartUniformBuffer,
    chartBindGroup,
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

const writeCandleInstance = (
  target: Float32Array,
  index: number,
  candleInstance: CandleInstance,
): void => {
  const offset = index * floatsPerCandleInstance;

  target.set(
    [
      candleInstance.timing.timeOffset,
      candleInstance.timing.padding0,
      candleInstance.timing.padding1,
      candleInstance.timing.padding2,
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
      timing: {
        timeOffset: priceCandle.time - viewport.time[0],
        padding0: 0,
        padding1: 0,
        padding2: 0,
      },
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

  renderPass.setPipeline(renderer.backgroundPipeline);
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
