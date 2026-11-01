import { ciPipelineFake } from "../adapters/ci-pipeline/__fakes__/ci-pipeline.fake";
import { codeHostFake } from "../adapters/code-host/__fakes__/code-host.fake";
import { serverHostingFake } from "../adapters/server-hosting/__fakes__/server-hosting.fake";
import { sourceControlFake } from "../adapters/source-control/__fakes__/source-control.fake";
import { staticHostingFake } from "../adapters/static-hosting/__fakes__/static-hosting.fake";
import { versioningFake } from "../adapters/versioning/__fakes__/versioning.fake";

/** A Fake for every port a rehearsal config composes, as adapters it holds. */
const fakes = () => ({
  sourceControl: sourceControlFake(),
  codeHost: codeHostFake(),
  ciPipeline: ciPipelineFake(),
  versioning: versioningFake(),
  serverHosting: serverHostingFake(),
  staticHosting: staticHostingFake(),
});

export type Rehearsal = ReturnType<typeof fakes>;

declare global {
  // The config loads in its own module scope; the process global is what it shares with the test.
  var shiplaneRehearsal: Rehearsal | undefined;
}

/** The Fakes of the current rehearsal: the test seeds and reads them, its config composes them. */
export const rehearsal = (): Rehearsal => (globalThis.shiplaneRehearsal ??= fakes());

/** Ends the rehearsal: the next one starts on fresh Fakes. */
export const endRehearsal = () => {
  globalThis.shiplaneRehearsal = undefined;
};
