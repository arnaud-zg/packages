import type { Release } from "../application/config/loadRelease";
import { keysAt } from "../application/config/unitSchema";
import { out, paint } from "./output";

/** `shiplane plugins`: the flow's adapters, the modules in release order with their apps, the features. */
export const pluginsCommand = (release: Release, { json }: { json: boolean }) => {
  const { flow } = release;
  const ports = {
    sourceControl: flow.sourceControl.name,
    codeHost: flow.codeHost.name,
    ciPipeline: flow.ciPipeline.name,
    versioning: flow.versioning.name,
  };
  const modules = release.modules.map(({ name, kind, provider, settings }) => ({
    name,
    kind,
    provider,
    keys: keysAt(settings, []),
    apps: release.units.filter(({ module }) => module === name).map(({ name: app }) => app),
  }));
  const features = release.features.map(({ name, adapters }) => ({
    name,
    uses: adapters.map((adapter) => adapter.name),
  }));
  if (json) {
    out(JSON.stringify({ flow: ports, modules, features }, null, 2));
    return;
  }
  const width =
    Math.max(
      14,
      ...modules.map(({ name }) => name.length),
      ...features.map(({ name }) => name.length),
    ) + 2;
  const section = (title: string) => {
    out();
    out(paint("bold", title));
    out();
  };
  section("Flow in shiplane.config.ts");
  Object.entries(ports).forEach(([port, name]) => out(`  ${port.padEnd(width)}${name}`));
  section("Modules, in release order");
  modules.forEach(({ name, provider, keys, apps }) => {
    const used = apps.length > 0 ? `used by ${apps.join(", ")}` : paint("dim", "no app names it");
    out(`  ${name.padEnd(width)}${provider}  ${paint("dim", keys.join(", ") || "no options")}`);
    out(`  ${" ".repeat(width)}${used}`);
  });
  section("Features, after the ship");
  if (features.length === 0) out(`  ${paint("dim", "none")}`);
  features.forEach(({ name, uses }) =>
    out(`  ${name.padEnd(width)}${paint("dim", `uses ${uses.join(", ")}`)}`),
  );
  out();
};
