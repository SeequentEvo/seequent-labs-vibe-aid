import type { SchemaDescriptor } from "./types";

export const geologicalModelMeshesV2Descriptor: SchemaDescriptor = {
  family: "geological-model-meshes",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/geological-model-meshes/2."),
  attachments: [
    {
      id: "triangle_geometry.vertices",
      jsonPath: ["triangle_geometry", "triangles", "vertices"],
      identityFrom: { path: [], columns: ["x", "y", "z"] },
    },
    {
      id: "triangle_geometry.indices",
      jsonPath: ["triangle_geometry", "triangles", "indices"],
      identityFrom: { path: [], columns: ["n0", "n1", "n2"] },
    },
    {
      id: "triangle_geometry.parts",
      jsonPath: ["triangle_geometry", "parts"],
      identityFrom: { path: ["chunks"], columns: ["offset", "count"] },
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
      id: "volume_attributes",
      jsonPath: ["volume_attributes"],
      optional: true,
      attributesAt: ["attributes"],
    },
    {
      id: "surface_attributes",
      jsonPath: ["surface_attributes"],
      optional: true,
      attributesAt: ["attributes"],
    },
  ],
  propertiesView: {
    path: [],
    label: "Geological Model",
  },
};
