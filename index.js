import { setup } from './webgpu.js';
import { getCellVertexData } from './vertex-data.js';

let GRID_WIDTH = 64,
  GRID_HEIGHT = 64;
const CELL_SIZE = 16;

async function main() {
  const { device, canvas, pipeline, renderPassDescriptor } = await setup();

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
  // bind groups
  const bindGroup = device.createBindGroup({
    label: 'cell renderer bind group',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: gridUniformBuffer },
      },
    ],
  });

  function update(time) {}

  function render() {
    // Get the current texture from the canvas context and
    // set it as the texture to render to.
    renderPassDescriptor.colorAttachments[0].view = canvas
      .getContext('webgpu')
      .getCurrentTexture()
      .createView();

    // make a command encoder to start encoding commands
    const encoder = device.createCommandEncoder({ label: 'encoder' });

    // make a render pass encoder to encode render specific commands
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(cell.numVertices, GRID_WIDTH * GRID_HEIGHT);
    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
  }

  function mainLoop(time) {
    requestAnimationFrame(mainLoop);
    update(time);
    render();
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
