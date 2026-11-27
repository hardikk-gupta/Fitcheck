import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseTranscript } from '../public/fit.js';
const { text } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log('Recognized:', text);
const { values, flagged } = parseTranscript(text,'shirt','in');
assert.deepEqual(flagged,{});
assert.deepEqual(values,{chest:34,sleeve:22});
