import type { SchemaDescriptor } from "./types";

/** Schema descriptor for downhole-intervals v1 (1.0.1 – 1.3.0). */
export const downholeIntervalsDescriptor: SchemaDescriptor = {
  family: "downhole-intervals",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/downhole-intervals/1."),
  attachments: [
    {
      id: "intervals",
      jsonPath: [],
      identityFrom: {
        path: ["start", "coordinates"],
        columns: ["start_x", "start_y", "start_z"],
      },
      schemaColumns: [
        {
          id: "end",
          label: "End",
          path: ["end", "coordinates"],
          columns: ["end_x", "end_y", "end_z"],
        },
        {
          id: "mid_points",
          label: "Mid Points",
          path: ["mid_points", "coordinates"],
          columns: ["mid_x", "mid_y", "mid_z"],
        },
        {
          id: "from_to",
          label: "From / To",
          path: ["from_to", "intervals", "start_and_end"],
          columns: ["from", "to"],
        },
      ],
      categoryColumns: [
        {
          id: "hole_id",
          label: "Hole ID",
          path: ["hole_id"],
        },
      ],
      attributesAt: ["attributes"],
    },
  ],
  propertiesView: {
    path: [],
    label: "Properties",
  },
};
