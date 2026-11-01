import { styleText } from "node:util";

import type { Display, Mood } from "../../domain/display";
import type { Progress, StepPlace } from "../../ports/terminal.port";
import { mascotFrame, mascotFrames, progressBar } from "../../domain/display";
import { liveLine } from "./live-line";

const MASCOT_WIDTH = 13;

/** The mascot in colour: spines, face, then what he holds; red when worried, green when happy. */
export const paintMascot = (mood: Mood, tick: number) => {
  const frame = [...mascotFrame(mood, tick)];
  if (mood === "worried") return styleText("red", frame.join(""));
  const face = frame.slice(5, 10).join("");
  return `${styleText("yellow", frame.slice(0, 5).join(""))}${styleText(mood === "happy" ? ["bold", "green"] : "bold", face)}${styleText("cyan", frame.slice(10).join(""))}`;
};

const elapsed = (since: number) => {
  const seconds = Math.round((Date.now() - since) / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
};

/** Cuts `text` to what the terminal shows on one line, so redrawing it in place stays clean. */
const fit = (text: string, taken: number) => {
  const room = Math.max(20, (process.stdout.columns || 100) - taken);
  return text.length > room ? `${text.slice(0, room - 1)}…` : text;
};

const counterOf = (step?: StepPlace) => (step ? `${step.index + 1}/${step.total}  ` : "");

/**
 * Progress in a terminal. Verbose: the journey bar, what it reads, each step redrawn in place with
 * its time, the mascot beside it. Not verbose: only each step's name, as before. A CI log or a pipe
 * gets plain lines, never a redraw.
 */
export const terminalProgress = (display: Display, inPlace: boolean): Progress => {
  const mascot = (mood: Mood, tick: number) =>
    display.mascot ? `${paintMascot(mood, display.motion ? tick : 0)} ` : "";
  const taken = (step?: StepPlace) =>
    2 + (display.mascot ? MASCOT_WIDTH + 1 : 0) + counterOf(step).length + 8;

  const during = async <T>(
    label: string,
    mood: Mood,
    work: () => Promise<T>,
    step?: StepPlace,
  ): Promise<T> => {
    const counter = styleText("dim", counterOf(step));
    if (!display.verbose) {
      if (step) {
        liveLine.above("");
        liveLine.above(styleText(["bold", "cyan"], `▶ ${label}`));
      }
      return work();
    }
    const text = fit(label, taken(step));
    if (!inPlace || liveLine.busy) {
      liveLine.above(`  ${mascot(mood, 0)}${counter}${text}`);
      return work();
    }
    const started = Date.now();
    const time = () => styleText("dim", elapsed(started));
    const moving = display.mascot && display.motion;
    liveLine.show(
      {
        ...(display.mascot
          ? {
              frames: moving
                ? mascotFrames(mood).map((_, tick) => paintMascot(mood, tick))
                : [paintMascot(mood, 0)],
            }
          : {}),
        text: `${counter}${text}`,
        suffix: time,
      },
      true,
    );
    try {
      const result = await work();
      liveLine.finish(`  ${styleText("green", "✓")}`, `${counter}${text} ${time()}`);
      return result;
    } catch (error) {
      liveLine.finish(`  ${styleText("red", "✗")}`, `${counter}${text} ${time()}`);
      throw error;
    }
  };

  return {
    stage: (stages, index) => {
      if (!display.verbose) return;
      const bar = styleText("green", progressBar(index + 1, stages.length, 18));
      liveLine.above("");
      liveLine.above(
        `  ${bar}  ${styleText("dim", `${index + 1}/${stages.length}`)}  ${styleText("bold", stages[index] ?? "")}`,
      );
    },
    during,
    say: (mood, text) => liveLine.above(display.mascot ? `  ${mascot(mood, 0)}${text}` : text),
  };
};
