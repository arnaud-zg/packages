import type { Mood } from "../domain/display";

/** Where the CLI writes for a person to read. */
export interface Output {
  line: (text?: string) => void;
}

export interface Choice<Value extends string> {
  value: Value;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** Questions to the person. Without a terminal, nothing is asked: each answer is null or false. */
export interface Prompter {
  readonly interactive: boolean;
  /** `initial` is the answer offered first: No unless said. */
  confirm: (question: string, initial?: boolean) => Promise<boolean>;
  /** The typed confirmation production asks for: true only when the word is typed exactly. */
  typed: (question: string, word: string) => Promise<boolean>;
  select: <Value extends string>(
    message: string,
    choices: Choice<Value>[],
    initial?: Value,
  ) => Promise<Value | null>;
  multiselect: <Value extends string>(
    message: string,
    choices: Choice<Value>[],
    initial: Value[],
  ) => Promise<Value[] | null>;
  text: (message: string, initial?: string) => Promise<string | null>;
  /** Shows `label` as waiting for up to `ms`; resolves with a key from `keys`, or null on timeout. */
  waitForKey: (label: string, ms: number, keys: readonly string[]) => Promise<string | null>;
}

export interface Clock {
  now: () => Date;
  /** Waits, unless something wakes it first. */
  sleep: (ms: number) => Promise<void>;
}

/** A step's place in its run, for the counter and the bar. */
export interface StepPlace {
  index: number;
  total: number;
}

/**
 * Where the release is, for a person to follow: the stage of its journey, what it is reading or
 * running right now, and the mascot's mood. How much of it shows is the adapter's choice.
 */
export interface Progress {
  /** The release reached `stages[index]`. */
  stage: (stages: readonly string[], index: number) => void;
  /** Runs `work` while showing `label`; a step also shows its place in its run. */
  during: <T>(label: string, mood: Mood, work: () => Promise<T>, step?: StepPlace) => Promise<T>;
  /** One line, said in a mood: done, failed, nothing to do. */
  say: (mood: Mood, text: string) => void;
}
