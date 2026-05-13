export {};

declare global {
  const GPUBufferUsage: {
    readonly MAP_READ: GPUFlagsConstant;
    readonly MAP_WRITE: GPUFlagsConstant;
    readonly COPY_SRC: GPUFlagsConstant;
    readonly COPY_DST: GPUFlagsConstant;
    readonly INDEX: GPUFlagsConstant;
    readonly VERTEX: GPUFlagsConstant;
    readonly UNIFORM: GPUFlagsConstant;
    readonly STORAGE: GPUFlagsConstant;
    readonly INDIRECT: GPUFlagsConstant;
    readonly QUERY_RESOLVE: GPUFlagsConstant;
  };

  const GPUMapMode: {
    readonly READ: GPUFlagsConstant;
    readonly WRITE: GPUFlagsConstant;
  };

  const GPUTextureUsage: {
    readonly COPY_SRC: GPUFlagsConstant;
    readonly COPY_DST: GPUFlagsConstant;
    readonly TEXTURE_BINDING: GPUFlagsConstant;
    readonly STORAGE_BINDING: GPUFlagsConstant;
    readonly RENDER_ATTACHMENT: GPUFlagsConstant;
  };

  const GPUShaderStage: {
    readonly VERTEX: GPUFlagsConstant;
    readonly FRAGMENT: GPUFlagsConstant;
    readonly COMPUTE: GPUFlagsConstant;
  };

  const GPUColorWrite: {
    readonly RED: GPUFlagsConstant;
    readonly GREEN: GPUFlagsConstant;
    readonly BLUE: GPUFlagsConstant;
    readonly ALPHA: GPUFlagsConstant;
    readonly ALL: GPUFlagsConstant;
  };
}
