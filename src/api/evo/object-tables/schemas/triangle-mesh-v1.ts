import type { SchemaDescriptor } from "./types";

/** Schema descriptor for the Evo Triangle Mesh object type. */
export const triangleMeshV1Descriptor: SchemaDescriptor = {
  family: "triangle-mesh",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/triangle-mesh/1."),
  attachments: [
    {
      id: "triangles.vertices",
      jsonPath: ["triangles", "vertices"],
      identityFrom: {
        path: [],
        columns: ["x", "y", "z"],
      },
    },
    {
      id: "triangles.indices",
      jsonPath: ["triangles", "indices"],
      identityFrom: {
        path: [],
        columns: ["n0", "n1", "n2"],
      },
    },
  ],
};
