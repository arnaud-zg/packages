import { z } from "zod";

import type { Environment } from "../../domain/environment";

/** A value that is the same everywhere, or written once per environment. */
export const perEnv = <Value extends z.ZodType>(value: Value) =>
  z.union([value, z.strictObject({ preview: value, production: value })]);

export type PerEnv<Value> = Value | Record<Environment, Value>;
