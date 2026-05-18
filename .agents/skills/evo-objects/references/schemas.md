# Object Schemas

> **Schema catalogue**: [Object Schemas](https://developer.seequent.com/docs/data-structures/geoscience-objects/schemas/objects)
> | **GitHub**: [evo-schemas](https://github.com/seequentevo/evo-schemas)

Geoscience objects are validated against open schemas defined in the
[evo-schemas](https://github.com/seequentevo/evo-schemas) repository (under the
`schemas/` directory). Schema validation happens server-side on upload.

## Hierarchy

Schemas are organised in three tiers:

1. **Objects** — top-level geoscience datasets (pointset, triangle mesh, drilling
   campaign, etc.)
2. **Components** — reusable building blocks (identity, attributes, geometry primitives)
3. **Elements** — primitive data types (typed arrays, colours, coordinates, lookup tables)

Objects compose components via `allOf`, and components compose elements. Covariance
between alternative structures is expressed via `oneOf`.

## Schema IDs

Object schema IDs follow the pattern:
```
/objects/<type>/<version>/<type>.schema.json
```

For example: `/objects/pointset/1.0.0/pointset.schema.json`

Components and elements follow similar naming schemes under their respective directories.

## Versioning

Schemas and sub-schemas are **individually versioned** using semantic versioning. When
creating new objects, use the **latest schema version**. When consuming objects, support
older schema versions where possible — the schema version is embedded in the object JSON
and can be inspected at runtime.

A new version of the object must be uploaded to change the schema version it uses.

## Choosing a schema

The [schema catalogue](https://developer.seequent.com/docs/data-structures/geoscience-objects/schemas/objects)
on developer.seequent.com documents all supported object types, organised by domain:

| Category | Examples |
|----------|----------|
| **Points and surfaces** | Pointset, triangle mesh, line segments |
| **Grids and block models** | Regular 2D/3D grids, tensor grids, unstructured grids |
| **Drilling and downhole** | Drilling campaign, downhole collection, downhole intervals |
| **Geological modelling** | Geological model meshes, geological sections, design geometry |
| **Structural geology** | Lineations data pointset, planar data pointset |
| **Geophysics** | Gravity, magnetics, radiometric, resistivity-IP, EM surveys |
| **Geostatistics** | Variogram, experimental variogram, ellipsoids, distributions |

Do not invent schema IDs — always use an existing schema from the catalogue. If no
existing schema fits the data, escalate to Evo support for guidance.

## Further reading

- [Understanding schemas](https://developer.seequent.com/docs/data-structures/geoscience-objects/understanding-schemas/blob-storage) — blob storage, attributes, parts, cell-type geometry
- [Schema development lifecycle](https://developer.seequent.com/docs/data-structures/geoscience-objects/versioning-and-release-process/schema-development-lifecycle) — how schemas progress from proposal to supported
- [Schema versioning policy](https://developer.seequent.com/docs/data-structures/geoscience-objects/versioning-and-release-process/schema-versioning-policy)
