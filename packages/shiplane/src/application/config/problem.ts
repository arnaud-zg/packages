/** Something wrong in the config, said where a person can fix it. */
export interface ConfigProblem {
  /** Relative to the repository root. */
  file: string;
  line?: number;
  message: string;
  hint?: string;
}

const distance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column] ?? 0;
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      previous[column] = Math.min(above + 1, (previous[column - 1] ?? 0) + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[right.length] ?? 0;
};

/** The candidate a typo most likely meant, when one is close enough to be worth naming. */
export const didYouMean = (word: string, candidates: readonly string[]): string | undefined => {
  const [best] = candidates
    .map((candidate) => ({
      candidate,
      cost: distance(word.toLowerCase(), candidate.toLowerCase()),
    }))
    .sort((left, right) => left.cost - right.cost);
  return best && best.cost <= Math.max(2, Math.floor(word.length / 3))
    ? `did you mean "${best.candidate}"?`
    : undefined;
};

/** Top to bottom per file, problems without a line last. */
export const sortProblems = (problems: ConfigProblem[]) =>
  [...problems].sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER),
  );
