# @shiplane/fly

## 0.5.0

### Patch Changes

- [#56](https://github.com/arnaud-zg/packages/pull/56) [`8517d57`](https://github.com/arnaud-zg/packages/commit/8517d57bf1ff7ed13561d9686529a4718cf581da) - Clearer npm description and keywords, so the package shows up in npm and web search.
- Updated dependencies [[`956673f`](https://github.com/arnaud-zg/packages/commit/956673f131cda3b7e1b25fe01c0dfb9124657147), [`8517d57`](https://github.com/arnaud-zg/packages/commit/8517d57bf1ff7ed13561d9686529a4718cf581da), [`956673f`](https://github.com/arnaud-zg/packages/commit/956673f131cda3b7e1b25fe01c0dfb9124657147)]:
  - shiplane@0.5.0

🙏 Thanks to [@arnaud-zg](https://github.com/arnaud-zg) for this release!

## 0.4.2

### Patch Changes

- [#52](https://github.com/arnaud-zg/packages/pull/52) [`1d6346e`](https://github.com/arnaud-zg/packages/commit/1d6346ebd0e6204aeccef4ed098d7d7fb34a510d) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - Fly, EAS and Cloudflare Pages list the env var names they hold, so `checkEnvBeforeDeploy` and
  `shiplane doctor` can check them. Fly reads its secrets and the fly.toml `[env]` keys, EAS its
  environment's variables, Pages its secrets and the unit's build variables. Values are never read.
- Updated dependencies [[`4fd368d`](https://github.com/arnaud-zg/packages/commit/4fd368d0314695a5bcfd77eaa81f599451b178a9)]:
  - shiplane@0.4.2

## 0.4.1

### Patch Changes

- Version forced to 0.4.1 instead of 0.5.0: Adds setup versioning and a version picker to the same release flow
- Updated dependencies [[`ad23280`](https://github.com/arnaud-zg/packages/commit/ad23280c143888d4398a020751e69910b9dfc568), [`f8dd4e8`](https://github.com/arnaud-zg/packages/commit/f8dd4e8edaec8cd9b75da7f3cb5f969263e98fe9), [`7ec8604`](https://github.com/arnaud-zg/packages/commit/7ec8604fa0aeafa226dc4e85f2e5ff6c79e35ea5), [`8315f35`](https://github.com/arnaud-zg/packages/commit/8315f3531b272c5d97f8429b6b9e39911489fa93)]:
  - shiplane@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [[`503ca62`](https://github.com/arnaud-zg/packages/commit/503ca62b69995ca00ab033aa8530c79dac68450b), [`0c3b562`](https://github.com/arnaud-zg/packages/commit/0c3b56299fa348ee7912c6438593432ae2b77a73)]:
  - shiplane@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`e8ca313`](https://github.com/arnaud-zg/packages/commit/e8ca313e3127073b3cbbb9c5ed54f23f69d15887), [`3e5e052`](https://github.com/arnaud-zg/packages/commit/3e5e0520b223dd4d97958872e6648dca2575b09e), [`05c2051`](https://github.com/arnaud-zg/packages/commit/05c2051489560eeae03cbd70b00d962ee7048a25)]:
  - shiplane@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`7c47219`](https://github.com/arnaud-zg/packages/commit/7c472198163b96f1981d1e1537dd4bde20d315bb), [`7b81764`](https://github.com/arnaud-zg/packages/commit/7b817646e4f61c18a920e85f14076f5eedc59c69), [`34d9e31`](https://github.com/arnaud-zg/packages/commit/34d9e31e92aaf359230339a1baa899ff705080cd)]:
  - shiplane@0.2.0

## 0.1.0

### Minor Changes

- [#16](https://github.com/arnaud-zg/packages/pull/16) [`08a4279`](https://github.com/arnaud-zg/packages/commit/08a42797cdf5294ca302b84fb228cc6631cb70f0) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - shiplane joins the repo: a release CLI that finds what changed, versions it and deploys each app
  through plugins (git, GitHub, changesets, Fly, Cloudflare Pages, EAS, npm).

### Patch Changes

- Updated dependencies [[`08a4279`](https://github.com/arnaud-zg/packages/commit/08a42797cdf5294ca302b84fb228cc6631cb70f0)]:
  - shiplane@0.1.0
