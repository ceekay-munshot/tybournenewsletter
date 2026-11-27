import { readFile } from 'node:fs/promises';

export const feedFiles = {
  Airlines: ['data/tsa.json', 'data/data.json'],
  huggingface: ['public/data/insights.json', 'public/data/series.json'],
};

export function feedFile(repository, path) {
  if (!Object.hasOwn(feedFiles, repository) || !feedFiles[repository].includes(path)) throw new Error('Unknown private feed file');
  return new URL(`../../.feed-sources/${repository}/${path}`, import.meta.url);
}

export async function readFeed(repository, path) {
  return JSON.parse(await readFile(feedFile(repository, path), 'utf8'));
}
