import { Table as ArrowTable, Schema, Field, tableFromIPC, type Vector, Int32, Utf8, Dictionary, makeData, makeVector } from "apache-arrow";

import {
  type BlobRef,
  type BlobStore,
  type CacheScope,
  readParquetFromCache,
} from "@/api/evo/blob";
import { extractObjectDataDownloadUrls } from "@/api/evo/objects";
import type { GeoscienceObjectEnvelope } from "@/types/object";

import { decodeAttributeColumns, describeAttribute } from "./attributes";
import { buildColumnMetadata, type DecodedColumn } from "./column-meta";
import { synthesiseEmptyColumns } from "./empty-column";
import { decodeIdentityColumns, decodeCategoryColumn, decodeSchemaColumnGroup, resolveCategoryColumns, resolveIdentity, resolveSchemaColumns } from "./identity";
import { lookupDescriptor } from "./schemas/registry";
import type {
  AttachmentDescriptor,
  AttachmentTable,
  AttributeDescriptor,
  AttributeSelector,
  LoadAttachmentOptions,
  ObjectDescription,
  PerAttributeError,
  PerEnvelopeError,
  PerSchemaColumnGroupError,
  SchemaColumnGroupDescriptor,
  SchemaColumnSelector,
} from "./types";

export interface LoadDeps {
  readonly store: BlobStore;
  readonly scope: CacheScope;
  readonly signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stamp per-column metadata onto an Arrow table's schema fields. */
function attachMetadata(
  table: ArrowTable,
  columnMetadata: Map<string, string>[],
): ArrowTable {
  const newFields = table.schema.fields.map((field, i) => {
    const meta = columnMetadata[i];
    if (!meta || meta.size === 0) return field;
    const merged = new Map([...field.metadata, ...meta]);
    return new Field(field.name, field.type, field.nullable, merged);
  });
  const newSchema = new Schema(newFields, table.schema.metadata);
  return new ArrowTable(newSchema, table.batches);
}

function walkPath(root: unknown, path: readonly string[]): unknown {
  let node: unknown = root;
  for (const key of path) {
    if (node == null || typeof node !== "object") return undefined;
    const desc = Object.getOwnPropertyDescriptor(node, key);
    if (!desc) return undefined;
    node = desc.value;
  }
  return node;
}

// ---------------------------------------------------------------------------
// describeObject — pure, synchronous
// ---------------------------------------------------------------------------

export function describeObject(
  envelope: GeoscienceObjectEnvelope,
): ObjectDescription {
  const schemaId = envelope.schema;
  const descriptor = lookupDescriptor(schemaId);

  if (!descriptor) {
    return {
      kind: "unsupported",
      schemaId,
      reason: "no-descriptor",
      message: `No schema descriptor registered for "${schemaId}"`,
    };
  }

  function resolveBlueprint(blueprint: import("./schemas/types").AttachmentBlueprint): AttachmentDescriptor | null {
    const attachmentNode = walkPath(envelope.object, blueprint.jsonPath);

    if (blueprint.optional && (attachmentNode == null || typeof attachmentNode !== "object")) {
      return null;
    }

    const envelopeErrors: PerEnvelopeError[] = [];

    const identity = resolveIdentity(attachmentNode, blueprint, envelopeErrors);

    const schemaColumns = resolveSchemaColumns(attachmentNode, blueprint, envelopeErrors);

    const categoryColumns = resolveCategoryColumns(attachmentNode, blueprint, envelopeErrors);

    const attrPath = blueprint.attributesAt ?? ["attributes"];
    const rawAttrs = walkPath(attachmentNode, attrPath);
    const rawAttributes = Array.isArray(rawAttrs)
      ? rawAttrs.map((raw: unknown) => describeAttribute(raw, envelopeErrors))
      : [];

    // Detect duplicate keys within this attachment. The schema requires
    // uniqueness, but the API does not enforce it.
    const keyCounts = new Map<string, number>();
    for (const a of rawAttributes) {
      keyCounts.set(a.key, (keyCounts.get(a.key) ?? 0) + 1);
    }
    const duplicateAttributeKeys = [...keyCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([k]) => k)
      .sort();
    const duplicateKeySet = new Set(duplicateAttributeKeys);
    const attributes = duplicateKeySet.size === 0
      ? rawAttributes
      : rawAttributes.map((a) =>
          duplicateKeySet.has(a.key) ? { ...a, duplicateKey: true } : a,
        );

    const rowCount = identity?.rowCount ?? 0;

    return {
      id: blueprint.id,
      jsonPath: blueprint.jsonPath,
      rowCount,
      identity,
      schemaColumns,
      categoryColumns,
      attributes,
      duplicateAttributeKeys,
      envelopeErrors,
    };
  }

  const staticAttachments = descriptor.attachments
    .map(resolveBlueprint)
    .filter((a): a is AttachmentDescriptor => a !== null);

  const dynamicBlueprints = descriptor.dynamicAttachments
    ? descriptor.dynamicAttachments(envelope.object as Record<string, unknown>)
    : [];

  const dynamicAttachments = dynamicBlueprints
    .map(resolveBlueprint)
    .filter((a): a is AttachmentDescriptor => a !== null);

  const attachments = [...staticAttachments, ...dynamicAttachments];

  // Aggregate duplicate-key info and emit a single console.warn if found.
  const offenders = attachments.filter((a) => a.duplicateAttributeKeys.length > 0);
  const hasDuplicateAttributeKeys = offenders.length > 0;
  if (hasDuplicateAttributeKeys) {
    const detail = offenders
      .map((a) => `attachment "${a.id}": ${a.duplicateAttributeKeys.map((k) => `"${k}"`).join(", ")}`)
      .join("; ");
    console.warn(
      `[geoscience-object] Schema violation in ${envelope.objectId} (${schemaId}): ` +
        `duplicate attribute keys — ${detail}`,
    );
  }

  const propertiesData = descriptor.propertiesView
    ? walkPath(envelope.object, descriptor.propertiesView.path)
    : undefined;

  return {
    kind: "supported",
    schemaId,
    schemaFamily: descriptor.family,
    attachments,
    hasDuplicateAttributeKeys,
    ...(propertiesData !== undefined && { propertiesData }),
  };
}

// ---------------------------------------------------------------------------
// loadAttachment — async, downloads + decodes Parquet blobs
// ---------------------------------------------------------------------------

function selectAttributes(
  all: readonly AttributeDescriptor[],
  selector: AttributeSelector,
): readonly AttributeDescriptor[] {
  switch (selector.kind) {
    case "none":
      return [];
    case "all":
      return all;
    case "keys": {
      const keySet = new Set(selector.keys);
      return all.filter((a) => keySet.has(a.key));
    }
  }
}

function selectSchemaColumnGroups(
  all: readonly SchemaColumnGroupDescriptor[],
  selector: SchemaColumnSelector | undefined,
): readonly SchemaColumnGroupDescriptor[] {
  if (!selector || selector.kind === "none") return [];
  if (selector.kind === "all") return all;
  const idSet = new Set(selector.ids);
  return all.filter((g) => idSet.has(g.id));
}

export async function loadAttachment(
  attachment: AttachmentDescriptor,
  envelope: GeoscienceObjectEnvelope,
  deps: LoadDeps,
  options: LoadAttachmentOptions,
): Promise<AttachmentTable> {
  // Validate attribute keys before any I/O
  if (options.attributes.kind === "keys") {
    const validKeys = new Set(attachment.attributes.map((a) => a.key));
    const unknownKeys = options.attributes.keys.filter(
      (k) => !validKeys.has(k),
    );
    if (unknownKeys.length > 0) {
      const available = [...validKeys].sort().join(", ");
      throw new Error(
        `Unknown attribute key(s): ${unknownKeys.map((k) => `"${k}"`).join(", ")}. ` +
          `Available keys: ${available}`,
      );
    }
  }

  // Validate schema column group IDs before any I/O
  if (options.schemaColumns?.kind === "ids") {
    const validIds = new Set(attachment.schemaColumns.map((g) => g.id));
    const unknownIds = options.schemaColumns.ids.filter(
      (id) => !validIds.has(id),
    );
    if (unknownIds.length > 0) {
      const available = [...validIds].sort().join(", ");
      throw new Error(
        `Unknown schema column group ID(s): ${unknownIds.map((id) => `"${id}"`).join(", ")}. ` +
          `Available IDs: ${available}`,
      );
    }
  }

  const selectedAttrs = selectAttributes(
    attachment.attributes,
    options.attributes,
  );

  const selectedSchemaGroups = selectSchemaColumnGroups(
    attachment.schemaColumns,
    options.schemaColumns,
  );

  const urlMap = extractObjectDataDownloadUrls(envelope);

  // Collect unique blob refs — only from blob-backed descriptors
  const blobRefs = new Set<BlobRef>();
  if (attachment.identity?.kind === "blob") {
    blobRefs.add(attachment.identity.blobRef);
  }
  for (const cat of attachment.categoryColumns) {
    if (cat.kind === "blob") {
      blobRefs.add(cat.codesBlobRef);
      blobRefs.add(cat.lookupBlobRef);
    }
  }
  for (const group of selectedSchemaGroups) {
    if (group.kind === "blob") {
      blobRefs.add(group.blobRef);
    }
  }
  for (const attr of selectedAttrs) {
    if (attr.attributeData.kind === "blob") {
      for (const ref of attr.attributeData.blobs) {
        blobRefs.add(ref);
      }
    }
  }

  // Download all blobs in parallel, converting parquet-wasm → Arrow JS
  const entries = await Promise.all(
    [...blobRefs].map(async (ref) => {
      const url = urlMap.get(ref);
      if (!url) {
        throw new Error(`No download URL found for blob ref "${ref}"`);
      }

      const parquetTable = await readParquetFromCache({
        store: deps.store,
        scope: deps.scope,
        ref,
        resolveDownload: async () => {
          // Azure pre-signed URLs support HEAD; Content-Length gives us the
          // total size needed by the chunked downloader. Without this the
          // downloader plans zero chunks and writes an empty cache entry,
          // surfacing later as a parquet decode error ("Empty input").
          const head = await fetch(url, {
            method: "HEAD",
            signal: deps.signal,
          });
          if (!head.ok) {
            throw new Error(
              `Failed to HEAD blob "${ref}": ${String(head.status)} ${head.statusText}`,
            );
          }
          const lenHeader = head.headers.get("content-length");
          const totalSize = lenHeader ? Number(lenHeader) : NaN;
          if (!Number.isFinite(totalSize) || totalSize <= 0) {
            throw new Error(
              `Pre-signed URL for blob "${ref}" returned no usable Content-Length`,
            );
          }
          return { url, totalSize };
        },
        signal: deps.signal,
      });

      const arrowTable = tableFromIPC(parquetTable.intoIPCStream());
      return [ref, arrowTable] as const;
    }),
  );

  const arrowTables: ReadonlyMap<BlobRef, ArrowTable> = new Map(entries);

  // Decode identity columns (if present)
  const allColumns: DecodedColumn[] = [];
  const errors: PerAttributeError[] = [];
  const schemaColumnErrors: PerSchemaColumnGroupError[] = [];

  if (attachment.identity) {
    if (attachment.identity.kind === "blob") {
      const identityTable = arrowTables.get(attachment.identity.blobRef);
      if (!identityTable) {
        throw new Error(
          `Arrow table missing for identity blob "${attachment.identity.blobRef}"`,
        );
      }
      allColumns.push(...decodeIdentityColumns(attachment.identity, identityTable));
    } else {
      allColumns.push(...synthesiseEmptyColumns({
        elementSchema: attachment.identity.elementSchema,
        columnNames: attachment.identity.columns,
        role: "identity",
        source: "identity",
      }));
    }
  }

  // Decode category-data columns (e.g. hole_id) — always loaded
  for (const cat of attachment.categoryColumns) {
    try {
      if (cat.kind !== "blob") {
        // Empty category — synthesise a 0-row dictionary column
        const dictType = new Dictionary(new Utf8(), new Int32());
        const emptyDict = makeVector([makeData({ type: dictType, length: 0, nullCount: 0 })]);
        allColumns.push({
          name: cat.id,
          data: emptyDict,
          metadata: buildColumnMetadata({
            role: "schema-column",
            source: cat.id,
            blobRef: "",
            noData: true,
            schemaColumnGroupId: cat.id,
          }),
        });
        continue;
      }
      const codesTable = arrowTables.get(cat.codesBlobRef);
      if (!codesTable) {
        throw new Error(
          `Arrow table missing for category codes blob "${cat.codesBlobRef}"`,
        );
      }
      const lookupTable = arrowTables.get(cat.lookupBlobRef);
      if (!lookupTable) {
        throw new Error(
          `Arrow table missing for category lookup blob "${cat.lookupBlobRef}"`,
        );
      }
      const cols = decodeCategoryColumn(cat, codesTable, lookupTable);
      allColumns.push(...cols);
    } catch (err) {
      schemaColumnErrors.push({
        groupId: cat.id,
        groupLabel: cat.label,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Decode schema column groups — per-group error isolation
  for (const group of selectedSchemaGroups) {
    try {
      if (group.kind !== "blob") {
        allColumns.push(...synthesiseEmptyColumns({
          elementSchema: group.elementSchema,
          columnNames: group.columns,
          role: "schema-column",
          source: group.id,
          schemaColumnGroupId: group.id,
        }));
        continue;
      }
      const groupTable = arrowTables.get(group.blobRef);
      if (!groupTable) {
        throw new Error(
          `Arrow table missing for schema column group "${group.id}" blob "${group.blobRef}"`,
        );
      }
      const cols = decodeSchemaColumnGroup(group, groupTable);
      allColumns.push(...cols);
    } catch (err) {
      schemaColumnErrors.push({
        groupId: group.id,
        groupLabel: group.label,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Decode only selected attribute columns — per-attribute error isolation
  for (const attr of selectedAttrs) {
    if (!attr.kind.decoded) continue;
    try {
      const cols = decodeAttributeColumns(attr, arrowTables);
      allColumns.push(...cols);
    } catch (err) {
      errors.push({
        attributeKey: attr.key,
        attributeName: attr.name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Build final Arrow table from named column vectors. `DecodedColumn.data`
  // is `Vector` (non-null), so the Table constructor's
  // `Record<string, Vector>` overload accepts the column map directly.
  const columns: Record<string, Vector> = {};
  const metadataList: Map<string, string>[] = [];
  for (const col of allColumns) {
    columns[col.name] = col.data;
    metadataList.push(col.metadata);
  }
  let table = new ArrowTable(columns);
  table = attachMetadata(table, metadataList);

  return { table, errors, schemaColumnErrors, envelopeErrors: attachment.envelopeErrors };
}
