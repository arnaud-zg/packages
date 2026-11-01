import { expect, it } from "vitest";

import type { MobileDistributionPort } from "../../ports/mobile-distribution.port";
import type { ContractCase } from "../../testing/deliveryContract";
import { deliveryContract } from "../../testing/deliveryContract";

/** What every mobile distribution does, whatever its provider. */
export const mobileDistributionContract = (cases: ContractCase<MobileDistributionPort>[]) =>
  deliveryContract("mobile distribution", cases, (adapter, port) => {
    it("given a mobile distribution, when status asks who decides, then its platform is named", () => {
      expect(port.capability).toBe("mobile-distribution");
      expect(adapter.decidedBy?.platform.trim() ?? "").not.toBe("");
    });
  });
