import type { AppBump } from "../domain/changes";
import type { ReleaseUnit } from "../domain/unit";
import type {
  DecideContext,
  Decision,
  Delivery,
  Health,
  JobInput,
  VersionContribution,
} from "./delivery.port";

/**
 * Ships a mobile app to the stores or over the air: EAS today. Its own platform knows what is live,
 * decides between a binary and an update, and reports how a version does.
 */
export interface MobileDistributionPort<
  Options = Record<string, unknown>,
> extends Delivery<Options> {
  readonly capability: "mobile-distribution";
  /** A store build, an over-the-air update, a choice for the person, or nothing. */
  decide(context: DecideContext, input: JobInput<Options>): Promise<Decision>;
  /**
   * Files a release may change after the tag without changing what ships, such as the binary's
   * version file. Relative to the root.
   */
  versionFiles?(unit: ReleaseUnit, units: readonly ReleaseUnit[]): string[];
  /** Adds to the release PR, given the app's bump in it when there is one. */
  beforeVersion?(
    context: DecideContext,
    input: JobInput<Options> & {
      bump: AppBump | undefined;
      /** The person's answer to its `choice`, once asked. */
      chosen?: string;
    },
  ): Promise<VersionContribution>;
  /** What `status --json` shows for the app, read from its platform. */
  inspect?(context: DecideContext, input: JobInput<Options>): Promise<unknown>;
  /** How the tagged version does on preview, read before promoting it. Null when nothing says. */
  health?(context: DecideContext, input: JobInput<Options>): Promise<Health | null>;
}
