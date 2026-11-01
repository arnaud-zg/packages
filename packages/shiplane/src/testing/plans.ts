import type { PlannedChangeset, StatusPlan } from "../domain/changes";
import { nextPatch } from "../domain/versions";

const bump = (version: string, type: string) => {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  if (type === "major") return `${major + 1}.0.0`;
  if (type === "minor") return `${major}.${minor + 1}.0`;
  return nextPatch(version);
};

/**
 * What `changeset status` answers for these pending changesets, plus the ones a release adds, minus
 * the lines it holds back: every named package moves once, by its biggest bump.
 */
export const planFrom =
  (pending: PlannedChangeset[], versions: Record<string, string>) =>
  (added: PlannedChangeset[], held: PlannedChangeset[]): StatusPlan => {
    const heldLines = new Set(
      held.flatMap(({ id, releases }) => releases.map(({ name }) => `${id}:${name}`)),
    );
    const changesets = [...pending, ...added]
      .map((changeset) => ({
        ...changeset,
        releases: changeset.releases.filter(
          ({ name }) => !heldLines.has(`${changeset.id}:${name}`),
        ),
      }))
      .filter(({ releases }) => releases.length > 0);
    const order = ["major", "minor", "patch"];
    const names = [
      ...new Set(changesets.flatMap(({ releases }) => releases.map(({ name }) => name))),
    ];
    return {
      changesets,
      releases: names.map((name) => {
        const lines = changesets.filter(({ releases }) =>
          releases.some((line) => line.name === name),
        );
        const type =
          order.find((candidate) =>
            lines.some(({ releases }) =>
              releases.some((line) => line.name === name && line.type === candidate),
            ),
          ) ?? "patch";
        const oldVersion = versions[name] ?? "0.1.0";
        return {
          name,
          type: type as "patch",
          oldVersion,
          newVersion: bump(oldVersion, type),
          changesets: lines.map(({ id }) => id),
        };
      }),
    };
  };
