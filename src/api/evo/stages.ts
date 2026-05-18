/**
 * Geoscience-object stage helpers.
 *
 * Stages are organisation-level lifecycle labels (e.g. "Approved",
 * "In Review") that can be attached to a specific version of a
 * geoscience object. They are predefined per organisation and cannot
 * be created through the API.
 *
 * Endpoints used (see `references/openapi.yaml`):
 * - `GET    {hubUrl}/geoscience-object/orgs/{orgId}/stages`
 * - `PATCH  {hubUrl}/geoscience-object/orgs/{orgId}/workspaces/{workspaceId}/objects/{objectId}/metadata?version_id={versionId}`
 *
 * The `PATCH .../metadata` endpoint is a generic metadata-update endpoint;
 * today its body shape (`MetadataUpdateBody`) only carries `stage_id`. We
 * therefore expose two intent-named helpers — `applyStage` and
 * `unsetStage` — rather than a generic `updateMetadata`, so call sites
 * remain readable. If the body grows new fields in future, add a more
 * general `updateObjectMetadata` helper at that point.
 *
 * URL composition:
 * - `EvoWorkspaceRef.toUrl()` returns `{hubUrl}/workspace/...` — the wrong
 *   service for stages — so we read the public `hubUrl`/`orgId` fields and
 *   build the `geoscience-object` URL ourselves.
 * - `EvoObjectRef.toUrl()` returns the `/objects/{id}` (or `/objects/path/...`)
 *   URL with an optional `?version=...` query. For metadata we want a
 *   `/metadata` suffix and a `?version_id=...` query (note the different
 *   parameter name), so we strip the version off the ref and rebuild the
 *   query ourselves. The metadata endpoint is only documented for
 *   ID-addressed objects — `applyStage`/`unsetStage` therefore reject
 *   path-addressed refs at the boundary.
 */

import { z } from "zod";

import { assertOk, evoFetch } from "./fetch";
import type { EvoObjectRef } from "./refs/object";
import type { EvoWorkspaceRef } from "./refs/workspace";
import type { Stage } from "@/types/object";
import { stageSchema } from "@/types/object";
import type { StageId } from "@/types/ids";

const listStagesResponseSchema = z
  .object({
    stages: z.array(stageSchema),
  })
  .loose();

function stagesUrl(ws: EvoWorkspaceRef): string {
  return `${ws.hubUrl}/geoscience-object/orgs/${ws.orgId}/stages`;
}

function metadataUrl(ref: EvoObjectRef): string {
  if (ref.objectId === null) {
    throw new Error(
      "applyStage/unsetStage require an ID-addressed EvoObjectRef; the metadata endpoint does not accept path-addressed objects.",
    );
  }
  const base = `${ref.hubUrl}/geoscience-object/orgs/${ref.orgId}/workspaces/${ref.workspaceId}/objects/${ref.objectId}/metadata`;
  if (ref.versionId !== null) {
    return `${base}?version_id=${encodeURIComponent(ref.versionId)}`;
  }
  return base;
}

/**
 * List the stages defined for the workspace's organisation.
 *
 * Calls `GET /geoscience-object/orgs/{orgId}/stages` and unwraps the
 * `{ stages: [...] }` envelope into a plain array. Stages are scoped
 * per organisation, not per workspace; the workspace ref is used purely
 * as a convenient carrier for the hub URL and org ID.
 *
 * @throws {EvoApiError}    on non-2xx responses.
 * @throws {EvoSchemaError} if the body does not match the expected shape.
 * @throws {EvoNetworkError} on transport failure.
 */
export async function listStages(
  ws: EvoWorkspaceRef,
  accessToken: string,
): Promise<Stage[]> {
  const url = stagesUrl(ws);
  const result = await evoFetch({
    url,
    method: "GET",
    accessToken,
    schema: listStagesResponseSchema,
  });
  return assertOk(result, { url, method: "GET" }).stages;
}

/**
 * Attach a stage to a specific object version.
 *
 * Calls `PATCH .../objects/{objectId}/metadata?version_id={versionId}`
 * with body `{ stage_id }`. **Strongly prefer passing a versioned
 * `EvoObjectRef`** (via `ref.withVersion(...)`); omitting the version
 * targets the latest, which may have moved between when you read it and
 * when you apply the stage.
 *
 * Resolves on 2xx (the API returns 204 No Content).
 *
 * @throws {EvoApiError} on non-2xx responses.
 * @throws {Error}       if `ref` is path-addressed.
 */
export async function applyStage(
  ref: EvoObjectRef,
  stageId: StageId,
  accessToken: string,
): Promise<void> {
  const url = metadataUrl(ref);
  const result = await evoFetch({
    url,
    method: "PATCH",
    accessToken,
    body: { stage_id: stageId },
  });
  assertOk(result, { url, method: "PATCH" });
}

/**
 * Remove the stage from a specific object version.
 *
 * Calls `PATCH .../objects/{objectId}/metadata?version_id={versionId}`
 * with body `{ stage_id: null }`. Same versioning caveats as
 * {@link applyStage}.
 *
 * Resolves on 2xx (the API returns 204 No Content).
 *
 * @throws {EvoApiError} on non-2xx responses.
 * @throws {Error}       if `ref` is path-addressed.
 */
export async function unsetStage(
  ref: EvoObjectRef,
  accessToken: string,
): Promise<void> {
  const url = metadataUrl(ref);
  const result = await evoFetch({
    url,
    method: "PATCH",
    accessToken,
    body: { stage_id: null },
  });
  assertOk(result, { url, method: "PATCH" });
}
