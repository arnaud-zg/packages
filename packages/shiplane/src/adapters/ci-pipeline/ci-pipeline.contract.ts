import { describe, expect, it } from "vitest";

import type { CiPipelinePort } from "../../ports/ci-pipeline.port";

/** A CI pipeline, and the ways a test reads it beyond the port. */
export interface CiPipelineSubject {
  port: CiPipelinePort;
  /** A workflow that exists and has never run. */
  idle: string;
}

/** What every CI pipeline does, whatever its provider. */
export const ciPipelineContract = (name: string, subject: () => Promise<CiPipelineSubject>) =>
  describe(`${name}, as a CI pipeline`, () => {
    it("given a workflow that never ran, when its runs are read, then there are none", async () => {
      const { port, idle } = await subject();

      expect(await port.workflowRuns(idle)).toEqual([]);
    });

    it("given a workflow that never succeeded, when its billed minutes are read, then none are measured", async () => {
      const { port, idle } = await subject();

      expect(await port.measuredMinutes(idle)).toEqual([]);
    });

    it("given this month's budget, when it is read, then what is left is never more than included", async () => {
      const { port } = await subject();

      const minutes = await port.minutes();

      if (minutes) expect(minutes.left).toBeLessThanOrEqual(minutes.included);
      else expect(minutes).toBeNull();
    });
  });
