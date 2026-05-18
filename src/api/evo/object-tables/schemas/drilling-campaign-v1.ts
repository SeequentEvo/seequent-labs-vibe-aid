import type { AttachmentBlueprint, SchemaDescriptor } from "./types";
import { buildCollectionAttachments } from "./downhole-helpers";

const PLANNED_PATH_NATURAL_COLUMNS = [
  "distance", "azimuth", "dip",
  "lift_rate", "drift_rate", "deviation_rate_distance",
];

const PLANNED_PATH_MIXED_SEGMENT_COLUMNS = [
  "distance", "azimuth", "dip",
  "lift_rate", "drift_rate", "deviation_rate_distance",
  "toolface_angle", "dogleg_severity",
];

/**
 * Build attachments for `planned.path` which is `oneOf` natural / mixed
 * deviation, discriminated by `deviation_type`.
 */
function buildPlannedPathAttachments(
  envelope: Record<string, unknown>,
): AttachmentBlueprint[] {
  const planned = envelope["planned"];
  if (!planned || typeof planned !== "object") return [];

  const path = (planned as Record<string, unknown>)["path"];
  if (!path || typeof path !== "object") return [];

  const deviationType = (path as Record<string, unknown>)["deviation_type"];

  if (deviationType === "natural") {
    return [{
      id: "planned.path",
      jsonPath: ["planned", "path"],
      identityFrom: {
        path: [],
        columns: PLANNED_PATH_NATURAL_COLUMNS,
      },
      attributesAt: ["attributes"],
    }];
  }

  if (deviationType === "mixed") {
    return [
      {
        id: "planned.path",
        jsonPath: ["planned", "path"],
        identityFrom: {
          path: ["segment_properties"],
          columns: PLANNED_PATH_MIXED_SEGMENT_COLUMNS,
        },
        schemaColumns: [
          {
            id: "segment_type",
            label: "Segment Type",
            path: ["segment_type"],
            columns: ["segment_type"],
          },
        ],
        attributesAt: ["attributes"],
      },
    ];
  }

  return [];
}

/** Schema descriptor for drilling-campaign v1 (1.0.0). */
export const drillingCampaignDescriptor: SchemaDescriptor = {
  family: "drilling-campaign",
  matches: (schemaId: string) =>
    schemaId.startsWith("/objects/drilling-campaign/1."),
  attachments: [
    // Root-level hole_id — category-data mapping hole indices to names
    {
      id: "hole_id",
      jsonPath: [],
      categoryColumns: [
        {
          id: "hole_id",
          label: "Hole ID",
          path: ["hole_id"],
        },
      ],
    },
    // planned.collar — collars with coordinates, distances, holes, attributes
    {
      id: "planned.collar",
      jsonPath: ["planned", "collar"],
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
      attributesAt: ["attributes"],
    },
    // interim.collar — optional, same structure as planned.collar
    {
      id: "interim.collar",
      jsonPath: ["interim", "collar"],
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
      attributesAt: ["attributes"],
      optional: true,
    },
    // interim.path — optional, downhole-direction-vector (float-array-3)
    {
      id: "interim.path",
      jsonPath: ["interim", "path"],
      identityFrom: {
        path: [],
        columns: ["distance", "azimuth", "dip"],
      },
      attributesAt: ["attributes"],
      optional: true,
    },
  ],
  dynamicAttachments: (envelope) => {
    const blueprints: AttachmentBlueprint[] = [];

    // Top-level hole_id — handled via categoryColumns on planned.collar already
    // (but hole_id is at root, not inside planned.collar)

    // planned.path — polymorphic natural/mixed
    blueprints.push(...buildPlannedPathAttachments(envelope));

    // planned.collections — dynamic sub-tables
    blueprints.push(...buildCollectionAttachments(envelope, ["planned", "collections"]));

    // interim.collections — optional, same structure
    blueprints.push(...buildCollectionAttachments(envelope, ["interim", "collections"]));

    return blueprints;
  },
  propertiesView: {
    path: [],
    label: "Properties",
  },
};
