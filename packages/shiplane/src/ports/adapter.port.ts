import type { z } from "zod";

import type { DecidedBy } from "../domain/scope";
import type { ReleaseUnit } from "../domain/unit";
import type { Detection, FolderView, Question, Requirement } from "./delivery.port";
import type { Shell } from "./shell.port";

/** What an adapter is given when the CLI creates its port: the repository and a shell. */
export interface AdapterContext {
  root: string;
  shell: Shell;
}

/**
 * An adapter as shiplane.config.ts holds it: a recipe, not a live object. The CLI creates the port
 * when a module runs, so reloading the config creates fresh ports.
 */
export interface Adapter<Port> {
  /** The provider: "git", "fly". */
  readonly name: string;
  readonly create: (context: AdapterContext) => Port;
}

/** An adapter of a port the release flow runs on: source control, code host, CI, versioning. */
export interface ServiceAdapter<Port> extends Adapter<Port> {
  /** Tools and sign-ins it needs, checked by `shiplane doctor`. */
  readonly requirements?: () => Requirement[];
}

/** An adapter of a delivery port: what its apps' unit files hold, and what `init` recognises. */
export interface DeliveryAdapter<Port extends { capability: string }> extends Adapter<Port> {
  /** The kind of delivery its port does, the one `init` picks a module by. */
  readonly capability: Port["capability"];
  /** The keys an app's unit file holds for it besides `module`. */
  readonly settings: z.ZodObject;
  /** Billed minutes of its CI deploy, used until a run has been measured. */
  readonly typicalMinutes?: number;
  /** Set when its own platform, not deploy records, knows what is live. */
  readonly decidedBy?: DecidedBy;
  /** What `init` recognises in a folder it ships. */
  readonly detect?: (folder: FolderView) => Detection | null;
  /** Settings `init` asks for that `detect` could not read. */
  readonly questions?: (
    folder: FolderView,
    found: Record<string, unknown>,
    repository: string,
  ) => Question[];
  /** Tools and sign-ins it needs for an app. */
  readonly requirements?: (unit: ReleaseUnit) => Requirement[];
}
