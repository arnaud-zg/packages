import type { Ora } from "ora";
import ora from "ora";

const TICK_MS = 140;

/** What the live line shows: its frames (the mascot, or ora's dots), its text, what trails it. */
export interface LiveSpinner {
  frames?: readonly string[];
  text: string;
  suffix?: () => string;
}

/**
 * The one line the release redraws in place, an ora spinner. Anything else printed goes above it,
 * and a prompt or a child process holds it so the terminal is theirs meanwhile.
 */
class LiveLine {
  private spinner: Ora | null = null;
  private held = 0;

  get busy() {
    return this.spinner !== null;
  }

  show({ frames, text, suffix }: LiveSpinner, animate: boolean) {
    this.spinner = ora({
      text,
      suffixText: suffix,
      stream: process.stdout,
      discardStdin: false,
      isEnabled: animate,
      ...(frames && frames.length > 0
        ? { spinner: { interval: TICK_MS, frames: [...frames] } }
        : { spinner: "dots" }),
    });
    if (this.held === 0) this.spinner.start();
  }

  /** Ends the live line with a symbol kept on screen: ✓, ✗ or !. */
  finish(symbol: string, text?: string) {
    const spinner = this.spinner;
    this.spinner = null;
    if (!spinner) return;
    if (this.held > 0) {
      process.stdout.write(`${symbol} ${text ?? spinner.text}\n`);
      return;
    }
    spinner.stopAndPersist({ symbol, ...(text === undefined ? {} : { text }) });
  }

  clear() {
    this.spinner?.stop();
    this.spinner = null;
  }

  /** Prints a line above the live one. */
  above(text: string) {
    const live = this.spinner && this.held === 0 ? this.spinner : null;
    live?.clear();
    process.stdout.write(`${text}\n`);
    live?.render();
  }

  /** Gives the terminal to `work`, a prompt or a child process, then draws the live line again. */
  async hold<T>(work: () => Promise<T>) {
    if (this.spinner && this.held === 0) this.spinner.stop();
    this.held += 1;
    try {
      return await work();
    } finally {
      this.held -= 1;
      if (this.spinner && this.held === 0) this.spinner.start();
    }
  }
}

export const liveLine = new LiveLine();
