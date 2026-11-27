import { readFeed } from '../lib/private-feeds.mjs';
import { getJson } from '../lib/http.mjs';
import { huggingFaceBlock } from '../lib/huggingface-block.mjs';

export async function connect(system) {
  const { repository } = system.source;
  const [ins, sx] = repository ? await Promise.all([
    readFeed(repository, 'public/data/insights.json'),
    readFeed(repository, 'public/data/series.json'),
  ]) : await Promise.all([
    getJson(system.source.insights),
    system.source.series ? getJson(system.source.series).catch(() => null) : Promise.resolve(null),
  ]);
  return huggingFaceBlock(system, ins, sx);
}
