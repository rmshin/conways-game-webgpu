function getCellVertexData() {
  const numVertices = 4;
  const vertexData = new Float32Array(2 * numVertices); // two coords per vertex
  const indexData = new Uint32Array(3 * 2); // 2 triangles per cell

  let offset = 0;
  const addVertex = (x, y) => {
    vertexData[offset++] = x;
    vertexData[offset++] = y;
  };

  addVertex(-0.8, 0.8);
  addVertex(-0.8, -0.8);
  addVertex(0.8, 0.8);
  addVertex(0.8, -0.8);

  offset = 0;
  // first triangle
  indexData[offset++] = 0;
  indexData[offset++] = 1;
  indexData[offset++] = 2;
  // second triangle
  indexData[offset++] = 2;
  indexData[offset++] = 3;
  indexData[offset++] = 1;

  return {
    cell: {
      vertexData,
      indexData,
      numVertices: indexData.length,
    },
  };
}

export { getCellVertexData };
