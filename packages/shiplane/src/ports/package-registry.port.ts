import type { DecideContext, Decision, Delivery, JobInput } from "./delivery.port";

/** Publishes a package and points a dist-tag at it: npm today. */
export interface PackageRegistryPort<Options = Record<string, unknown>> extends Delivery<Options> {
  readonly capability: "package-registry";
  /** Publish, move a tag, or nothing: the registry, not GitHub Deployments, knows what is out. */
  decide(context: DecideContext, input: JobInput<Options>): Promise<Decision>;
  /** The version is out on the environment: published, and its dist-tag points at it. */
  live(context: DecideContext, input: JobInput<Options>): Promise<boolean>;
}
