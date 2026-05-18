import type { SchemaDescriptor } from "./types";

export const designGeometryDescriptor: SchemaDescriptor = {
  family: "design-geometry",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/design-geometry/1."),
  attachments: [],
  propertiesView: {
    path: [],
    label: "Design Geometry",
  },
};
