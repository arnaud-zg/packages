import type { ReleaseUnit } from "../domain/unit";
import { referencesIn } from "./config/values";

/** `admin (reads api.url)`: an app, with the values of other apps it reads. */
const withReads = ({ name, options }: ReleaseUnit) => {
  const reads = [
    ...new Set(
      referencesIn(options)
        .filter(({ unit }) => unit !== name)
        .map(({ unit, key }) => `${unit}.${key}`),
    ),
  ];
  return reads.length > 0 ? `${name} (reads ${reads.join(", ")})` : name;
};

/** `1 expo · Latest → 2 api → 3 admin (reads api.url)`: the apps numbered in release order. */
export const releaseOrder = (units: readonly ReleaseUnit[]) =>
  units
    .map((unit, index) => `${index + 1} ${withReads(unit)}${index === 0 ? " · Latest" : ""}`)
    .join(" → ");
