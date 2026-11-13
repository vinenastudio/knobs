// The Chrome Web Store upload: builds devknobs, then dist/, then zips it with manifest.json at the
// root, as knobs-<version>.zip beside this package's package.json.
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

const root = join(import.meta.dir, '..');
const dist = join(root, 'dist');

const devknobs = join(root, '../devknobs');
const versionOf = async (file: string) =>
  (JSON.parse(await readFile(file, 'utf8')) as { version: string }).version;
const packageVersion = await versionOf(join(devknobs, 'package.json'));
const manifestVersion = await versionOf(join(root, 'static/manifest.json'));
if (packageVersion !== manifestVersion) {
  throw new Error(
    `static/manifest.json is version ${manifestVersion} but knobs is ${packageVersion}: ` +
      'set the manifest to the version of the knobs it ships',
  );
}

await $`pnpm --filter @vinena/knobs build`.cwd(root);
// A release build: no local label in the manifest or the footer.
await $`bun ${join(root, 'scripts/build.ts')}`.env({ ...process.env, KNOBS_RELEASE: '1' });

const { version } = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8')) as {
  version: string;
};
const zip = join(root, `knobs-${version}.zip`);
await rm(zip, { force: true });
await $`zip -r -X -q ${zip} . -x '*.DS_Store' '*.map'`.cwd(dist);

process.stdout.write(`${zip}\n`);
