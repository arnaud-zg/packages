/** Someone a GitHub changelog thanks, as `@changesets/changelog-github` links them. */
export interface Contributor {
  /** The GitHub login, without `@`. */
  login: string;
  /** Their GitHub profile. */
  url: string;
}

/** A built-in look for the contributors block. */
export type ThanksStyle = "sentence" | "list" | "avatars";

/**
 * Where a release's contributors are thanked. Leave it unset to keep changesets' own line-by-line
 * thanks; `false` drops them; an object gathers them into one block at the top or the bottom.
 */
export type ThanksOption =
  | false
  | {
      /** Where the block goes in the release's section. */
      at: "top" | "bottom";
      /**
       * A built-in style (`"sentence"` by default), your own text with `{contributors}` and
       * `{count}`, or a function of the contributors.
       */
      style?: ThanksStyle | (string & {}) | ((contributors: readonly Contributor[]) => string);
    };

// `Thanks [@a](url), [@b](url)!` as @changesets/changelog-github writes it, after the links.
const INLINE = / Thanks ((?:\[@[^\]]+\]\([^)]+\)(?:, )?)+)!/;
const USER = /\[@([^\]]+)\]\(([^)]+)\)/g;

const linked = ({ login, url }: Contributor) => `[@${login}](${url})`;

/** `a`, `a and b`, `a, b and c`. */
const joined = (contributors: readonly Contributor[]) => {
  const links = contributors.map(linked);
  return links.length < 2 ? links.join("") : `${links.slice(0, -1).join(", ")} and ${links.at(-1)}`;
};

const STYLES: Record<ThanksStyle, (contributors: readonly Contributor[]) => string> = {
  sentence: (contributors) => `🙏 Thanks to ${joined(contributors)} for this release!`,
  list: (contributors) =>
    `### Contributors\n\n${contributors.map((contributor) => `- ${linked(contributor)}`).join("\n")}`,
  avatars: (contributors) =>
    `### Contributors\n\n${contributors
      .map(
        ({ login, url }) =>
          `<a href="${url}"><img src="${url}.png?size=64" width="32" height="32" alt="@${login}" title="@${login}"></a>`,
      )
      .join(" ")}`,
};

const render = (style: NonNullable<Exclude<ThanksOption, false>["style"]>, all: Contributor[]) => {
  if (typeof style === "function") return style(all);
  if (style in STYLES) return STYLES[style as ThanksStyle](all);
  return style.replaceAll("{contributors}", joined(all)).replaceAll("{count}", String(all.length));
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
 * Rewrites the newest section of a changelog, the one a release just wrote, to thank its
 * contributors as `option` says. A section that thanks no one is left as it is.
 */
export const placeThanks = (changelog: string, option: ThanksOption | undefined): string => {
  if (option === undefined) return changelog;
  const start = changelog.search(/^## /m);
  if (start === -1) return changelog;
  const headingEnd = changelog.indexOf("\n", start);
  if (headingEnd === -1) return changelog;
  const nextHeading = changelog.slice(headingEnd).search(/^## /m);
  const end = nextHeading === -1 ? changelog.length : headingEnd + nextHeading;

  const { text, contributors } = gather(changelog.slice(headingEnd + 1, end));
  if (contributors.length === 0) return changelog;
  const body = text.trim();
  const block = option === false ? "" : render(option.style ?? "sentence", contributors).trim();
  const section = !block
    ? body
    : option !== false && option.at === "top"
      ? `${block}\n\n${body}`
      : `${body}\n\n${block}`;
  const rest = changelog.slice(end);
  return `${changelog.slice(0, headingEnd + 1)}\n${section}\n${rest ? `\n${rest}` : ""}`;
};
