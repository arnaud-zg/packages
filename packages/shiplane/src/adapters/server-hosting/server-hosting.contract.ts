import { expect, it } from "vitest";

import type { ServerHostingPort } from "../../ports/server-hosting.port";
import type { ContractCase } from "../../testing/deliveryContract";
import { deliveryContract } from "../../testing/deliveryContract";

/** What every server host does, whatever its provider. */
export const serverHostingContract = (cases: ContractCase<ServerHostingPort>[]) =>
  deliveryContract("server hosting", cases, (_adapter, port) => {
    it("given a server host, when its kind is read, then it hosts servers", () => {
      expect(port.capability).toBe("server-hosting");
    });
  });
