# Block Model Reporting

Built-in resource reporting — specs, jobs, results, and version comparisons.

## Overview

> [Report specifications guide](https://developer.seequent.com/docs/guides/blockmodel/general-usage/reporting/report-specifications)
> | [Reporting jobs and results](https://developer.seequent.com/docs/guides/blockmodel/general-usage/reporting/reporting-jobs-and-results)
> | [Report comparisons](https://developer.seequent.com/docs/guides/blockmodel/general-usage/reporting/report-comparisons)

BMS includes a **server-side reporting engine** — you define what to report, run jobs against
specific versions, and compare results between versions. This is a distinctive feature that
has no equivalent in the Geoscience Object API.

## Workflow

1. **Create a report specification** — defines the report structure
2. **Run a reporting job** — generates results for a specific block model version
3. **Retrieve results** — tabular data (volumes, grades, tonnages)
4. **Compare** — diff results between two versions

## Report specifications

A spec defines:

| Field | Description |
|-------|-------------|
| Categories | Columns to group by (e.g. lithology, domain) |
| Value columns | Columns to aggregate (e.g. grade, density) |
| Density column | Which column represents density (for tonnage calculations) |
| Cut-off values | Grade cut-offs for reporting above/below thresholds |
| Bounding box | Optional spatial filter |
| Aggregation methods | `SUM`, `MASS_AVERAGE`, etc. |
| `autorun` | If `true`, automatically generates reports on new versions |

Specs are reusable — create once, run against multiple versions.

## Reporting jobs

Same async pattern as other BMS operations:
1. POST to run a report → `job_url`
2. Poll until `COMPLETE`
3. Retrieve results

## Version comparisons

Compare report results between two versions to see how estimates have changed.
Useful for tracking changes after model updates or re-estimation.

## Tips for web apps

- Use `autorun: true` for specs that should always be up-to-date
- Present comparison results as delta tables or change-over-time charts
- Report results are pre-computed server-side — much faster than computing client-side
- Consider letting users define custom specs through a form UI
- Report results are well-suited to tabular display (HTML tables, data grids)
