import type { AttachmentBlueprint } from "./types";

/**
 * Build dynamic attachment blueprints for a `collections[]` array
 * at the given JSON path prefix. Used by both downhole-collection and
 * drilling-campaign (for planned.collections and interim.collections).
 */
export function buildCollectionAttachments(
  envelope: Record<string, unknown>,
  collectionPath: readonly string[],
): AttachmentBlueprint[] {
  let node: unknown = envelope;
  for (const key of collectionPath) {
    if (node == null || typeof node !== "object") return [];
    node = (node as Record<string, unknown>)[key];
  }
  if (!Array.isArray(node)) return [];

  const prefix = collectionPath.join(".");
  const blueprints: AttachmentBlueprint[] = [];

  const holesGroup = {
    id: "holes",
    label: "Holes",
    path: ["holes"],
    columns: ["hole_index", "offset", "count"],
  } as const;

  for (let i = 0; i < (node as unknown[]).length; i++) {
    const item = node[i] as Record<string, unknown> | undefined;
    if (!item || typeof item !== "object") continue;

    const collectionType = item["collection_type"] as string | undefined;
    const name = (item["name"] as string | undefined) ?? `collection_${String(i)}`;
    const idBase = `${prefix}[${String(i)}]:${name}`;
    const itemPath = [...collectionPath, String(i)];

    switch (collectionType) {
      case "data":
        // data_table: attributes only + holes, no natural identity
        blueprints.push({
          id: idBase,
          jsonPath: itemPath,
          schemaColumns: [holesGroup],
          attributesAt: ["attributes"],
        });
        break;

      case "distance":
        // distance_table: distance.values (float-array-1) as identity, distance.attributes, holes
        blueprints.push({
          id: idBase,
          jsonPath: itemPath,
          identityFrom: {
            path: ["distance", "values"],
            columns: ["distance"],
          },
          schemaColumns: [holesGroup],
          attributesAt: ["distance", "attributes"],
        });
        break;

      case "interval":
        // interval_table: from_to.intervals.start_and_end (float-array-2) as identity, from_to.attributes, holes
        blueprints.push({
          id: idBase,
          jsonPath: itemPath,
          identityFrom: {
            path: ["from_to", "intervals", "start_and_end"],
            columns: ["from", "to"],
          },
          schemaColumns: [holesGroup],
          attributesAt: ["from_to", "attributes"],
        });
        break;

      case "planar":
        // relative_planar_data_table: distance.values (float-array-1) as identity,
        // relative_plane_angles (float-array-2) + optional plane_polarity (bool-array-1),
        // distance.attributes, holes
        blueprints.push({
          id: idBase,
          jsonPath: itemPath,
          identityFrom: {
            path: ["distance", "values"],
            columns: ["distance"],
          },
          schemaColumns: [
            {
              id: "relative_plane_angles",
              label: "Plane Angles",
              path: ["relative_plane_angles"],
              columns: ["alpha", "beta"],
            },
            {
              id: "plane_polarity",
              label: "Plane Polarity",
              path: ["plane_polarity"],
              columns: ["has_positive_polarity"],
            },
            holesGroup,
          ],
          attributesAt: ["distance", "attributes"],
        });
        break;

      case "lineation":
        // relative_lineation_data_table: distance.values (float-array-1) as identity,
        // relative_lineation_angles (float-array-3), distance.attributes, holes
        blueprints.push({
          id: idBase,
          jsonPath: itemPath,
          identityFrom: {
            path: ["distance", "values"],
            columns: ["distance"],
          },
          schemaColumns: [
            {
              id: "relative_lineation_angles",
              label: "Lineation Angles",
              path: ["relative_lineation_angles"],
              columns: ["alpha", "beta", "gamma"],
            },
            holesGroup,
          ],
          attributesAt: ["distance", "attributes"],
        });
        break;
    }
  }

  return blueprints;
}
