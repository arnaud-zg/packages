/**
 * Ready-made templates for `thanks`. Each is a plain string: use one as it is, extend it, or copy it
 * and edit. Placeholders: `{changes}` the release's changes, `{contributors}` `@ada and @lin`,
 * `{list}` one `- @login` per line, `{avatars}` a row of GitHub avatars.
 */
export const presets = {
  /** `🙏 Thanks to @ada and @lin for this release!` under the changes. */
  sentence: "{changes}\n\n🙏 Thanks to {contributors} for this release!",
  /** A `### Contributors` heading under the changes, then `- @ada`, `- @lin`. */
  list: "{changes}\n\n### Contributors\n\n{list}",
  /** A `### Contributors` heading under the changes, then a row of linked avatars. */
  avatars: "{changes}\n\n### Contributors\n\n{avatars}",
  /** The changes only: no one is thanked. */
  none: "{changes}",
} as const;

interface Contributor {
  login: string;
  url: string;
}

// `Thanks [@a](url), [@b](url)!` as @changesets/changelog-github writes it, after the links.
const INLINE = / Thanks ((?:\[@[^\]]+\]\([^)]+\)(?:, )?)+)!/;
const USER = /\[@([^\]]+)\]\(([^)]+)\)/g;

const linked = ({ login, url }: Contributor) => `[@${login}](${url})`;

/** `a`, `a and b`, `a, b and c`. */
const joined = (contributors: readonly Contributor[]) => {
  const links = contributors.map(linked);
  return links.length < 2 ? links.join("") : `${links.slice(0, -1).join(", ")} and ${links.at(-1)}`;
};

const PLACEHOLDERS: Record<string, (contributors: readonly Contributor[]) => string> = {
  "{contributors}": joined,
  "{list}": (contributors) => contributors.map((person) => `- ${linked(person)}`).join("\n"),
  "{avatars}": (contributors) =>
    contributors
      .map(
        ({ login, url }) =>
          `<a href="${url}"><img src="${url}.png?size=64" width="32" height="32" alt="@${login}"></a>`,
      )
      .join(" "),
};

/** The section's lines without their inline thanks, and who they thanked, each once. */
const gather = (section: string) => {
  const contributors = new Map<string, Contributor>();
  const lines = section.split("\n").map((line) => {
    const match = INLINE.exec(line);
    if (!match) return line;
    for (const [, login = "", url = ""] of (match[1] ?? "").matchAll(USER)) {
      if (!contributors.has(login)) contributors.set(login, { login, url });
    }
    return line.replace(INLINE, "");
  });
  return { text: lines.join("\n"), contributors: [...contributors.values()] };
};

/**
 * Rewrites the newest section of a changelog, the one a release just wrote, by `template`. A
 * template without `{changes}` goes under the changes. A section that thanks no one is left as is.
 */
export const placeThanks = (changelog: string, template: string): string => {
  const start = changelog.search(/^## /m);
  if (start === -1) return changelog;
  const headingEnd = changelog.indexOf("\n", start);
  if (headingEnd === -1) return changelog;
  const nextHeading = changelog.slice(headingEnd).search(/^## /m);
  const end = nextHeading === -1 ? changelog.length : headingEnd + nextHeading;

  const { text, contributors } = gather(changelog.slice(headingEnd + 1, end));
  if (contributors.length === 0) return changelog;
  const full = template.includes("{changes}") ? template : `{changes}\n\n${template}`;
  const section = Object.entries(PLACEHOLDERS)
    .reduce((out, [key, render]) => out.replaceAll(key, () => render(contributors)), full)
    .replaceAll("{changes}", () => text.trim())
    .trim();
  const rest = changelog.slice(end);
  return `${changelog.slice(0, headingEnd + 1)}\n${section}\n${rest ? `\n${rest}` : ""}`;
};
