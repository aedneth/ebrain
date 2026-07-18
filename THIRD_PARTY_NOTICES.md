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

## Zod

eBrain declares [Zod](https://github.com/colinhacks/zod) as a direct runtime dependency in
`package.json`. It is resolved by Bun during installation and remains under its upstream MIT
License. Its authoritative notice is present in the installed dependency at `node_modules/zod/LICENSE`.

## Agent CLIs and provider services

eBrain can integrate with locally installed agent CLIs and user-configured providers. They are not
bundled or relicensed by this repository. Their availability, terms, and accounts remain governed
by their respective upstream projects and providers.
