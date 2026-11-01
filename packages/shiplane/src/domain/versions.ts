const toParts = (version: string) =>
  version.split(".").map((part) => Number.parseInt(part, 10) || 0);

/** Negative, zero or positive, like a sort comparator: "0.1.10" is after "0.1.9". */
export const compareVersions = (left: string, right: string): number => {
  const leftParts = toParts(left);
  const rightParts = toParts(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
};

export const nextPatch = (version: string) => {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
};
