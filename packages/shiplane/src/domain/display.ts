export const MOODS = ["thinking", "working", "waiting", "happy", "worried", "resting"] as const;

/** What Pr. Kipik shows beside the release: reading, running, waiting on a person, done, failed, idle. */
export type Mood = (typeof MOODS)[number];

// Spines that rise and fall, a face, then what he holds: every frame is 13 characters wide.
const UP = "/\\/\\/";
const DOWN = "\\/\\/\\";

const FRAMES: Record<Mood, readonly string[]> = {
  thinking: [`${UP}(•ω•) ? `, `${UP}(•ω•)  ?`, `${DOWN}(•ω•) ? `, `${DOWN}(•ω•)   `],
  working: [`${UP}(•ω•)/  `, `${UP}(•ω•)-  `, `${DOWN}(•ω•)\\  `, `${DOWN}(•ω•)|  `],
  waiting: [`${UP}(-ω-) z `, `${UP}(-ω-) zz`, `${UP}(•ω•)   `, `${UP}(-ω-) zZ`],
  happy: [`${UP}(^ω^) ✦ `, `${DOWN}(^ω^) ✧ `, `${UP}(^ω^)✦ ✧`, `${DOWN}(^ω^) ✧ `],
  worried: [`${UP}(°ω°) ; `, `${DOWN}(°ω°) ;;`],
  resting: [`${UP}(-ω-) zZ`, `${UP}(-ω-)  z`],
};

export const mascotFrames = (mood: Mood) => FRAMES[mood];

/** Pr. Kipik at a tick of his animation, looping. */
export const mascotFrame = (mood: Mood, tick: number) => {
  const frames = FRAMES[mood];
  return frames[tick % frames.length] ?? "";
};

/** `done` of `total` as a bar `width` characters wide. */
export const progressBar = (done: number, total: number, width: number) => {
  const filled = total <= 0 ? width : Math.round((width * Math.min(done, total)) / total);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
};

/** How much the release says while it runs, as `shiplane.config.ts` or a flag asks. */
export interface DisplayChoice {
  /** Says each thing it reads and runs, with a progress bar. */
  verbose?: boolean;
  /** Pr. Kipik beside what is happening. */
  mascot?: boolean;
}

export interface Display {
  verbose: boolean;
  mascot: boolean;
  /** Pr. Kipik animates: only in a terminal, never in a CI log or under NO_MOTION. */
  motion: boolean;
}

/** A flag wins over the config, which wins over the default: verbose, with Pr. Kipik. */
export const resolveDisplay = (
  config: DisplayChoice,
  flags: DisplayChoice,
  terminal: { tty: boolean; ci: boolean; noMotion: boolean },
): Display => {
  const verbose = flags.verbose ?? config.verbose ?? true;
  const mascot = flags.mascot ?? config.mascot ?? true;
  return { verbose, mascot, motion: mascot && terminal.tty && !terminal.ci && !terminal.noMotion };
};
