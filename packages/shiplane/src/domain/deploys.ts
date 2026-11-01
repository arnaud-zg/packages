import type { Environment } from "./environment";

/** The run name the deploy workflows set, so the Actions list says which version went where. */
export const deployRunTitle = (tag: string, environment: Environment) =>
  `Deploy ${tag} to ${environment}`;

export type DeployState = "none" | "running" | "done";

// INACTIVE: a later deploy to the same environment superseded a successful one.
const DEPLOYED = new Set(["SUCCESS", "ACTIVE", "INACTIVE"]);
const DEPLOYING = new Set(["IN_PROGRESS", "QUEUED", "PENDING", "WAITING"]);

/** One version on one environment, from the states of its GitHub deployments. */
export const deployState = (states: string[]): DeployState => {
  if (states.some((state) => DEPLOYED.has(state))) return "done";
  return states.some((state) => DEPLOYING.has(state)) ? "running" : "none";
};

export type WebShip = "deploy" | "deploying" | "shipped" | "not-on-preview";

/** What one web app's tagged version still needs on an environment. */
export const webShip = ({
  environment,
  run,
  onPreview,
}: {
  environment: Environment;
  /** Its deploy on that environment: none yet, queued or waiting on the approval gate, or done. */
  run: DeployState;
  onPreview: boolean;
}): WebShip => {
  if (run === "done") return "shipped";
  if (run === "running") return "deploying";
  if (environment === "production" && !onPreview) return "not-on-preview";
  return "deploy";
};

/** Whether a diff only moves version files: the code is still the code a release named. */
export const onlyVersionFiles = (files: string[], versionFiles: ReadonlySet<string>) =>
  files.every((file) => versionFiles.has(file));

export type DeployPath = "github" | "local";

/** How this run deploys: --via when given, GitHub Actions under --yes, otherwise asked (null). */
export const deployVia = ({ via, yes }: { via: DeployPath | undefined; yes: boolean }) =>
  via ?? (yes ? ("github" as const) : null);

export interface ShipItem {
  /** The unit's name. */
  app: string;
  tag: string;
  /** An EAS build, an over-the-air update, or a web deploy. */
  kind: "build" | "update" | "deploy";
}

/** An EAS build runs on EAS whichever way: only updates and web deploys have a path to pick. */
export const needsPath = (items: ShipItem[]) => items.some(({ kind }) => kind !== "build");

/** This machine builds its checkout, so it ships only while that is the tagged code. */
export const shipsFrom = (
  path: DeployPath,
  { sinceTagOnlyVersionFiles }: { sinceTagOnlyVersionFiles: boolean },
) => path === "github" || sinceTagOnlyVersionFiles;
