import type { Environment } from "./environment";

/** A name an app reads from its environment, as platforms store it: `SENTRY_DSN`. */
export type EnvVarName = string & { readonly brand: "EnvVarName" };

const ENV_VAR_NAME = /^[A-Z][A-Z0-9_]*$/;

export const isEnvVarName = (text: string): text is EnvVarName => ENV_VAR_NAME.test(text);

/** As a unit file writes it: one list for every environment, or `all` plus a list per environment. */
export type EnvToCheckInput =
  | readonly EnvVarName[]
  | ({ all?: readonly EnvVarName[] } & Partial<Record<Environment, readonly EnvVarName[]>>);

/** The names a deploy checks on the platform before it ships, per environment. */
export class EnvToCheck {
  readonly #all: readonly EnvVarName[];
  readonly #perEnvironment: Partial<Record<Environment, readonly EnvVarName[]>>;

  constructor(input: EnvToCheckInput) {
    if (isList(input)) {
      this.#all = input;
      this.#perEnvironment = {};
      return;
    }
    const { all = [], ...perEnvironment } = input;
    this.#all = all;
    this.#perEnvironment = perEnvironment;
  }

  /** `all`, then that environment's own names. */
  for(environment: Environment): ReadonlySet<EnvVarName> {
    return new Set([...this.#all, ...(this.#perEnvironment[environment] ?? [])]);
  }

  /** Names in `all` that an environment lists again. */
  listedTwice(): EnvVarName[] {
    const extras = Object.values(this.#perEnvironment).flat();
    return [...new Set(this.#all.filter((name) => extras.includes(name)))];
  }
}

const isList = (input: EnvToCheckInput): input is readonly EnvVarName[] => Array.isArray(input);

/** Names a deploy checks that the platform does not hold. */
export class UnsetEnvVars {
  readonly #names: readonly EnvVarName[];

  constructor(names: readonly EnvVarName[]) {
    this.#names = names;
  }

  isEmpty(): boolean {
    return this.#names.length === 0;
  }

  names(): readonly EnvVarName[] {
    return this.#names;
  }
}

export const findUnset = ({
  expected,
  setOnPlatform,
}: {
  expected: ReadonlySet<EnvVarName>;
  setOnPlatform: ReadonlySet<EnvVarName>;
}): UnsetEnvVars => new UnsetEnvVars([...expected].filter((name) => !setOnPlatform.has(name)));
