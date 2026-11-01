import type { Environment } from "../../domain/environment";
import { ENVIRONMENTS } from "../../domain/environment";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A map keyed by exactly the environments: one of its values is picked per environment. */
export const isPerEnvValue = (value: unknown): value is Record<Environment, unknown> =>
  isRecord(value) &&
  Object.keys(value).length === ENVIRONMENTS.length &&
  ENVIRONMENTS.every((environment) => environment in value);

/** `${units.<name>.<key>}`, where key may be dotted. */
export const REFERENCE = /\$\{units\.([\w-]+)\.([\w.-]+)\}/g;

export interface Reference {
  unit: string;
  key: string;
  /** Where it is written in the unit file. */
  at: string[];
}

export const referencesIn = (value: unknown, at: string[] = []): Reference[] => {
  if (typeof value === "string") {
    return [...value.matchAll(REFERENCE)].map(([, unit = "", key = ""]) => ({ unit, key, at }));
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => referencesIn(item, [...at, String(index)]));
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, item]) => referencesIn(item, [...at, key]));
  }
  return [];
};

export const valueAt = (value: unknown, at: readonly string[]): unknown =>
  at.reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), value);
