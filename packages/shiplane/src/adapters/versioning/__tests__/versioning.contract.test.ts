import { VersioningFake } from "../__fakes__/versioning.fake";
import { versioningContract } from "../versioning.contract";

const WORKSPACE = { name: "@acme/api", folder: "apps/api" };

versioningContract("the fake", () =>
  Promise.resolve({
    port: new VersioningFake().seed({ folders: { [WORKSPACE.name]: WORKSPACE.folder } }),
    workspace: WORKSPACE,
  }),
);
