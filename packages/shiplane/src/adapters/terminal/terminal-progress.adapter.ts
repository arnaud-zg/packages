import { styleText } from "node:util";

import type { Display, MascotDrawing, MascotMoment, Mood } from "../../domain/display";
import type { Progress, StepPlace } from "../../ports/terminal.port";
import { progressBar } from "../../domain/display";
import { liveLine } from "./live-line";

/**
 * The mascot in colour: red when worried, green when happy. The hedgehog is coloured part by part,
 * spines, face, then what he holds; any other mascot as a whole.
 */
export const paintMascot = (mascot: MascotDrawing, moment: MascotMoment) => {
  const { mood } = moment;
  const text = mascot.draw(moment);
  if (mood === "worried") return styleText("red", text);
  if (!mascot.hedgehog) return mood === "happy" ? styleText("green", text) : text;
  const frame = [...text];
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
  const mascot = (mood: Mood, tick: number, label = "") =>
    display.mascot
      ? `${paintMascot(display.mascot, { mood, tick: display.motion ? tick : 0, label })} `
      : "";
  const taken = (step?: StepPlace) =>
    2 + (display.mascot ? display.mascot.width + 1 : 0) + counterOf(step).length + 8;

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
      liveLine.above(`  ${mascot(mood, 0, label)}${counter}${text}`);
      return work();
    }
    const started = Date.now();
    const time = () => styleText("dim", elapsed(started));
    const drawing = display.mascot;
    liveLine.show(
      {
        ...(drawing
          ? {
              frames: Array.from({ length: display.motion ? drawing.frames(mood) : 1 }, (_, tick) =>
                paintMascot(drawing, { mood, tick, label }),
              ),
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
    say: (mood, text) =>
      liveLine.above(display.mascot ? `  ${mascot(mood, 0, text)}${text}` : text),
  };
};
