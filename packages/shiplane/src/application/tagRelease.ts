import type { ReleaseTag, TagCandidate } from "../domain/tags";
import type { ReleaseContext } from "./context";
import type { Step } from "./steps";
import { changelogSection, firstRelease, releaseTags } from "../domain/tags";
import { MANIFEST, namedUnits } from "./readScope";
import { confirm, paint } from "./say";
import { runSteps } from "./steps";

/** The tags and release notes still missing for the versions merged release PRs brought. */
export const missingTags = async (context: ReleaseContext): Promise<ReleaseTag[]> => {
  const { release, services } = context;
  const [tags, notes, named] = await Promise.all([
    services.sourceControl.tags(),
    services.codeHost.releasedTags().catch(() => new Set<string>()),
    namedUnits(context),
  ]);
  const candidates = await Promise.all(
    release.units.map(async ({ name, dir, version }): Promise<TagCandidate[]> => {
      const commit = await services.sourceControl.versionCommit(dir, MANIFEST, version);
      // A unit a changeset names releases through its release PR, never as it stands.
      const first = !named.has(name) && firstRelease(name, version, tags, release.tagFormat);
      return commit ? [{ app: name, version, commit, first }] : [];
    }),
  );
  return releaseTags(candidates.flat(), tags, notes, release.tagFormat);
};

const notesFor = async ({ release, services }: ReleaseContext, tag: ReleaseTag) => {
  const unit = release.units.find(({ name }) => name === tag.app);
  const changelog = unit
    ? await services.sourceControl.fileAt(tag.sha, services.versioning.changelogFile(unit.dir))
    : null;
  return changelogSection(changelog ?? "", tag.version);
};

/** Tags each version on the commit that brought it, pushes the tags, publishes their notes. */
export const tagRelease = async (context: ReleaseContext, tags: readonly ReleaseTag[]) => {
  if (tags.length === 0) return true;
  const { output, release, services } = context;
  const names = tags.map(({ tag }) => tag).join(", ");
  output.line(`  ${paint("bold", "Tags and release notes")}  ${paint("dim", names)}`);
  if (!(await confirm(context, `Tag ${names} and publish their release notes?`, true))) {
    output.line(paint("dim", "Nothing ran."));
    return false;
  }
  const created = tags.filter(({ needsTag }) => needsTag);
  const steps: Step[] = [
    ...created.map((tag) => ({
      label: `tag ${tag.tag} on ${tag.sha.slice(0, 7)}`,
      run: async () =>
        services.sourceControl.tag(
          tag.tag,
          tag.sha,
          `${tag.tag}\n\n${await notesFor(context, tag)}`,
        ),
      // Kept here unpushed, the next run would take it for done and never push it.
      undo: {
        label: `delete the tag ${tag.tag} here`,
        run: () => services.sourceControl.deleteTag(tag.tag),
        byHand: () => [`git tag --delete ${tag.tag}`],
      },
    })),
    ...(created.length > 0
      ? [
          {
            label: "push the tags",
            run: () => services.sourceControl.pushTags(created.map(({ tag }) => tag)),
            // Once on origin, a tag is the release; the next run fetches it and publishes its notes.
            kept: {
              label: `${created.map(({ tag }) => tag).join(", ")} ${created.length > 1 ? "stay" : "stays"} on origin`,
              byHand: () => ["shiplane tag"],
            },
          },
        ]
      : []),
    ...tags
      .filter(({ needsNotes }) => needsNotes)
      .map((tag) => ({
        label: `release notes for ${tag.tag}`,
        run: async () =>
          services.codeHost.createRelease(
            tag.tag,
            await notesFor(context, tag),
            tag.app === release.units[0]?.name,
          ),
      })),
  ];
  return runSteps(context, steps);
};
