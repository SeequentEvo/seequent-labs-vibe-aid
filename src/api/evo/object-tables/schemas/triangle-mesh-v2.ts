import type { SchemaDescriptor } from "./types";

/** Schema descriptor for the Evo Triangle Mesh v2 object type. */
export const triangleMeshV2Descriptor: SchemaDescriptor = {
  family: "triangle-mesh",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/triangle-mesh/2."),
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
    {
      id: "parts",
      jsonPath: ["parts"],
      optional: true,
      identityFrom: {
        path: ["chunks"],
        columns: ["offset", "count"],
      },
      schemaColumns: [
        {
          id: "triangle_indices",
          label: "Triangle Indices",
          path: ["triangle_indices"],
          columns: ["index"],
        },
      ],
    },
    {
      id: "edges",
      jsonPath: ["edges"],
      optional: true,
      identityFrom: {
        path: ["indices"],
        columns: ["start", "end"],
      },
    },
    {
      id: "edges.parts",
      jsonPath: ["edges", "parts"],
      optional: true,
      identityFrom: {
        path: ["chunks"],
        columns: ["offset", "count"],
      },
    },
  ],
};
