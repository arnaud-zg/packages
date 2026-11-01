import { CodeHostFake } from "../__fakes__/code-host.fake";
import { codeHostContract } from "../code-host.contract";

codeHostContract("the fake", () =>
  Promise.resolve({
    port: new CodeHostFake(),
    branch: (name) => Promise.resolve(name),
    tag: () => Promise.resolve("app@1.0.0"),
    issue: { repository: "acme/repo", number: 1 },
  }),
);
