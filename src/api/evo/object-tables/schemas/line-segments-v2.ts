import type { SchemaDescriptor } from "./types";

/** Schema descriptor for Evo Line Segments v2 (includes optional parts). */
export const lineSegmentsV2Descriptor: SchemaDescriptor = {
  family: "line-segments",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/line-segments/2."),
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
    {
      id: "parts",
      jsonPath: ["parts"],
      optional: true,
      identityFrom: {
        path: ["chunks"],
        columns: ["offset", "count"],
      },
    },
  ],
};
