import { packageRegistryFake } from "../__fakes__/package-registry.fake";
import { packageRegistryContract } from "../package-registry.contract";

packageRegistryContract([{ adapter: packageRegistryFake(), settings: {} }]);
