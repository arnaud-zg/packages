export const MOODS = ["thinking", "working", "waiting", "happy", "worried", "resting"] as const;

/** What the mascot shows beside the release: reading, running, waiting on a person, done, failed, idle. */
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

/** The mascot at a tick of his animation, looping. */
export const mascotFrame = (mood: Mood, tick: number) => {
  const frames = FRAMES[mood];
  return frames[tick % frames.length] ?? "";
};

/** `done` of `total` as a bar `width` characters wide. */
export const progressBar = (done: number, total: number, width: number) => {
  const filled = total <= 0 ? width : Math.round((width * Math.min(done, total)) / total);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
};

/** What is happening when the mascot is drawn. */
export interface MascotMoment {
  mood: Mood;
  /** Its animation frame, from 0; always 0 when motion is off. */
  tick: number;
  /** What runs right now, such as "build 3 apps" or "deploy api@1.2.0 to production". */
  label: string;
}

/**
 * A mascot of your own: frames per mood, looped as it animates, or a function drawing each moment.
 * Plain text: shiplane colours it by mood, pads it to one width, and takes any mood a set of frames
 * leaves out from the hedgehog.
 */
export type Mascot = Partial<Record<Mood, readonly string[]>> | ((moment: MascotMoment) => string);

/** A mascot ready to draw: every mood, one width. */
export interface MascotDrawing {
  /** True for the built-in hedgehog, coloured part by part. */
  readonly hedgehog: boolean;
  /** Columns every frame takes. */
  readonly width: number;
  /** How many frames a mood loops through. */
  frames: (mood: Mood) => number;
  draw: (moment: MascotMoment) => string;
}

const columns = (text: string) => [...text].length;
const pad = (text: string, width: number) => text + " ".repeat(Math.max(0, width - columns(text)));

/** Any mascot as a drawing: frames merged over the hedgehog's, a function sampled for its width. */
export const drawingOf = (mascot: Mascot | true): MascotDrawing => {
  if (typeof mascot === "function") {
    const sample = MOODS.flatMap((mood) =>
      [0, 1, 2, 3].map((tick) => columns(mascot({ mood, tick, label: "" }))),
    );
    const width = Math.max(0, ...sample);
    return {
      hedgehog: false,
      width,
      frames: () => 4,
      draw: (moment) => pad(mascot(moment), width),
    };
  }
  const own = mascot === true ? {} : mascot;
  const frames = Object.fromEntries(
    MOODS.map((mood) => {
      const given = own[mood];
      return [mood, given && given.length > 0 ? given : FRAMES[mood]];
    }),
  ) as Record<Mood, readonly string[]>;
  const width = Math.max(...Object.values(frames).flat().map(columns));
  return {
    hedgehog: mascot === true,
    width,
    frames: (mood) => frames[mood].length,
    draw: ({ mood, tick }) => pad(frames[mood][tick % frames[mood].length] ?? "", width),
  };
};

/** How much the release says while it runs, as `shiplane.config.ts` or a flag asks. */
export interface DisplayChoice {
  /** Says each thing it reads and runs, with a progress bar. */
  verbose?: boolean;
  /** The mascot beside what is happening: the hedgehog (true), none (false), or your own. */
  mascot?: boolean | Mascot;
}

export interface Display {
  verbose: boolean;
  /** The mascot to draw, or null for none. */
  mascot: MascotDrawing | null;
  /** The mascot animates: only in a terminal, never in a CI log or under NO_MOTION. */
  motion: boolean;
}

/** A flag wins over the config, which wins over the default: verbose, with the mascot. */
export const resolveDisplay = (
  config: DisplayChoice,
  flags: DisplayChoice,
  terminal: { tty: boolean; ci: boolean; noMotion: boolean },
): Display => {
  const verbose = flags.verbose ?? config.verbose ?? true;
  // A flag turns it on or off; which mascot comes from the config, the hedgehog when it says none.
  const configured = config.mascot ?? true;
  const chosen =
    flags.mascot === undefined
      ? configured
      : flags.mascot !== false && (configured === false ? true : configured);
  const mascot = chosen === false ? null : drawingOf(chosen);
  return {
    verbose,
    mascot,
    motion: mascot !== null && terminal.tty && !terminal.ci && !terminal.noMotion,
  };
};
