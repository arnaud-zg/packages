import type { z } from "zod";

import type { AppBump } from "../domain/changes";
import type { Environment } from "../domain/environment";
import type { Approval } from "../domain/releasePr";
import type { DecidedBy } from "../domain/scope";
import type { ReleaseUnit } from "../domain/unit";
import type { Adapter, ServiceAdapter } from "../ports/adapter.port";
import type { CiPipelinePort } from "../ports/ci-pipeline.port";
import type { CodeHostPort } from "../ports/code-host.port";
import type {
  DecideContext,
  Decision,
  Health,
  Job,
  JobInput,
  Requirement,
  VersionContribution,
} from "../ports/delivery.port";
import type { SourceControlPort } from "../ports/source-control.port";
import type { VersioningPort } from "../ports/versioning.port";

/** What a module's per-app stages are told: the app, its tag, its settings for that environment. */
export type AppInput = JobInput<Record<string, unknown>>;

/** Where a tag lands, as a person reads it, and the jobs that ship it there. */
export interface ShipPlan {
  where: string;
  jobs: Job[];
}

/** An app a ship just triggered on an environment. */
export interface Shipped {
  unit: ReleaseUnit;
  tag: string;
  environment: Environment;
}

/** One thing done once apps ship, as data: a ship runs it, a plan only lists it. */
export interface FollowUp {
  label: string;
  run: () => Promise<void>;
}

/** Creates the port an adapter gives, for this repository. */
export type Open = <Port>(adapter: Adapter<Port>) => Port;

/** What a feature is told once apps ship. */
export interface AfterShipContext {
  /** Subjects of the commits after `from` up to `to` whose files can reach what an app ships. */
  subjectsReaching: (unit: ReleaseUnit, from: string, to: string) => Promise<string[]>;
  open: Open;
  /** How a tag names a version, such as `{name}@{version}`. */
  tagFormat: string;
}

/**
 * What gets released: the apps whose unit file names it. Every stage is optional; the release flow
 * owns their order, and the order of `modules` is the release order.
 */
export interface ReleaseModule {
  readonly type: "module";
  /** What an app's unit file names: its kind, or a name the config gives it. */
  readonly name: string;
  /** "backend-service", "mobile-app". */
  readonly kind: string;
  /** The provider its apps ship with, as output names it: "fly". */
  readonly provider: string;
  /** What its apps' unit files hold besides `module`. */
  readonly settings: z.ZodObject;
  /** The adapters it was given. */
  readonly adapters: readonly Adapter<unknown>[];
  /** Set when its own platform, not deploy records, knows what is live. */
  readonly decidedBy?: DecidedBy;
  /** Set when nothing deploys its apps: a release versions and tags them, nothing more. */
  readonly releaseOnly?: boolean;
  /** Billed minutes of a CI deploy, used until a run has been measured. */
  readonly typicalMinutes?: number;
  /** Tools and sign-ins it needs, given the apps that name it. */
  readonly requirements?: (apps: readonly ReleaseUnit[]) => Requirement[];
  /** Files a release may change after a tag without changing what ships. Relative to the root. */
  readonly versionFiles?: (
    unit: ReleaseUnit,
    units: readonly ReleaseUnit[],
    open: Open,
  ) => string[];
  /** Adds to the release PR, given the app's bump in it when there is one. */
  readonly version?: (
    context: DecideContext,
    input: AppInput & { bump: AppBump | undefined; chosen?: string },
  ) => Promise<VersionContribution>;
  /** The tagged version runs on the environment, read from its platform; else deploy records say. */
  readonly live?: (context: DecideContext, input: AppInput) => Promise<boolean>;
  /** Decides what an app needs; without it, deploy records decide and `ship` runs. */
  readonly decide?: (context: DecideContext, input: AppInput) => Promise<Decision>;
  /** Where a tag lands and the jobs that ship it: data, never run by the module itself. */
  readonly ship: (context: DecideContext, input: AppInput) => ShipPlan;
  /** How the tagged version does on preview, read before promoting it. Null when nothing says. */
  readonly health?: (context: DecideContext, input: AppInput) => Promise<Health | null>;
  /** What `status --json` shows for an app, read from its platform. */
  readonly inspect?: (context: DecideContext, input: AppInput) => Promise<unknown>;
}

/** What happens around a release, after the ship, such as telling issues what shipped. */
export interface Feature {
  readonly type: "feature";
  readonly name: string;
  /** The adapters it was given, for doctor to check. */
  readonly adapters: readonly Adapter<unknown>[];
  readonly requirements?: () => Requirement[];
  /** What to do once apps ship: it only reads, a ship runs each one, a plan lists them. */
  readonly afterShip: (
    context: AfterShipContext,
    shipped: readonly Shipped[],
  ) => Promise<FollowUp[]>;
}

/** How the release itself runs: versions, tags, the release PR, GitHub releases, CI. */
export interface ReleaseFlow {
  readonly type: "flow";
  readonly sourceControl: ServiceAdapter<SourceControlPort>;
  readonly codeHost: ServiceAdapter<CodeHostPort>;
  readonly ciPipeline: ServiceAdapter<CiPipelinePort>;
  readonly versioning: ServiceAdapter<VersioningPort>;
  /** "required": someone else approves the release PR, so shiplane never merges it itself. */
  readonly approval: Approval;
}
