const CLEAR = "\r\u001B[2K";
const TICK_MS = 140;

/**
 * The one line the release redraws in place: the mascot and what runs. Anything else printed goes
 * above it, and a prompt or a child process holds it so the terminal is theirs meanwhile.
 */
class LiveLine {
  private render: ((tick: number) => string) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private held = 0;

  get busy() {
    return this.render !== null;
  }

  show(render: (tick: number) => string, animate: boolean) {
    this.render = render;
    this.tick = 0;
    this.draw();
    if (animate) {
      this.timer = setInterval(() => {
        this.tick += 1;
        this.draw();
      }, TICK_MS);
    }
  }

  clear() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.render && this.held === 0) process.stdout.write(CLEAR);
    this.render = null;
  }

  /** Prints a line above the live one. */
  above(text: string) {
    if (this.render && this.held === 0) process.stdout.write(CLEAR);
    process.stdout.write(`${text}\n`);
    this.draw();
  }

  /** Gives the terminal to `work`, a prompt or a child process, then draws the live line again. */
  async hold<T>(work: () => Promise<T>) {
    if (this.render && this.held === 0) process.stdout.write(CLEAR);
    this.held += 1;
    try {
      return await work();
    } finally {
      this.held -= 1;
      this.draw();
    }
  }

  private draw() {
    if (this.render && this.held === 0) process.stdout.write(`${CLEAR}${this.render(this.tick)}`);
  }
}

export const liveLine = new LiveLine();
