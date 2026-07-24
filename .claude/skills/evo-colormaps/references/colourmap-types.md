# Colourmap Types

Creating colourmaps — the three types, colour format, and creation examples.

## Colour format

All colours are `[R, G, B]` integer triplets with values 0–255:
```json
[[255, 0, 0], [0, 255, 0], [0, 0, 255]]
```

## Continuous colourmap (gradient)

> [API reference](https://developer.seequent.com/docs/api/colormap/colormap-api)

For smooth gradients across numerical data (e.g. grade, elevation, density).

```json
{
  "name": "Grade gradient",
  "dtype": "continuous",
  "colors": [[0, 0, 255], [255, 255, 0], [255, 0, 0]],
  "attribute_controls": [0.0, 5.0, 15.0],
  "gradient_controls": [0.0, 0.5, 1.0]
}
```

| Field | Description |
|-------|-------------|
| `colors` | 2–1024 RGB triplets defining the gradient stops |
| `attribute_controls` | Float array (≥2) — data-value breakpoints for the gradient |
| `gradient_controls` | Float array (≥2) in `[0, 1]` — positions along the gradient curve |

`attribute_controls` maps data values to gradient positions. Non-linear spacing between
`attribute_controls` and `gradient_controls` creates non-uniform gradients — useful for
emphasising specific value ranges.

## Discrete colourmap (range buckets)

For bucketed/binned numerical data (e.g. grade classes, depth intervals).

```json
{
  "name": "Grade classes",
  "dtype": "discrete",
  "colors": [[0, 128, 0], [255, 255, 0], [255, 0, 0]],
  "end_points": [2.0, 8.0],
  "end_inclusive": [true, false]
}
```

| Field | Description |
|-------|-------------|
| `colors` | 1–1024 RGB triplets — one per bucket |
| `end_points` | Float array (length = `colors.length - 1`) — bucket boundaries |
| `end_inclusive` | Boolean array (same length as `end_points`) — whether boundary belongs to left or right bucket |

The example creates 3 buckets: `[−∞, 2.0]`, `(2.0, 8.0)`, `[8.0, +∞)`.

## Category colourmap

For categorical/string data (e.g. lithology, rock type, domain codes).

```json
{
  "name": "Lithology",
  "dtype": "category",
  "colors": [[139, 69, 19], [128, 128, 128], [210, 180, 140]],
  "map": ["Sandstone", "Granite", "Limestone"]
}
```

| Field | Description |
|-------|-------------|
| `colors` | 1–16,384 RGB triplets |
| `map` | String array — **exactly** the same length as `colors` (1:1 mapping) |

## Tips for web apps

- **Continuous** is the most common type for numerical geoscience attributes
- **Category** is essential for lithology/domain visualisation
- **Discrete** is useful for grade classification and reporting cut-offs
- Consider building a colourmap picker UI that lets users choose from existing workspace
  colormaps or create new ones
- Since colormaps are write-once, version management isn't needed — but naming conventions
  help organise them (e.g. `"Au grade — low to high"`)
- The `[R, G, B]` format converts directly to CSS `rgb()` values for rendering
