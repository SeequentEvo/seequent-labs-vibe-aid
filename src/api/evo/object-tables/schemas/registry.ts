import type { SchemaDescriptor } from "./types";
import { cdfDescriptor } from "./cdf-v1";
import { designGeometryDescriptor } from "./design-geometry-v1";
import { downholeCollectionDescriptor } from "./downhole-collection-v1";
import { downholeIntervalsDescriptor } from "./downhole-intervals-v1";
import { drillingCampaignDescriptor } from "./drilling-campaign-v1";
import { geologicalModelMeshesV1Descriptor } from "./geological-model-meshes-v1";
import { geologicalModelMeshesV2Descriptor } from "./geological-model-meshes-v2";
import { geologicalSectionsDescriptor } from "./geological-sections-v1";
import { globalEllipsoidDescriptor } from "./global-ellipsoid-v1";
import { lineationsDataPointsetDescriptor } from "./lineations-data-pointset-v1";
import { lineSegmentsV1Descriptor } from "./line-segments-v1";
import { lineSegmentsV2Descriptor } from "./line-segments-v2";
import { localEllipsoidsDescriptor } from "./local-ellipsoids-v1";
import { planarDataPointsetDescriptor } from "./planar-data-pointset-v1";
import { pointsetDescriptor } from "./pointset-v1";
import { triangleMeshV1Descriptor } from "./triangle-mesh-v1";
import { triangleMeshV2Descriptor } from "./triangle-mesh-v2";
import { variogramDescriptor } from "./variogram-v1";

/** All registered schema descriptors. New schemas are added here. */
const descriptors: readonly SchemaDescriptor[] = [
  cdfDescriptor,
  designGeometryDescriptor,
  downholeCollectionDescriptor,
  downholeIntervalsDescriptor,
  drillingCampaignDescriptor,
  geologicalModelMeshesV1Descriptor,
  geologicalModelMeshesV2Descriptor,
  geologicalSectionsDescriptor,
  globalEllipsoidDescriptor,
  lineationsDataPointsetDescriptor,
  lineSegmentsV1Descriptor,
  lineSegmentsV2Descriptor,
  localEllipsoidsDescriptor,
  planarDataPointsetDescriptor,
  pointsetDescriptor,
  triangleMeshV1Descriptor,
  triangleMeshV2Descriptor,
  variogramDescriptor,
];

/**
 * Look up a schema descriptor by schema ID.
 * Returns undefined if the schema is not supported (no registered descriptor matches).
 */
export function lookupDescriptor(
  schemaId: string,
): SchemaDescriptor | undefined {
  return descriptors.find((d) => d.matches(schemaId));
}
