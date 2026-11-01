import { describe, expect, it } from "vitest";

import type { StatusPlan } from "../changes";
import { SAMPLE_UNITS } from "../../testing/sample";
import { draggedUnits, releasedTogether } from "../companions";

const DEPENDENCIES = {
  "@acme/expo": ["@acme/app", "@acme/assets"],
  "@acme/api": ["@acme/data-translator", "@acme/es-core"],
  "@acme/admin": ["@acme/assets", "@acme/es-core"],
  "@acme/data-translator": ["@acme/assets"],
  "@acme/landing": [],
};

// What changeset status answers when expo's translations change: assets moves, its users follow.
const TRANSLATIONS: StatusPlan = {
  changesets: [
    {
      id: "inbox-copy",
      summary: "the mascot's inbox says when a result is new.",
      releases: [
        { name: "@acme/expo", type: "patch" },
        { name: "@acme/assets", type: "patch" },
      ],
    },
  ],
  releases: [
    {
      name: "@acme/expo",
      type: "patch",
      oldVersion: "0.2.1",
      newVersion: "0.2.2",
      changesets: ["inbox-copy"],
    },
    {
      name: "@acme/assets",
      type: "patch",
      oldVersion: "0.1.0",
      newVersion: "0.1.1",
      changesets: ["inbox-copy"],
    },
    {
      name: "@acme/data-translator",
      type: "patch",
      oldVersion: "0.1.1",
      newVersion: "0.1.2",
      changesets: [],
    },
    { name: "@acme/api", type: "patch", oldVersion: "0.0.7", newVersion: "0.0.8", changesets: [] },
    {
      name: "@acme/admin",
      type: "patch",
      oldVersion: "0.1.4",
      newVersion: "0.1.5",
      changesets: [],
    },
  ],
};

describe("apps a preview release takes along without being picked", () => {
  it("given only expo picked and its changes move assets, when the release is planned, then api and admin go too, each with the package that drags it", () => {
    expect(draggedUnits(TRANSLATIONS, DEPENDENCIES, SAMPLE_UNITS, new Set(["expo"]))).toEqual([
      {
        app: "api",
        version: "0.0.8",
        with: ["expo"],
        why: "uses @acme/data-translator → @acme/assets, which expo's changes move",
      },
      {
        app: "admin",
        version: "0.1.5",
        with: ["expo"],
        why: "uses @acme/assets, which expo's changes move",
      },
    ]);
  });

  it("given every moving app picked, when the release is planned, then nothing goes along unasked", () => {
    expect(
      draggedUnits(TRANSLATIONS, DEPENDENCIES, SAMPLE_UNITS, new Set(["expo", "api", "admin"])),
    ).toEqual([]);
  });
});

const notes = (...lines: string[]) => `### Patch Changes\n\n${lines.join("\n")}`;

describe("apps preview ran together, offered when promoting to production", () => {
  const expo = {
    app: "expo",
    version: "0.3.0",
    notes: notes(
      "- 03acc29: An identification you left running is pushed to your phone when it ends, even",
      "  with the app closed.",
      "- 9f1e2d3: the mascot's inbox says when a result is new.",
    ),
  };

  it("given api carries one of expo's changes, when expo is promoted, then api is offered with that change", () => {
    const api = {
      app: "api",
      version: "0.0.8",
      notes: notes(
        "- 03acc29: An identification you left running is pushed to your phone when it ends, even",
        "  with the app closed.",
      ),
    };

    expect(releasedTogether([expo], [api])).toEqual([
      {
        app: "api",
        version: "0.0.8",
        with: ["expo"],
        why: "went to preview with expo 0.3.0 for: An identification you left running is pushed to your phone when it ends, even…",
      },
    ]);
  });

  it("given admin only moved for a package one of expo's changes moved, when expo is promoted, then admin is offered too", () => {
    const admin = {
      app: "admin",
      version: "0.1.5",
      notes: notes("- Updated dependencies [9f1e2d3]", "  - @acme/assets@0.1.1"),
    };

    expect(releasedTogether([expo], [admin])).toEqual([
      {
        app: "admin",
        version: "0.1.5",
        with: ["expo"],
        why: "went to preview with expo 0.3.0 for: the mascot's inbox says when a result is new.",
      },
    ]);
  });

  it("given expo and admin both only moved for a package, when expo is promoted, then admin is offered with that package", () => {
    const expoMoved = {
      app: "expo",
      version: "0.2.0",
      notes: notes("- Updated dependencies [3c58e56]", "  - @acme/es-core@0.1.1"),
    };
    const admin = {
      app: "admin",
      version: "0.1.4",
      notes: notes(
        "- Updated dependencies [3c58e56]",
        "  - @acme/es-core@0.1.1",
        "  - @acme/plant-hooks@0.1.1",
      ),
    };

    expect(releasedTogether([expoMoved], [admin])).toEqual([
      {
        app: "admin",
        version: "0.1.4",
        with: ["expo"],
        why: "went to preview with expo 0.2.0: both use @acme/es-core, which moved",
      },
    ]);
  });

  it("given landing shares no change with expo, when expo is promoted, then landing is not offered", () => {
    const landing = {
      app: "landing",
      version: "0.1.3",
      notes: notes("- 5b6c7d8: Search results show the store links."),
    };

    expect(releasedTogether([expo], [landing])).toEqual([]);
  });
});
