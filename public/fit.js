export const garmentFields = {
  shirt: [
    ['chest','Chest', ['chest','bust','chaati','chhati','seena','सीना','छाती'], 304,156, 402,124],
    ['waist','Waist', ['waist','kamar','कमर'], 280,235, 402,221],
    ['neck','Neck', ['neck','collar','gala','galaa','गला'], 260,88, 368,57],
    ['shoulder','Shoulder', ['shoulder','shoulders','kandha','kandhe','कंधा','कंधे'], 193,97, 29,61],
    ['sleeve','Sleeve', ['sleeve','sleeves','baju','baaju','बाजू','आस्तीन'], 134,159, 29,138],
    ['length','Shirt length', ['shirt length','length','lambai','लंबाई','लम्बाई'], 229,325, 30,289],
  ],
  trousers: [
    ['waist','Waist', ['waist','kamar','कमर'], 276,74, 388,56],
    ['hip','Hip', ['hip','hips','seat','हिप'], 294,126, 390,120],
    ['thigh','Thigh', ['thigh','thighs','jangh','जांघ','जाँघ'], 171,166, 26,142],
    ['inseam','Inseam', ['inseam','inside leg','इनसीम'], 242,217, 30,229],
    ['opening','Leg opening', ['leg opening','opening','hem','bottom','मोहरी','mohri'], 291,334, 383,301],
    ['length','Trouser length', ['trouser length','pant length','outseam','length','lambai','लंबाई','लम्बाई'], 172,333, 22,320],
  ],
};
export const garmentTitle = { shirt: 'Shirt', trousers: 'Trousers', outfit: 'Shirt + trousers' };
export const samples = {
  shirt: 'Chest 34, waist 32, neck 15, shoulder 17, sleeve 22, shirt length 28.',
  trousers: 'Waist 32, hip 38, thigh 22, inseam 30, leg opening 14, trouser length 40.',
};
const digits = '०१२३४५६७८९';
const numbers = Object.fromEntries(Object.entries({
  one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,
  thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,
  twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,
  pandrah:15,solah:16,satrah:17,atharah:18,bees:20,bais:22,baais:22,tees:30,battis:32,
  batis:32,chauntis:34,chautis:34,chhattis:36,adtees:38,chalis:40,bayalis:42,
  'बारह':12,'चौदह':14,'पंद्रह':15,'पन्द्रह':15,'सोलह':16,'सत्रह':17,'अठारह':18,
  'बीस':20,'बाईस':22,'चौबीस':24,'अट्ठाईस':28,'तीस':30,'बत्तीस':32,'चौंतीस':34,
  'चौतीस':34,'छत्तीस':36,'अड़तीस':38,'चालीस':40,'बयालीस':42,
}));
const escRe = str => str.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const un = /\b(cm|centimet(?:er|re)s?|inch(?:es)?|in\b(?!\s+length))\b|इंच|सेंटीमीटर/iu;
const statedUnit = s => /^(cm|centimet|सेंटीमीटर)/iu.test(s) ? 'cm' : 'in';
const range = (value,unit) => Number.isFinite(value) && value >= (unit === 'cm' ? 2.54 : 1) && value <= (unit === 'cm' ? 254 : 100);
export function validValue(value,unit) {
  return /^(?:\d{1,3})(?:\.\d{1,2})?$/u.test(String(value).trim()) && range(Number(value),unit);
}
function normalizePart(text) {
  return text.toLowerCase().normalize('NFC').replace(/[०-९]/g,x=>String(digits.indexOf(x)))
    .replace(/[।]/gu,'.').replace(/[¼½¾]/gu,x=>x==='¼'?'.25':x==='½'?'.5':'.75')
    .replace(/(\d)\s*\b(?:and a half|point five)\b/gu,'$1.5')
    .replace(/(\d)\s*\bpoint\s+(\d)\b/gu,'$1.$2');
}
const wordRe = new RegExp('(?<![\\p{L}\\p{M}])(?:'+Object.keys(numbers).map(escRe).join('|')+')(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?(?![\\p{L}\\p{M}])','gu');
function numericText(text) {
  return text.replace(wordRe, word => {
    const parts = word.split(/[ -]/);
    const first = numbers[parts[0]];
    return parts.length === 2 && first >= 20 && first % 10 === 0 ? String(first + numbers[parts[1]]) : parts.length === 1 ? String(first) : word;
  }).replace(/(\d+)\s+and a half\b/gu,'$1.5');
}
export function parseTranscript(text, garment, unit, previous = {}) {
  const source = normalizePart(text);
  const fields = garmentFields[garment] || [];
  const names = new Map(fields.flatMap(([key,,aliases]) => aliases.map(n=>[n,key])));
  if (!names.size) return { values:{}, flagged:{}, notices:[] };
  const body = [...names.keys()].sort((a,b)=>b.length-a.length).map(escRe).join('|');
  const hits = [...source.matchAll(new RegExp('(?<![\\p{L}\\p{M}])('+body+')(?![\\p{L}\\p{M}])','gu'))];
  const values = {}, flagged = {}, notices = [];
  for (let i=0;i<hits.length;i++) {
    const h = hits[i], key = names.get(h[0]);
    const segment = numericText(source.slice(h.index+h[0].length,hits[i+1]?.index ?? source.length));
    const boundary = segment.search(/[;,]|\.(?!\d)/u);
    // A comma followed by another number might be alternates: keep it ambiguous.
    const beforeBreak = boundary >= 0 && !/^[;,]\s*(?:\d|actually\b|correction\b|make that\b|नहीं|\bnahi\b)/iu.test(segment.slice(boundary)) ? segment.slice(0,boundary) : segment;
    const matches = [...beforeBreak.matchAll(/(?<![\d.])(-?\d+(?:\.\d+)?)(?!\d|\.\d)/gu)];
    const explicitUnit = beforeBreak.match(un);
    const prior = values[key] ?? previous[key]?.value ?? previous[key];
    const clearCorrection = /(?:\b(?:change|correct|make)\b\s*|नहीं\s*)$/iu.test(source.slice(Math.max(0,h.index-18),h.index))
      || /\b(?:actually|correction|make that)\b|नहीं|\bnahi\b/iu.test(beforeBreak);
    let reason = '';
    let candidate = matches.at(-1)?.[0];
    if (!candidate) reason = 'No number heard';
    else if (matches.length === 1 && /\bnot\b|नहीं|\bnahi\b/iu.test(beforeBreak)) reason = 'Number was negated';
    else if (explicitUnit && statedUnit(explicitUnit[0]) !== unit) reason = 'Unit does not match this slip';
    else if (matches.length > 1 && !clearCorrection) reason = 'More than one number heard';
    else if (!validValue(candidate,unit)) reason = 'Outside the accepted range';
    else if (prior !== undefined && prior !== '' && Number(prior) !== Number(candidate) && !clearCorrection) reason = 'Different from the captured number';
    if (reason) {
      flagged[key] = { reason, candidate: candidate ?? '', canUse: !!candidate && validValue(candidate,unit) && (!explicitUnit || statedUnit(explicitUnit[0]) === unit) && matches.length === 1 && reason !== 'Number was negated' };
      continue;
    }
    values[key] = Number(candidate);
    if (clearCorrection) delete flagged[key];
  }
  if (!hits.length) notices.push('No measurement names found. Try “chest 34” or enter the values directly.');
  if (/\b(?:pants|trousers|shirt)\b/iu.test(source) && /\b(?:next|switch)\b/iu.test(source)) notices.push('This clip only updates the active garment. Use Next to switch.');
  return { values, flagged, notices };
}
