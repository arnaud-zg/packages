import type { BumpLevel, PlannedChangeset, StatusPlan } from "../../../domain/changes";
import type { ServiceAdapter } from "../../../ports/adapter.port";
import type { VersioningPort } from "../../../ports/versioning.port";

/** A changeset as its file reads: one `"package": bump` line each, then the summary. */
const changesetText = ({ releases, summary }: PlannedChangeset) =>
  `---\n${releases.map(({ name, type }) => `"${name}": ${type}`).join("\n")}\n---\n\n${summary}\n`;

type PlanOf = (
  added: PlannedChangeset[],
  held: PlannedChangeset[],
  ceiling?: BumpLevel,
) => StatusPlan;

interface VersioningState {
  pending: { id: string; text: string }[];
  /** What `changeset status` would answer, given what the release adds, holds back and caps. */
  plan: PlanOf;
  dependencies: Record<string, string[]>;
  folders: Record<string, string>;
}

/** Versioning held in memory: seed the pending changes and the plan, read back what it received. */
export class VersioningFake implements VersioningPort {
  private state: VersioningState = {
    pending: [],
    plan: () => ({ changesets: [], releases: [] }),
    dependencies: {},
    folders: {},
  };

  readonly applied: {
    added: PlannedChangeset[];
    held: PlannedChangeset[];
    ceiling?: BumpLevel;
  }[] = [];
  readonly written: PlannedChangeset[] = [];

  seed(state: Partial<VersioningState>) {
    this.state = { ...this.state, ...state };
    return this;
  }

  pending = () => Promise.resolve(this.state.pending);
  plan = (added: PlannedChangeset[], held: PlannedChangeset[], ceiling?: BumpLevel) =>
    Promise.resolve(this.state.plan(added, held, ceiling));
  dependencies = () => Promise.resolve(this.state.dependencies);
  folders = () => Promise.resolve(this.state.folders);

  apply = (added: PlannedChangeset[], held: PlannedChangeset[], ceiling?: BumpLevel) => {
    this.applied.push({ added, held, ceiling });
    return Promise.resolve();
  };

  write = (changeset: PlannedChangeset) => {
    this.written.push(changeset);
    this.state.pending = [
      ...this.state.pending.filter(({ id }) => id !== changeset.id),
      { id: changeset.id, text: changesetText(changeset) },
    ];
    return Promise.resolve();
  };

  nextChange = "pnpm changeset";

  changesetFile = (id: string) => `.changeset/${id}.md`;
  changelogFile = (dir: string) => `${dir}/CHANGELOG.md`;
}

/** The Fake as a config holds an adapter; `.fake` is what a test seeds and reads. */
export const versioningFake = (
  fake = new VersioningFake(),
): ServiceAdapter<VersioningPort> & { fake: VersioningFake } => ({
  name: "fake",
  create: () => fake,
  fake,
});
