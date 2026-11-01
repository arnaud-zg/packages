import { expect, it } from "vitest";

import type { PackageRegistryPort } from "../../ports/package-registry.port";
import type { ContractCase } from "../../testing/deliveryContract";
import { deliveryContract } from "../../testing/deliveryContract";

/** What every package registry does, whatever its provider. */
export const packageRegistryContract = (cases: ContractCase<PackageRegistryPort>[]) =>
  deliveryContract("a package registry", cases, (_adapter, port) => {
    it("given a package registry, when its kind is read, then it publishes packages", () => {
      expect(port.capability).toBe("package-registry");
    });
  });
