import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";

import { testContext, testUnit } from "../../testing/releaseContext";
import { planShips } from "../planShips";

describe("the order a plan shows", () => {
  it("given admin reads the api url and expo reads nothing, when the plan prints, then its header numbers the release order, marks the Latest and says what each app reads", async () => {
    const world = testContext({
      units: [
        testUnit("api", { options: { url: "https://api.example.com" } }),
        testUnit("admin", {
          options: { build: { env: { API_URL: "${units.api.url}" } } },
          after: ["api"],
        }),
        testUnit("expo"),
      ],
    });

    await planShips(world.context, "preview");

    expect(stripVTControlCharacters(world.output.text)).toContain(
      "Order  1 api · Latest → 2 admin (reads api.url) → 3 expo",
    );
  });
});
