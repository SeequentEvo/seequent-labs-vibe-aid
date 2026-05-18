import type { SchemaDescriptor } from "./types";

export const planarDataPointsetDescriptor: SchemaDescriptor = {
  family: "planar-data-pointset",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/planar-data-pointset/1."),
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
          id: "plane_orientations",
          label: "Plane Orientations",
          path: ["plane_orientations"],
          columns: ["dip_azimuth", "dip"],
        },
        {
          id: "plane_polarity",
          label: "Plane Polarity",
          path: ["plane_polarity"],
          columns: ["polarity"],
        },
      ],
    },
  ],
};
