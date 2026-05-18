import type { SchemaDescriptor } from "./types";

/** Schema descriptor for the Evo Line Segments object type. */
export const lineSegmentsV1Descriptor: SchemaDescriptor = {
  family: "line-segments",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/line-segments/1."),
  attachments: [
    {
      id: "segments.vertices",
      jsonPath: ["segments", "vertices"],
      identityFrom: {
        path: [],
        columns: ["x", "y", "z"],
      },
    },
    {
      id: "segments.indices",
      jsonPath: ["segments", "indices"],
      identityFrom: {
        path: [],
        columns: ["n0", "n1"],
      },
    },
  ],
};
