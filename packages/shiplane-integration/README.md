# 🧪 @shiplane/integration

Private, never published. Tests of [shiplane](../shiplane/README.md) that need several plugins at
once: `init` offering each, and a ship across more than one host. The core cannot depend on its
plugins, so these tests live here.

```sh
pnpm --filter @shiplane/integration test
```
