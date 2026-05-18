import type { SchemaDescriptor } from "./types";
import { buildCollectionAttachments } from "./downhole-helpers";

/** Schema descriptor for downhole-collection v1 (1.0.1 – 1.3.1). */
export const downholeCollectionDescriptor: SchemaDescriptor = {
  family: "downhole-collection",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/downhole-collection/1."),
  attachments: [
    {
      id: "location",
      jsonPath: ["location"],
      identityFrom: {
        path: ["coordinates"],
        columns: ["x", "y", "z"],
      },
      schemaColumns: [
        {
          id: "distances",
          label: "Distances",
          path: ["distances"],
          columns: ["final", "target", "current"],
        },
        {
          id: "holes",
          label: "Holes",
          path: ["holes"],
          columns: ["hole_index", "offset", "count"],
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
    {
      id: "location.path",
      jsonPath: ["location", "path"],
      identityFrom: {
        path: [],
        columns: ["distance", "azimuth", "dip"],
      },
      attributesAt: ["attributes"],
    },
  ],
  dynamicAttachments: (envelope) =>
    buildCollectionAttachments(envelope, ["collections"]),
  propertiesView: {
    path: [],
    label: "Properties",
  },
};
