import type { SchemaDescriptor } from "./types";

export const localEllipsoidsDescriptor: SchemaDescriptor = {
  family: "local-ellipsoids",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/local-ellipsoids/1."),
  attachments: [
    {
      id: "locations",
      jsonPath: ["locations"],
      identityFrom: {
        path: ["coordinates"],
        columns: ["x", "y", "z"],
      },
    },
    {
      id: "ellipsoids",
      jsonPath: ["ellipsoids"],
      identityFrom: {
        path: ["values"],
        columns: [
          "dip_azimuth",
          "dip",
          "pitch",
          "major",
          "semi_major",
          "minor",
        ],
      },
      attributesAt: ["attributes"],
    },
  ],
};
