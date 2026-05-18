import type { SchemaDescriptor } from "./types";

/** Schema descriptor for the Evo Variogram object type. */
export const variogramDescriptor: SchemaDescriptor = {
  family: "variogram",
  matches: (schemaId: string) => schemaId.startsWith("/objects/variogram/1."),
  attachments: [],
  propertiesView: {
    path: [],
    label: "Variogram Parameters",
  },
};
