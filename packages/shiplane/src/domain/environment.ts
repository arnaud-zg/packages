/** Where a unit runs, in promotion order: production ships what preview validated. */
export const ENVIRONMENTS = ["preview", "production"] as const;

export type Environment = (typeof ENVIRONMENTS)[number];
