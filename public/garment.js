import { garmentFields, garmentTitle } from './fit.js';

const shirt = 'M199 83 225 65Q242 78 264 65L287 82 339 97 386 183 329 207 312 170 314 317Q239 343 167 318L169 169 152 207 95 183 141 97Z';
const trousers = 'M165 57Q242 42 317 57L328 120 326 191 310 342 251 342 241 190 230 342 171 342 154 188 154 120Z';
const shape = (type,id) => {
  const stroke = '#496052';
  const fabric = 'url(#cloth-'+id+')';
  const shade = 'url(#shade-'+id+')';
  if (type==='shirt') return '<path d="'+shirt+'" fill="'+fabric+'" stroke="'+stroke+'" stroke-width="1.7"/><path d="M199 83 171 170 168 317 181 322 186 176 218 99ZM286 83 313 169 314 317 300 321 297 172 273 100Z" fill="'+shade+'" opacity=".72"/><g fill="none" stroke="#617366" stroke-width="1.25"><path d="M98 176 152 198M383 176 329 198M171 309q68 24 142 0M239 97v231M246 98v231M142 99l31 52m164-52-27 52M257 136h32v27q-16 10-32 0z"/><path d="M218 69q22 17 47-3l13 19-20 21-15-13-16 13-20-22z" fill="#c3cfb9"/><path d="M225 72q19 10 38-2l-20 23z" fill="#839784"/></g><g fill="#566d5b"><circle cx="243" cy="120" r="2"/><circle cx="243" cy="157" r="2"/><circle cx="243" cy="194" r="2"/><circle cx="243" cy="231" r="2"/><circle cx="243" cy="268" r="2"/><circle cx="243" cy="305" r="2"/></g>';
  return '<path d="'+trousers+'" fill="'+fabric+'" stroke="'+stroke+'" stroke-width="1.7"/><path d="M160 119 166 181 184 343h15l-15-160 6-67 4-63-25 4ZM309 58l-13 63 8 63-14 157h20l18-152v-66z" fill="'+shade+'"/><g fill="none" stroke="#617366" stroke-width="1.35"><path d="M163 72q76-13 157 0M160 96q28 0 39-29m121 29q-26 0-38-29M242 73v70q-1 16-14 28M238 128v43l3 20M173 335h58m20 0h59"/><path d="M197 127 210 329m75-202-13 202" stroke-dasharray="4 4"/></g><circle cx="240" cy="62" r="2.4" fill="#496052"/>';
};
export function drawGarment(type, values = {}, flags = {}, unit = 'in', {icon=false,id=type} = {}) {
  const defs = '<defs><linearGradient id="cloth-'+id+'" x1="0" x2="1"><stop stop-color="#a7b9a4"/><stop offset=".48" stop-color="#e0e6d3"/><stop offset="1" stop-color="#a0b59e"/></linearGradient><linearGradient id="shade-'+id+'" x1="0" x2="1"><stop stop-color="#658473" stop-opacity=".45"/><stop offset="1" stop-color="#809486" stop-opacity=".14"/></linearGradient><pattern id="draft-'+id+'" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#ccd0c4" stroke-width=".75"/></pattern></defs>';
  if (icon) {
    if (type==='outfit') return '<svg viewBox="90 20 305 345" aria-hidden="true">'+defs+'<g transform="translate(51 145) scale(.64)">'+shape('trousers',id)+'</g><g transform="translate(46 -4) scale(.79)">'+shape('shirt',id)+'</g></svg>';
    return '<svg viewBox="'+(type==='shirt'?'74 46 336 304':'134 38 212 323')+'" aria-hidden="true">'+defs+shape(type,id)+'</svg>';
  }
  const h = 382;
  const guides = '<rect x="1" y="1" width="478" height="'+(h-2)+'" fill="url(#draft-'+id+')" opacity=".76"/><path d="M240 29v326M49 196h380" fill="none" stroke="#adb9ab" stroke-dasharray="4 7"/><path d="M20 29h14m-7-7v14m418-7h14m-7-7v14M20 349h14m-7-7v14m418-7h14m-7-7v14" stroke="#7e9080" fill="none"/>';
  const labels = garmentFields[type].map(([key,label,,x,y,lx,ly]) => {
    const state = flags[key] ? 'review' : values[key] ? 'captured' : 'missing';
    const anchor = lx > 240 ? 'end' : 'start';
    const tx = lx > 240 ? lx + 48 : lx;
    const lineEnd = lx > 240 ? tx-2 : tx+2;
    const bend = lx>240 ? x+22 : x-22;
    const value = values[key] ? String(values[key].value) + ' '+ unit : (flags[key]?'Check':'—');
    return '<g class="pin '+state+'" data-field="'+key+'" role="button" tabindex="0" aria-label="'+label+': '+value+'. Edit measurement"><path class="rule" d="M'+x+' '+y+'H'+bend+'L'+(bend+(lx>240?17:-17))+' '+(ly+4)+'H'+lineEnd+'"/><circle cx="'+x+'" cy="'+y+'" r="4"/><rect class="pin-hit" x="'+(anchor==='end'?tx-94:tx-8)+'" y="'+(ly-19)+'" width="100" height="49" rx="3"/><text class="pin-label" x="'+tx+'" y="'+(ly-2)+'" text-anchor="'+anchor+'">'+label+'</text><text class="pin-num" x="'+tx+'" y="'+(ly+24)+'" text-anchor="'+anchor+'">'+value+'</text></g>';
  }).join('');
  return '<svg viewBox="0 0 480 '+h+'" role="group" aria-label="'+garmentTitle[type]+' measurement diagram">'+defs+guides+shape(type,id)+labels+'</svg>';
}
