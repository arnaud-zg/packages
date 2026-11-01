import { describe, expect, it } from "vitest";

import type { Environment } from "../domain/environment";
import type { DeliveryAdapter } from "../ports/adapter.port";
import type { Delivery, FolderView } from "../ports/delivery.port";
import { RecordingShell } from "../adapters/shell/__fakes__/shell.fake";
import { optionsFor } from "../application/config/optionsFor";
import { ENVIRONMENTS } from "../domain/environment";
import { testUnit } from "./releaseContext";

/** One adapter of a port, with settings an app's unit file could hold for it. */
export interface ContractCase<Port extends Delivery & { capability: string }> {
  adapter: DeliveryAdapter<Port>;
  settings: Record<string, unknown>;
}

const EMPTY_FOLDER: FolderView = {
  dir: "apps/empty",
  name: "empty",
  files: [],
  has: () => false,
  read: () => null,
};

/** What every adapter of a delivery port must do, whatever its provider; `more` adds the port's own. */
export const deliveryContract = <Port extends Delivery & { capability: string }>(
  kind: string,
  cases: ContractCase<Port>[],
  more: (adapter: DeliveryAdapter<Port>, port: Port) => void = () => undefined,
) =>
  describe.each(cases.map((entry) => [entry.adapter.name, entry] as const))(
    `%s, as ${kind}`,
    (_name, { adapter, settings }) => {
      const port = adapter.create({ root: "/repo", shell: new RecordingShell() });
      const unit = testUnit("app", { module: "app", options: settings });
      const inputFor = (environment: Environment) => ({
        unit,
        tag: "app@0.1.0",
        environment,
        options: optionsFor({ ...unit, options: adapter.settings.parse(settings) }, environment, [
          unit,
        ]),
        commit: "abc1234",
      });

      it("given an app's settings, when its unit file is read, then the adapter's schema takes them", () => {
        expect(adapter.settings.safeParse(settings).success).toBe(true);
      });

      it("given a tag on each environment, when it says where the tag lands, then a person can read it", () => {
        ENVIRONMENTS.forEach((environment) =>
          expect(port.describe(inputFor(environment)).trim()).not.toBe(""),
        );
      });

      it("given a tag on each environment, when its jobs are built, then each says what it does and what it runs", () => {
        ENVIRONMENTS.forEach((environment) =>
          port.jobs(inputFor(environment)).forEach((job) => {
            expect(job.label.trim()).not.toBe("");
            expect(job.local.length).toBeGreaterThan(0);
            job.local.forEach(({ command }) => expect(command.trim()).not.toBe(""));
          }),
        );
      });

      it("given a folder with nothing in it, when init looks at it, then the adapter recognises nothing", () => {
        expect(adapter.detect?.(EMPTY_FOLDER) ?? null).toBeNull();
      });

      it("given an app it ships, when doctor asks what it needs, then each need has a name and a check", () => {
        (adapter.requirements?.(unit) ?? []).forEach(({ label, check }) => {
          expect(label.trim()).not.toBe("");
          expect(check.command.trim()).not.toBe("");
        });
      });

      more(adapter, port);
    },
  );
