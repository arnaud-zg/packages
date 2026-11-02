import { describe, expect, it } from "vitest";

import { drawingOf, MOODS, resolveDisplay } from "../display";

const terminal = { tty: true, ci: false, noMotion: false };

describe("Feature: bring your own mascot", () => {
  it("given frames for some moods, when a mood is drawn, then it uses yours and the hedgehog's for the rest", () => {
    const cat = drawingOf({ happy: ["(=^▽^=) ✦"] });

    expect(cat.draw({ mood: "happy", tick: 0, label: "" }).trimEnd()).toBe("(=^▽^=) ✦");
    expect(cat.draw({ mood: "worried", tick: 0, label: "" })).toContain("(°ω°)");
  });

  it("given frames of different lengths, when drawn, then every frame is padded to one width", () => {
    const mascot = drawingOf({ working: ["o", "ooo"], happy: ["\\o/"] });
    const widths = new Set(
      MOODS.flatMap((mood) =>
        [0, 1, 2, 3].map((tick) => [...mascot.draw({ mood, tick, label: "" })].length),
      ),
    );

    expect([...widths]).toEqual([mascot.width]);
  });

  it("given several frames, when it animates, then it loops through them by tick", () => {
    const blink = drawingOf({ waiting: ["(o.o)", "(-.-)"] });

    expect(blink.frames("waiting")).toBe(2);
    expect(blink.draw({ mood: "waiting", tick: 3, label: "" })).toContain("(-.-)");
  });

  it("given an empty list for a mood, when drawn, then the hedgehog's frames stand in", () => {
    expect(drawingOf({ happy: [] }).draw({ mood: "happy", tick: 0, label: "" })).toContain("(^ω^)");
  });

  it("given a function, when a moment is drawn, then it reacts to the mood and what runs", () => {
    const rocket = drawingOf(({ mood, label }) =>
      mood === "worried" ? "x_x" : label.includes("production") ? "🚀✨" : "🛰",
    );

    expect(rocket.draw({ mood: "working", tick: 0, label: "deploy api to production" })).toContain(
      "🚀✨",
    );
    expect(rocket.draw({ mood: "worried", tick: 0, label: "" })).toContain("x_x");
    expect(rocket.hedgehog).toBe(false);
  });

  it("given your own mascot in the config, when --no-mascot is passed, then none is drawn", () => {
    expect(
      resolveDisplay({ mascot: { happy: ["yay"] } }, { mascot: false }, terminal).mascot,
    ).toBeNull();
  });

  it("given your own mascot in the config, when --mascot is passed, then yours is kept", () => {
    const display = resolveDisplay({ mascot: { happy: ["yay"] } }, { mascot: true }, terminal);

    expect(display.mascot?.draw({ mood: "happy", tick: 0, label: "" }).trimEnd()).toBe("yay");
  });
});
