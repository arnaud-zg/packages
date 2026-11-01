import { describe, expect, it } from "vitest";

import { SAMPLE_TYPICAL_MINUTES } from "../../testing/sample";
import { actionsMinutes, billedMinutes, deployEstimate, minutesBudget } from "../budget";

describe("the GitHub Actions minutes a deploy spends", () => {
  // October 2026's usage summary for airmelon-studio, trimmed.
  const OCTOBER = [
    { sku: "actions_linux", grossQuantity: 216, unitType: "minutes" },
    { sku: "actions_storage", grossQuantity: 33.8, unitType: "gigabyte-hours" },
  ];

  it("given 216 Linux minutes on the Free plan, when read, then 1,784 of 2,000 are left", () => {
    expect(actionsMinutes("free", OCTOBER)).toEqual({ used: 216, included: 2000, left: 1784 });
  });

  it("given macOS minutes too, when read, then each counts ten times, as GitHub bills them", () => {
    const usage = [...OCTOBER, { sku: "actions_macos", grossQuantity: 10, unitType: "minutes" }];

    expect(actionsMinutes("free", usage)?.used).toBe(316);
  });

  it("given more used than included, when read, then none are left rather than a negative count", () => {
    const usage = [{ sku: "actions_linux", grossQuantity: 2300, unitType: "minutes" }];

    expect(actionsMinutes("free", usage)?.left).toBe(0);
  });

  it("given a plan with no known allowance, when read, then nothing is claimed", () => {
    expect(actionsMinutes("custom", OCTOBER)).toBeNull();
  });

  // Sunday 11 October 2026, 09:00 UTC: 10 days and 9 hours of a 31-day month gone.
  const OCTOBER_11 = new Date(Date.UTC(2026, 9, 11, 9));

  it("given 216 of 2,000 used on 11 October, when drawn, then a mostly full green bar and a pace well within the plan", () => {
    expect(minutesBudget({ used: 216, included: 2000, left: 1784 }, OCTOBER_11, 20)).toEqual({
      tone: "green",
      title: "GitHub Actions minutes · October 2026",
      bar: "██████████████████░░",
      amount: "1,784 of 2,000 left · 11% used",
      pace: "At this pace about 645 used by October 31, within the 2,000 included.",
      status: "● enough minutes this month",
      after: null,
    });
  });

  it("given this release costs 17 minutes, when drawn, then it says what is left after it and counts it in the pace", () => {
    const budget = minutesBudget({ used: 216, included: 2000, left: 1784 }, OCTOBER_11, 20, 17);

    expect(budget.after).toBe("This release: about 17 min on GitHub, about 1,767 left after it");
    expect(budget.pace).toBe(
      "At this pace, with this release, about 662 used by October 31, within the 2,000 included.",
    );
    expect(budget.status).toBe("● enough minutes this month");
  });

  it("given 100 left and a 13-minute release, when drawn, then the bar shows the release eating the rest and the status turns red", () => {
    const budget = minutesBudget({ used: 1900, included: 2000, left: 100 }, OCTOBER_11, 10, 13);

    expect(budget.bar).toBe("▒░░░░░░░░░");
    expect(budget.tone).toBe("red");
    expect(budget.status).toBe("● about to run out: deploy from this machine");
  });

  it("given most minutes left but a pace past the allowance, when drawn, then the status warns in yellow", () => {
    const budget = minutesBudget({ used: 700, included: 2000, left: 1300 }, OCTOBER_11, 20);

    expect(budget.tone).toBe("yellow");
    expect(budget.status).toBe("● running short this month");
  });

  it("given 1,500 used by 11 October, when drawn, then the pace says the plan runs out before the month ends", () => {
    const budget = minutesBudget({ used: 1500, included: 2000, left: 500 }, OCTOBER_11, 20);

    expect(budget.tone).toBe("yellow");
    expect(budget.pace).toBe(
      "At this pace about 4,482 used by October 31, over the 2,000 included: prefer this machine.",
    );
  });

  it("given under 100 left, when drawn, then it turns red", () => {
    expect(minutesBudget({ used: 1950, included: 2000, left: 50 }, OCTOBER_11, 20).tone).toBe(
      "red",
    );
  });
});

describe("what a release costs on GitHub Actions", () => {
  it("given the landing deploy's two jobs, when billed, then each rounds up to the minute", () => {
    expect(
      billedMinutes([
        { startedAt: "2026-10-11T08:23:37Z", completedAt: "2026-10-11T08:25:43Z" },
        { startedAt: "2026-10-11T08:25:46Z", completedAt: "2026-10-11T08:26:10Z" },
        { startedAt: "2026-10-11T08:27:00Z", completedAt: null },
      ]),
    ).toBe(4);
  });

  it("given api with no past run and landing measured at 4, when estimated, then the EAS build is left out", () => {
    expect(
      deployEstimate(
        [
          { app: "api", tag: "api@0.0.3", kind: "deploy" },
          { app: "landing", tag: "landing@0.1.2", kind: "deploy" },
          { app: "expo", tag: "expo@0.1.116", kind: "build" },
        ],
        { landing: [4, 5] },
        SAMPLE_TYPICAL_MINUTES,
      ),
    ).toEqual({
      total: 18,
      lines: [
        { app: "api", minutes: 13, measured: false },
        { app: "landing", minutes: 5, measured: true },
      ],
    });
  });
});
