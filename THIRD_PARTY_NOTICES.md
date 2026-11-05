# Third-Party Notices

The eBrain-authored source in this repository is licensed under
[`AGPL-3.0-only`](LICENSE). This notice documents separately licensed components that eBrain uses
or obtains during installation. It does not modify, replace, or relicense their upstream terms.

## gbrain knowledge engine

`scripts/install.sh` and CI obtain [gbrain](https://github.com/garrytan/gbrain) at the pinned
revision declared in `scripts/install.sh`. The clone lives in the ignored local
`vendor/gbrain/` directory and is not a tracked subtree of this repository. gbrain is licensed by
its upstream authors under the MIT License. Its authoritative notice is present in the installed
copy at `vendor/gbrain/LICENSE`.

## Bun

eBrain runs on [Bun](https://bun.sh) (MIT). `scripts/install.sh` installs it if it is missing and, when the one on `PATH`
is older than the pinned engine requires, a private copy of the version the engine needs under
`~/.local/share/ebrain/bun`, downloaded from the upstream installer. It is not bundled in this repository.

## qmd (optional)

`ebrain memoria` can keep a keyword index of the projected corpus with [qmd](https://github.com/tobi/qmd), and the
retrieval regression can drive it. qmd is installed by the user, is not obtained by the installer and is not bundled; its
terms are its upstream's.

## Zod

eBrain declares [Zod](https://github.com/colinhacks/zod) as a direct runtime dependency in
`package.json`. It is resolved by Bun during installation and remains under its upstream MIT
License. Its authoritative notice is present in the installed dependency at `node_modules/zod/LICENSE`.

## Documentation build toolchain

The isolated `website/` package uses [Astro](https://astro.build/) and
[`@astrojs/check`](https://github.com/withastro/astro) as build-time tools under their upstream MIT
License. It uses [TypeScript](https://www.typescriptlang.org/) under its upstream Apache-2.0 License.
The static controls copied by its asset-sync script come from
[Lucide](https://lucide.dev/) under the ISC License; the static GitHub and X marks come from
[Simple Icons](https://simpleicons.org/) under CC0-1.0. The authoritative notices are included in
the locally installed packages under `website/node_modules/`.

These tools create static HTML and local SVG assets only. They are not an eBrain runtime service or provider
dependency. The hosted copy of the documentation also loads [`@vercel/analytics`](https://github.com/vercel/analytics)
(MIT) and [`@vercel/speed-insights`](https://github.com/vercel/speed-insights) (Apache-2.0) for first-party page-traffic and
Core Web Vitals measurement; a local build of the site has neither, and the eBrain CLI and daemon never load them.

## Agent CLIs and provider services

eBrain can integrate with locally installed agent CLIs (Codex, Antigravity, Hermes, Claude Code and others) and user-configured providers. They are not
bundled or relicensed by this repository. Their availability, terms, and accounts remain governed
by their respective upstream projects and providers.
