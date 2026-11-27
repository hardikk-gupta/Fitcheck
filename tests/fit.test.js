import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscript, samples, validValue } from '../public/fit.js';

const shirt=(text,previous) => parseTranscript(text,'shirt','in',previous);
test('only named measurements are added, leaving the rest blank',()=>{
  assert.deepEqual(shirt('Chest 34, sleeve 22.').values,{chest:34,sleeve:22});
  assert.deepEqual(shirt('Length 28, sleeve 22.').values,{length:28,sleeve:22});
});
test('full garment samples have six values each',()=>{
  assert.equal(Object.keys(shirt(samples.shirt).values).length,6);
  assert.equal(Object.keys(parseTranscript(samples.trousers,'trousers','in').values).length,6);
});
test('mixed-language aliases and Devanagari numerals',()=>{
  assert.deepEqual(shirt('सीना ३४, kamar battis, आस्तीन बाईस.').values,{chest:34,waist:32,sleeve:22});
});
test('spelled numbers, decimals, and familiar forms',()=>{
  assert.deepEqual(shirt('Chest thirty-four inches. Sleeve twenty two and a half.').values,{chest:34,sleeve:22.5});
  assert.deepEqual(shirt('Chest 34.5, sleeve 22½.').values,{chest:34.5,sleeve:22.5});
});
test('flags ambiguous numbers rather than assigning one',()=>{
  const x=shirt('Chest 34 or 38, sleeve 22.');
  assert.deepEqual(x.values,{sleeve:22});
  assert.equal(x.flagged.chest.reason,'More than one number heard');
  assert.equal(x.flagged.chest.canUse,false);
  assert.equal(shirt('Chest 34, 38.').flagged.chest.canUse,false);
});
test('retains prior value when there is a new conflicting number',()=>{
  const prev={chest:{value:34}};
  const x=shirt('Chest 36.',prev);
  assert.deepEqual(x.values,{});
  assert.equal(x.flagged.chest.candidate,'36');
  assert.equal(x.flagged.chest.canUse,true);
  assert.deepEqual(shirt('Correct chest to 36.',prev).values,{chest:36});
  assert.deepEqual(shirt('Chest 34, actually 36.',prev).values,{chest:36});
});
test('a named field with no number is flagged',()=>{
  assert.equal(shirt('Chest, sleeve 22.').flagged.chest.reason,'No number heard');
});
test('rejects wrong units and invalid ranges without converting',()=>{
  assert.equal(shirt('Chest 80 cm.').flagged.chest.canUse,false);
  assert.equal(shirt('Chest -34.').flagged.chest.canUse,false);
  assert.equal(shirt('Chest 340.').flagged.chest.canUse,false);
  assert.deepEqual(parseTranscript('Chest 80 cm.','shirt','cm').values,{chest:80});
  assert.equal(validValue('21.25','in'),true);
  assert.equal(validValue('9e1','in'),false);
});
test('unknown measurements or unclear speech do not produce values',()=>{
  assert.deepEqual(shirt('This is fitting number 12.').values,{});
  assert.deepEqual(shirt('Inseam 30.').values,{});
});
