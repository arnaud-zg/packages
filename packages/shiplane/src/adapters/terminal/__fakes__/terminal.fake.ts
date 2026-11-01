import type { Choice, Clock, Output, Prompter } from "../../../ports/terminal.port";

/** Everything the CLI printed, in order, without colours. */
export class MemoryOutput implements Output {
  readonly lines: string[] = [];

  line = (text = "") => {
    // eslint-disable-next-line no-control-regex
    this.lines.push(text.replace(/\u001B\[[0-9;]*m/g, ""));
  };

  get text() {
    return this.lines.join("\n");
  }
}

type Answer = boolean | string | string[] | null;

/** A person who answers from a script, in order; every question asked is kept. */
export class ScriptedPrompter implements Prompter {
  readonly asked: string[] = [];
  /** The answer each choice question offered first, by question. */
  readonly initials: Record<string, unknown> = {};
  /** The choices each select question offered, by question. */
  readonly choices: Record<string, Choice<string>[]> = {};
  private answers: Answer[] = [];

  constructor(readonly interactive = true) {}

  answer(...answers: Answer[]) {
    this.answers.push(...answers);
    return this;
  }

  private next(question: string): Answer {
    this.asked.push(question);
    if (this.answers.length === 0) throw new Error(`Unexpected question: ${question}`);
    return this.answers.shift() ?? null;
  }

  confirm = (question: string, initial = false) => {
    this.initials[question] = initial;
    return Promise.resolve(this.next(question) === true);
  };

  typed = (question: string, word: string) => Promise.resolve(this.next(question) === word);

  select = <Value extends string>(message: string, choices: Choice<Value>[], initial?: Value) => {
    this.initials[message] = initial;
    this.choices[message] = choices;
    return Promise.resolve(this.next(message) as Value | null);
  };

  multiselect = <Value extends string>(message: string, _choices: Choice<Value>[]) =>
    Promise.resolve(this.next(message) as Value[] | null);

  text = (message: string) => Promise.resolve(this.next(message) as string | null);

  /** No key is ever pressed: every wait times out, unless keys were queued with `press`. */
  private keys: string[] = [];

  press(...keys: string[]) {
    this.keys.push(...keys);
    return this;
  }

  waitForKey = () => Promise.resolve(this.keys.shift() ?? null);
}

/** A clock fixed at one moment, whose waits return at once. */
export class FixedClock implements Clock {
  constructor(private readonly at: Date) {}

  now = () => this.at;
  sleep = () => Promise.resolve();
}
