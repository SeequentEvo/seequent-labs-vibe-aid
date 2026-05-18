import type { SchemaDescriptor } from "./types";

export const lineationsDataPointsetDescriptor: SchemaDescriptor = {
  family: "lineations-data-pointset",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/lineations-data-pointset/1."),
  attachments: [
    {
      id: "locations",
      jsonPath: ["locations"],
      identityFrom: {
        path: ["coordinates"],
        columns: ["x", "y", "z"],
      },
      schemaColumns: [
        {
          id: "lineations",
          label: "Lineations",
          path: ["lineations"],
          columns: ["trend", "plunge"],
        },
      ],
    },
  ],
};
