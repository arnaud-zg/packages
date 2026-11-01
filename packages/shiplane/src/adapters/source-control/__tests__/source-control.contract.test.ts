import { SourceControlFake } from "../__fakes__/source-control.fake";
import { sourceControlContract } from "../source-control.contract";

sourceControlContract("the fake", () => {
  const fake = new SourceControlFake();
  const changed: string[] = [];
  return Promise.resolve({
    port: fake,
    head: async () => (await fake.position()).head,
    change: (file) => {
      changed.push(file);
      fake.seed({ changed: [...changed] });
      return Promise.resolve();
    },
  });
});
