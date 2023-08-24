import { setup } from './webgpu.js';
import { getCellVertexData } from './vertex-data.js';

let GRID_WIDTH = 64,
  GRID_HEIGHT = 64;
const CELL_SIZE = 10;
const MAX_GRID_SIZE = 512 * 512;

async function main() {
  const { device, canvas, pipeline, simulationPipeline, renderPassDescriptor, WORKGROUP_SIZE } =
    await setup();

  // create buffers
  const { cell } = getCellVertexData();
  const vertexBuffer = device.createBuffer({
    label: 'cell vertex buffer',
    size: cell.vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const indexBuffer = device.createBuffer({
    label: 'cell index buffer',
    size: cell.indexData.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, cell.indexData);
  const gridUniformBuffer = device.createBuffer({
    label: 'grid size uniform buffer',
    size: 2 * 4, // 2 floats, 4 bytes per float
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // cell active state buffer
  const stateStorageBuffers = [
    device.createBuffer({
      label: 'cell active state storage buffer',
      size: MAX_GRID_SIZE * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    device.createBuffer({
      label: 'cell active state storage buffer',
      size: MAX_GRID_SIZE * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
  ];

  // bind groups in ping pong scheme
  const bindGroups = [
    device.createBindGroup({
      label: 'cell renderer bind group 1',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: gridUniformBuffer },
        },
        {
          binding: 1,
          resource: { buffer: stateStorageBuffers[0] },
        },
        {
          binding: 2,
          resource: { buffer: stateStorageBuffers[1] },
        },
      ],
    }),
    device.createBindGroup({
      label: 'cell renderer bind group 2',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: gridUniformBuffer },
        },
        {
          binding: 1,
          resource: { buffer: stateStorageBuffers[1] },
        },
        {
          binding: 2,
          resource: { buffer: stateStorageBuffers[0] },
        },
      ],
    }),
  ];

  function render() {
    // Get the current texture from the canvas context and
    // set it as the texture to render to.
    renderPassDescriptor.colorAttachments[0].view = canvas
      .getContext('webgpu')
      .getCurrentTexture()
      .createView();

    // make a command encoder to start encoding commands
    const encoder = device.createCommandEncoder({ label: 'encoder' });

    // make a compute pass encoder
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(simulationPipeline);
    computePass.setBindGroup(0, bindGroups[step % 2]);
    const workgroupCountX = Math.ceil(GRID_WIDTH / WORKGROUP_SIZE);
    const workgroupCountY = Math.ceil(GRID_HEIGHT / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCountX, workgroupCountY);
    computePass.end();

    // make a render pass encoder to encode render specific commands
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroups[step % 2]);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(cell.numVertices, GRID_WIDTH * GRID_HEIGHT);
    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
  }

  const tickPeriod = 50;
  let previousTimeStamp;
  let step = 0;
  function mainLoop(time) {
    requestAnimationFrame(mainLoop);
    if (previousTimeStamp === undefined) {
      previousTimeStamp = time;
    }

    const elapsed = time - previousTimeStamp;
    if (elapsed >= tickPeriod) {
      previousTimeStamp = time;
      render();
      step++;
    }
  }

  function resizeCanvas(_) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // resize grid
    const aspect = width / height;
    const { cell } = getCellVertexData(aspect);
    device.queue.writeBuffer(vertexBuffer, 0, cell.vertexData);
    GRID_WIDTH = Math.ceil(width / CELL_SIZE);
    GRID_HEIGHT = Math.ceil(height / CELL_SIZE);
    device.queue.writeBuffer(gridUniformBuffer, 0, new Float32Array([GRID_WIDTH, GRID_HEIGHT]));
    // initialise cell states with random values
    const cellStateData = new Uint32Array(GRID_WIDTH * GRID_HEIGHT);
    for (let i = 0; i < cellStateData.length; i++) {
      cellStateData[i] = Math.random() > 0.65 ? 1 : 0;
    }
    device.queue.writeBuffer(stateStorageBuffers[0], 0, cellStateData);

    // clamp canvas sizes to ensure WebGPU doesn't throw GPUValidationErrors
    const renderWidth = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
    const renderHeight = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
    canvas.width = renderWidth;
    canvas.height = renderHeight;
    canvas.style.width = `${renderWidth}px`;
    canvas.style.height = `${renderHeight}px`;
    render();
  }
  addEventListener('resize', resizeCanvas);
  resizeCanvas();

  requestAnimationFrame(mainLoop);
}

main();
