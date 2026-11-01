import { expect, it } from "vitest";

import type { StaticHostingPort } from "../../ports/static-hosting.port";
import type { ContractCase } from "../../testing/deliveryContract";
import { deliveryContract } from "../../testing/deliveryContract";

/** What every static host does, whatever its provider. */
export const staticHostingContract = (cases: ContractCase<StaticHostingPort>[]) =>
  deliveryContract("static hosting", cases, (_adapter, port) => {
    it("given a static host, when its kind is read, then it hosts static sites", () => {
      expect(port.capability).toBe("static-hosting");
    });
  });
