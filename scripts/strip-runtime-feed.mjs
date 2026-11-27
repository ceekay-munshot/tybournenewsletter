// Keep a stable placeholder in Git. The dashboard loads the current block from R2.
import { readFile, writeFile } from 'node:fs/promises';
import { errorBlock } from './lib/changeBlock.mjs';

const dir = new URL('../clients/tybourne/', import.meta.url);
const file = new URL('data/consolidated.json', dir);
const data = JSON.parse(await readFile(file));
const config = JSON.parse(await readFile(new URL('client.config.json', dir)));
const source = config.systems.find(s => s.id === 'huggingface');
const index = data.systems.findIndex(s => s.systemId === source.id);
if (index < 0) throw new Error('Missing Hugging Face slot');
const block = errorBlock(source, 'Live Hugging Face data is temporarily unavailable.');
block.asOf = '';
data.systems[index] = block;
await writeFile(file, JSON.stringify(data, null, 2) + '\n');
