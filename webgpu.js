async function getDevice() {
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  if (!device) {
    fail('need a browser that supports WebGPU');
    return;
  }
  device.lost.then((info) => {
    console.error(`WebGPU device was lost: ${info.message}`);

    // 'reason' will be 'destroyed' if we intentionally destroy the device.
    if (info.reason !== 'destroyed') {
      // try again
      getDevice();
    }
  });
  return device;
}

async function setup() {
  const device = await getDevice();
  const canvas = document.getElementById('canvas');
  const context = canvas.getContext('webgpu');
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
  });

  const module = device.createShaderModule({
    label: 'triangle shaders',
    code: `
        struct Vertex {
          @location(0) position: vec2f,
        };
        struct VsOutput {
          @builtin(position) position: vec4f,
          @location(0) cell: vec2f
        }

        @group(0) @binding(0) var<uniform> grid: vec2f;
  
        @vertex fn vs(
          vert: Vertex,
          @builtin(instance_index) instance: u32
        ) -> VsOutput {
          var output: VsOutput;
          let i = f32(instance);
          let cell = vec2f(i % grid.x, floor(i / grid.x));
          let cellOffset = 2 * cell / grid;
          let gridPos = (vert.position + 1) / grid - 1 + cellOffset;
          // output.position = vec4f(vert.position, 0.0, 1.0);
          output.position = vec4f(gridPos, 0.0, 1.0);
          output.cell = cell;
          return output;
        }
   
        @fragment fn fs(input: VsOutput) -> @location(0) vec4f {
          let c = input.cell / grid;
          return vec4f(1 - c.x, c.y, c.x, 1);
        }
      `,
  });

  const pipeline = device.createRenderPipeline({
    label: 'grid render pipeline',
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 2 * 4,
          attributes: [
            { format: 'float32x2', offset: 0, shaderLocation: 0 }, // position
          ],
        },
      ],
    },
    fragment: {
      module,
      entryPoint: 'fs',
      targets: [{ format: presentationFormat }],
    },
  });

  const renderPassDescriptor = {
    label: 'basic canvas renderPass',
    colorAttachments: [
      {
        // view: <- to be filled out during render
        clearValue: [0, 0, 0, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  return { device, canvas, pipeline, renderPassDescriptor };
}

function setupBuffers(device) {
  const vertexBuffer = device.createBuffer({
    label: 'cell vertex buffer',
    size: 2 * 4 * 4, // 4 vertices, 2 floats per vertex, 4 bytes per float
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const gridUniformBuffer = device.createBuffer({
    label: 'grid size uniform buffer',
    size: 2 * 4, // 2 floats, 4 bytes per float
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  return {
    buffers: {
      vertex: vertexBuffer,
      gridUniform: gridUniformBuffer,
    },
  };
}

export { setup };
