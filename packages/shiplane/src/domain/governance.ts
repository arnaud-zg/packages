import type { Environment } from "./environment";

export type ReleaseIntent = "build" | "update" | "submit";

export interface GitPosition {
  branch: string;
  head: string;
  /** origin/main after a fetch. */
  originMain: string;
}

export type SourceResult = { allowed: true } | { allowed: false; why: "not-main" | "behind-main" };

/**
 * A binary ships what it was built from, so builds start from main as it is on origin. Preview
 * updates may come from a branch for testers; production updates only from main.
 */
export const releaseSource = (
  intent: ReleaseIntent,
  channel: Environment,
  { branch, head, originMain }: GitPosition,
): SourceResult => {
  const needsMain = intent === "build" || (intent === "update" && channel === "production");
  if (!needsMain) return { allowed: true };
  if (branch !== "main") return { allowed: false, why: "not-main" };
  if (head !== originMain) return { allowed: false, why: "behind-main" };
  return { allowed: true };
};

/** Where `pnpm shiplane` goes: --channel when given, preview under --yes or with no terminal, else asked. */
export const channelChoice = ({
  flag,
  yes,
  interactive,
}: {
  flag: Environment | undefined;
  yes: boolean;
  interactive: boolean;
}): Environment | null => flag ?? (yes || !interactive ? "preview" : null);

/** Production never runs a step nobody confirmed. */
export const yesAllowed = (channel: Environment, yes: boolean) =>
  !(yes && channel === "production");
