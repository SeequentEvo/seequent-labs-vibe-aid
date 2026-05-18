import type { SchemaDescriptor } from "./types";

/** Schema descriptor for the Evo Pointset object type. */
export const pointsetDescriptor: SchemaDescriptor = {
  family: "pointset",
  matches: (schemaId: string) => schemaId.startsWith("/objects/pointset/1."),
  attachments: [
    {
      id: "locations",
      jsonPath: ["locations"],
      identityFrom: {
        path: ["coordinates"],
        columns: ["x", "y", "z"],
      },
      attributesAt: ["attributes"],
    },
  ],
};
