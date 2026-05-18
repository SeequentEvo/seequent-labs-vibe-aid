import type { SchemaDescriptor } from "./types";

/** Schema descriptor for the non-parametric continuous CDF object type. */
export const cdfDescriptor: SchemaDescriptor = {
  family: "non-parametric-continuous-cumulative-distribution",
  matches: (schemaId: string) =>
    schemaId.startsWith(
      "/objects/non-parametric-continuous-cumulative-distribution/1.",
    ),
  attachments: [
    {
      id: "cdf",
      jsonPath: ["cdf"],
      identityFrom: {
        path: ["values"],
        columns: ["values", "probabilities"],
      },
    },
  ],
  propertiesView: {
    path: [],
    label: "Distribution Parameters",
  },
};
