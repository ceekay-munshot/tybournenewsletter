// Snapshot each source at one commit. Only this step receives the read-only Actions token.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { feedFiles, feedFile } from './lib/private-feeds.mjs';

function github(path, args = []) {
  return execFileSync('gh', ['api', '--hostname', 'github.com', path, ...args], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

async function fetchRepository(repository, paths) {
  if (repository === 'huggingface') {
    const res = await fetch('https://tybournenewsletter.pages.dev/api/hf-data/pair', { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`R2 feed returned HTTP ${res.status}`);
    const pair = await res.json();
    if (!pair.series?.weeks?.includes(pair.week) || !pair.insights?.week?.length) throw new Error('Incomplete R2 release');
    for (const name of ['series', 'insights']) {
      const file = feedFile(repository, `public/data/${name}.json`);
      await mkdir(new URL('.', file), { recursive: true });
      await writeFile(file, JSON.stringify(pair[name]));
    }
    console.log(`Read Hugging Face release ${pair.week} from R2`);
    return;
  }
  const repo = `repos/nostra-demus/${repository}`;
  const sha = github(`${repo}/commits/main`, ['--jq', '.sha']).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(`Invalid revision for ${repository}`);
  const files = paths.map((path) => {
    const content = github(`${repo}/contents/${path}?ref=${sha}`, ['-H', 'Accept: application/vnd.github.raw+json']);
    JSON.parse(content);
    return { file: feedFile(repository, path), content };
  });
  for (const { file, content } of files) {
    await mkdir(new URL('.', file), { recursive: true });
    await writeFile(file, content);
  }
  console.log(`Read ${paths.length} feed files from nostra-demus/${repository} at ${sha}`);
}

for (const [repository, paths] of Object.entries(feedFiles)) {
  try {
    await fetchRepository(repository, paths);
  } catch (error) {
    // A local retry must never mix a previous source revision with a new one.
    for (const path of paths) await rm(feedFile(repository, path), { force: true });
    console.error(`Could not refresh nostra-demus/${repository}: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
}
