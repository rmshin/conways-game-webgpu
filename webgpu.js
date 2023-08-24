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

const WORKGROUP_SIZE = 8;

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
    label: 'cell shaders',
    code: `
        struct Vertex {
          @location(0) position: vec2f,
        };
        struct VsOutput {
          @builtin(position) position: vec4f,
          @location(0) cell: vec2f
        }

        @group(0) @binding(0) var<uniform> grid: vec2f;
        @group(0) @binding(1) var<storage> cellStateIn: array<u32>;
  
        @vertex
        fn vs(
          vert: Vertex,
          @builtin(instance_index) instance: u32
        ) -> VsOutput {

          let state = f32(cellStateIn[instance]);
          let i = f32(instance);
          let cell = vec2f(i % grid.x, floor(i / grid.x));
          let cellOffset = 2 * cell / grid;
          let gridPos = (vert.position * state + 1) / grid - 1 + cellOffset;

          var output: VsOutput;
          output.position = vec4f(gridPos, 0.0, 1.0);
          output.cell = cell / grid;
          return output;
        }
   
        @fragment
        fn fs(input: VsOutput) -> @location(0) vec4f {
          let c = input.cell;
          return vec4f(1 - c.x, c.y, c.x, 1);
        }

        fn cellIndex(cell: vec2u) -> u32 {
          return (cell.y % u32(grid.y)) * u32(grid.x) + 
                 (cell.x % u32(grid.x));
        }
        fn cellActive(x: u32, y: u32) -> u32 {
          return cellStateIn[cellIndex(vec2(x, y))];
        }

        @group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;

        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
        fn cs(@builtin(global_invocation_id) cell: vec3u) {
          
          let idx = cellIndex(cell.xy);
          let activeNeighbors = cellActive(cell.x+1, cell.y+1) +
                                cellActive(cell.x+1, cell.y) +
                                cellActive(cell.x+1, cell.y-1) +
                                cellActive(cell.x, cell.y-1) +
                                cellActive(cell.x-1, cell.y-1) +
                                cellActive(cell.x-1, cell.y) +
                                cellActive(cell.x-1, cell.y+1) +
                                cellActive(cell.x, cell.y+1);

          switch (activeNeighbors) {
            case 2: { // active cells with 2 neighbours stay active
              cellStateOut[idx] = cellStateIn[idx];
            }
            case 3: { // cells with 3 neighbours become or stay active
              cellStateOut[idx] = 1;
            }
            default: { // cells with < 2 or > 3 neighbors become inactive
              cellStateOut[idx] = 0;
            }
          }
        }
      `,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'cell bind group layout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: {}, // grid uniform buffer
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' }, // cell state input buffer
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'storage' }, // cell state output buffer
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'cell pipeline layout',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createRenderPipeline({
    label: 'cell render pipeline',
    layout: pipelineLayout,
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

  const simulationPipeline = device.createComputePipeline({
    label: 'simulation pipeline',
    layout: pipelineLayout,
    compute: {
      module,
      entryPoint: 'cs',
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

  return { device, canvas, pipeline, simulationPipeline, renderPassDescriptor, WORKGROUP_SIZE };
}

export { setup };
