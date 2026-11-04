import type { BumpLevel, PlannedChangeset, StatusPlan } from "../domain/changes";
import { nextVersion } from "../domain/versions";

/**
 * What `changeset status` answers for these pending changesets, plus the ones a release adds, minus
 * the lines it holds back: every named package moves once, by its biggest bump, up to `ceiling`.
 */
export const planFrom =
  (pending: PlannedChangeset[], versions: Record<string, string>) =>
  (added: PlannedChangeset[], held: PlannedChangeset[], ceiling?: BumpLevel): StatusPlan => {
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
    const order: BumpLevel[] = ["major", "minor", "patch"];
    const capped = ceiling ? order.slice(order.indexOf(ceiling)) : order;
    const names = [
      ...new Set(changesets.flatMap(({ releases }) => releases.map(({ name }) => name))),
    ];
    return {
      changesets,
      releases: names.map((name) => {
        const lines = changesets.filter(({ releases }) =>
          releases.some((line) => line.name === name),
        );
        const named =
          order.find((candidate) =>
            lines.some(({ releases }) =>
              releases.some((line) => line.name === name && line.type === candidate),
            ),
          ) ?? "patch";
        const type = capped.includes(named) ? named : (ceiling ?? named);
        const oldVersion = versions[name] ?? "0.1.0";
        return {
          name,
          type,
          oldVersion,
          newVersion: nextVersion(oldVersion, type),
          changesets: lines.map(({ id }) => id),
        };
      }),
    };
  };
