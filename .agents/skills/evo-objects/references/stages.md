# Stages

> **API reference**: [Stages](https://developer.seequent.com/docs/api/geoscience-object/stages)
> | **Guide**: [Stages](https://developer.seequent.com/docs/guides/objects/stages)

Stages represent lifecycle phases for geoscience objects — e.g., "Approved",
"Experimental", "In Review", "Peer Review", "Preliminary Update", "Resource Ready".

## Listing stages

Stages are predefined at the **organisation level** and cannot be created through the
API.

```
GET .../orgs/{org_id}/stages
```

Returns `{ "stages": [{ "stage_id": "...", "name": "..." }] }`.

## Applying a stage

Set a stage on a specific object version:

```
PATCH .../workspaces/{workspace_id}/objects/{object_id}/metadata?version_id={version_id}
Content-Type: application/json

{ "stage_id": "<stage-uuid>" }
```

Set `stage_id` to `null` to remove the stage from a version.

**Always use an explicit `version_id`** when setting stages, for safety and integrity.
If `version_id` is omitted, the stage is applied to the latest version — but the latest
version may change between when you looked it up and when you apply the stage.

## Displaying stages

Stages are a useful visual indicator in object lists and detail views. Show the stage
name as a badge or tag alongside the object. Consider colour-coding stages to make
lifecycle status scannable at a glance.
