import type { SchemaDescriptor } from "./types";

export const geologicalModelMeshesV1Descriptor: SchemaDescriptor = {
  family: "geological-model-meshes",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/geological-model-meshes/1."),
  attachments: [],
  propertiesView: {
    path: [],
    label: "Geological Model Meshes",
  },
};
