import type { SchemaDescriptor } from "./types";

export const geologicalSectionsDescriptor: SchemaDescriptor = {
  family: "geological-sections",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/geological-sections/1."),
  attachments: [],
  propertiesView: {
    path: [],
    label: "Geological Sections",
  },
};
