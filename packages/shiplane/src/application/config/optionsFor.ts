import type { Environment } from "../../domain/environment";
import type { ReleaseUnit } from "../../domain/unit";
import { isPerEnvValue, isRecord, REFERENCE, valueAt } from "./values";

const resolve = (value: unknown, env: Environment, units: readonly ReleaseUnit[]): unknown => {
  const picked = isPerEnvValue(value) ? value[env] : value;
  if (typeof picked === "string") {
    return picked.replace(REFERENCE, (_match, name: string, key: string) => {
      const other = units.find((unit) => unit.name === name);
      const resolved = other ? resolve(valueAt(other.options, key.split(".")), env, units) : "";
      return typeof resolved === "string" ? resolved : "";
    });
  }
  if (Array.isArray(picked)) return picked.map((item) => resolve(item, env, units));
  if (isRecord(picked)) {
    return Object.fromEntries(
      Object.entries(picked).map(([key, item]) => [key, resolve(item, env, units)]),
    );
  }
  return picked;
};

/** A unit's options for one environment: per-environment values picked, references filled in. */
export const optionsFor = (
  unit: ReleaseUnit,
  env: Environment,
  units: readonly ReleaseUnit[],
): Record<string, unknown> => {
  const resolved = resolve(unit.options, env, units);
  return isRecord(resolved) ? resolved : {};
};
