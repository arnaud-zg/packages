import { packageRegistryContract } from "shiplane/testing";

import { npmPackageRegistry } from "../npm-package-registry.adapter";

packageRegistryContract([{ adapter: npmPackageRegistry(), settings: {} }]);
