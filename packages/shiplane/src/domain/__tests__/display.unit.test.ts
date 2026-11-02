import { describe, expect, it } from "vitest";

import { mascotFrame, mascotFrames, MOODS, progressBar, resolveDisplay } from "../display";

describe("the mascot beside the release", () => {
  it("given any mood, when he animates, then every frame keeps one width so the line never jumps", () => {
    for (const mood of MOODS) {
      const widths = new Set(mascotFrames(mood).map((frame) => [...frame].length));
      expect(widths.size, mood).toBe(1);
    }
  });

  it("given a frame past the last one, when drawn, then the animation loops", () => {
    expect(mascotFrame("waiting", mascotFrames("waiting").length)).toBe(mascotFrame("waiting", 0));
  });

  it("given a failure and a release done, when drawn, then he looks different for each", () => {
    expect(mascotFrame("worried", 0)).not.toBe(mascotFrame("happy", 0));
  });
});

describe("the progress bar", () => {
  it("given step 3 of 6, when drawn 12 wide, then half of it is filled", () => {
    expect(progressBar(3, 6, 12)).toBe("██████░░░░░░");
  });

  it("given every step done, when drawn, then it is full", () => {
    expect(progressBar(4, 4, 8)).toBe("████████");
  });

  it("given nothing done yet, when drawn, then it is empty", () => {
    expect(progressBar(0, 5, 5)).toBe("░░░░░");
  });
});

describe("how much the release says while it runs", () => {
  const terminal = { tty: true, ci: false, noMotion: false };

  it("given nothing configured, when resolved, then it says what it does and the mascot moves", () => {
    const display = resolveDisplay({}, {}, terminal);

    expect(display).toMatchObject({ verbose: true, motion: true });
    expect(display.mascot?.hedgehog).toBe(true);
  });

  it("given the config turns both off, when resolved, then the release is terse and has no mascot", () => {
    expect(resolveDisplay({ verbose: false, mascot: false }, {}, terminal)).toEqual({
      verbose: false,
      mascot: null,
      motion: false,
    });
  });

  it("given the config turns the mascot off and a flag turns it on, when resolved, then the flag wins", () => {
    const display = resolveDisplay({ mascot: false }, { mascot: true }, terminal);

    expect(display.mascot?.hedgehog).toBe(true);
    expect(display.motion).toBe(true);
  });

  it("given a CI log, a pipe or NO_MOTION, when resolved, then the mascot stays still", () => {
    expect(resolveDisplay({}, {}, { ...terminal, ci: true }).motion).toBe(false);
    expect(resolveDisplay({}, {}, { ...terminal, tty: false }).motion).toBe(false);
    expect(resolveDisplay({}, {}, { ...terminal, noMotion: true }).motion).toBe(false);
  });
});
