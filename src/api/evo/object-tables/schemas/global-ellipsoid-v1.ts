import type { SchemaDescriptor } from "./types";

/** Schema descriptor for the Evo Global Ellipsoid object type. */
export const globalEllipsoidDescriptor: SchemaDescriptor = {
  family: "global-ellipsoid",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/global-ellipsoid/1."),
  attachments: [],
  propertiesView: {
    path: [],
    label: "Ellipsoid Parameters",
  },
};
