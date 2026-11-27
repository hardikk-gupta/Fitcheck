import { garmentFields, garmentTitle, samples, validValue, parseTranscript } from './fit.js';
import { drawGarment } from './garment.js';

const $ = (sel, root=document) => root.querySelector(sel);
const main = $('#main');
const storageKey = 'fitcheck/slips/v1';
const mic = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8"/></svg>';
const arrow = '<svg class="arrow-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4m-6 0h6v6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const dateFmt = new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'});
const getSlips = () => {
  try { const s = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(s) ? s : []; }
  catch { return []; }
};
const confirmScreen = () => confirm('Leave this fitting? Any changes since opening it will be lost.');
let slips = getSlips();
let screen = 'home';
let slip = null;
let active = 'shirt';
let phase = 'ready';
let dirty = false;
let message = '';
let recorder = null;
let stream = null;
let timer = null;
let limit = null;
let audioRequest = null;
let engine = 'loading';
let storageError = false;

function live(text) { $('#live').textContent = text; }
function paintCount() { $('#saved-count').textContent = slips.length; }
function day() { return dateFmt.format(new Date()).toUpperCase(); }
function fresh(type) {
  return { id:crypto.randomUUID(), name:'', unit:'in', type, createdAt:Date.now(), updatedAt:Date.now(),
    pieces:{ shirt:{ values:{},flags:{},transcript:'',source:'' }, trousers:{ values:{},flags:{},transcript:'',source:'' } } };
}
function current() { return slip.pieces[active]; }
function pieces() { return slip.type==='outfit' ? ['shirt','trousers'] : [slip.type]; }
function captured(type) { return Object.keys(slip.pieces[type].values).length; }
function flagsCount() { return pieces().reduce((n,type)=>n+Object.keys(slip.pieces[type].flags).length,0); }
function existingCount() { return pieces().reduce((n,type)=>n+captured(type),0); }
function refreshEngine() {
  fetch('/api/health',{ cache:'no-store' }).then(r=>r.ok?r.json():null).then(data=>{
    engine = data?.voiceStatus || 'unavailable';
    if(engine==='loading') setTimeout(refreshEngine,1200);
  }).catch(()=>{engine='unavailable'}).finally(()=>{
    const node = $('.engine-status');
    if(node) node.innerHTML = engineLabel();
  });
}
function engineLabel() {
  return engine==='ready' ? '<i></i> LOCAL TRANSCRIPTION' : engine==='loading' ? 'CHECKING VOICE ENGINE' : 'VOICE ENGINE NOT AVAILABLE';
}
function navigate(target, { force=false } = {}) {
  if (phase!=='ready') { live('Finish or cancel recording before leaving.'); return; }
  if (!force && dirty && !confirmScreen()) return;
  dirty = false;
  message = '';
  screen = target;
  render();
  window.scrollTo(0,0);
  main.focus({preventScroll:true});
}
function openFitting(type, id) {
  const saved = id ? slips.find(s=>s.id===id) : null;
  if (id && !saved) return;
  slip = saved ? clone(saved) : fresh(type);
  active = slip.type==='trousers'?'trousers':'shirt';
  navigate('capture',{force:true});
  live(garmentTitle[slip.type]+' fitting opened.');
}
function render() {
  paintCount();
  if (screen==='capture') renderCapture();
  else if(screen==='index') renderIndex();
  else renderHome();
  const busy = screen==='capture' && phase!=='ready';
  $('#open-index').disabled = busy;
}
function renderHome() {
  main.innerHTML = '<section class="home"><div class="notebook-head"><span>FIELD BOOK / 01</span><span>'+day()+'</span></div><div class="intro"><div><h1>Start a fitting<span>.</span></h1><p>Say the measurements while you work. Check them on the garment before saving the slip.</p></div><div class="tape" aria-hidden="true"><span>IN</span><span>01</span><span>02</span><span>03</span></div></div><div class="catalog-label"><h2>Choose what you’re fitting</h2><span>01—03 / GARMENTS</span></div><div class="catalog">'+[
    ['shirt','01','6 measurements'],
    ['trousers','02','6 measurements'],
    ['outfit','03','2 garments · 12 measurements'],
  ].map(([kind,n,caption])=>'<button class="garment-card" data-kind="'+kind+'"><span class="card-top"><span>FIG. '+n+'</span>'+arrow+'</span><span class="tile-art">'+drawGarment(kind,{},{},'in',{icon:true,id:'tile-'+kind})+'</span><span class="card-caption"><strong>'+garmentTitle[kind]+'</strong><small>'+caption+'</small></span></button>').join('')+'</div><p class="privacy-line"><span aria-hidden="true">→</span> No account. Voice is processed on the computer running Fit Check. Saved slips stay in this browser.</p></section>';
  main.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>openFitting(b.dataset.kind));
}
function renderIndex() {
  const ordered = [...slips].sort((a,b)=>b.updatedAt-a.updatedAt);
  main.innerHTML = '<section class="home archive"><button class="back-link" id="back-home">← Fitting notebook</button><div class="intro"><div><h1>Saved slips<span>.</span></h1><p>Reopen a fitting to check a number or fill in what’s missing.</p></div></div><div class="slip-list">'+(ordered.length?ordered.map(s=>{
    const ps=s.type==='outfit'?['shirt','trousers']:[s.type];
    const count=ps.reduce((n,k)=>n+Object.keys(s.pieces[k].values).length,0);
    const hasSample=ps.some(k=>Object.values(s.pieces[k].values).some(v=>v.source==='Sample'));
    return '<button class="slip-row" data-slip="'+esc(s.id)+'"><span><strong>'+esc(s.name || 'Unnamed fitting')+'</strong><small>'+garmentTitle[s.type]+' · '+count+'/'+(ps.length*6)+' captured · '+s.unit+(hasSample?' · Includes sample data':'')+'</small></span><span class="slip-date">'+dateFmt.format(new Date(s.updatedAt))+' '+arrow+'</span></button>';
  }).join(''):'<div class="empty"><p>No saved slips yet.</p><button id="new-fitting" class="primary">Start a fitting '+arrow+'</button></div>')+'</div></section>';
  $('#back-home').onclick=()=>navigate('home');
  if($('#new-fitting')) $('#new-fitting').onclick=()=>navigate('home');
  main.querySelectorAll('[data-slip]').forEach(b=>b.onclick=()=>openFitting(null,b.dataset.slip));
}
function renderCapture(focus) {
  const c=current(), total=pieces().length*6, capturedTotal=existingCount(), reviewTotal=flagsCount();
  const isOutfit=slip.type==='outfit', hasNext=isOutfit&&active==='shirt';
  const busy=phase!=='ready';
  const fields=garmentFields[active];
  const existing=!!c.transcript;
  const voiceCopy=phase==='recording'?'Speak now. Say the field name, then the number.':phase==='processing'?'Turning your audio into measurements.':phase==='permission'?'Allow your browser to use the microphone.':'Say the field name, then the number. For example: “'+(active==='shirt'?'chest 34, sleeve 22':'waist 32, inseam 30')+'”.';
  const button=phase==='recording'?'Stop & transcribe':phase==='processing'?'Transcribing…':phase==='permission'?'Opening microphone…':'Record measurements';
  main.innerHTML = '<section class="fitting"><div class="notebook-head"><button class="back-link" id="back-home" '+(busy?'disabled':'')+'>← Fitting notebook</button><span>'+(slips.some(s=>s.id===slip.id)?'SAVED SLIP':'NEW SLIP')+' / '+garmentTitle[slip.type].toUpperCase()+'</span></div>'
    +'<div class="fit-header"><div><span class="eyebrow">FITTING SLIP</span><h1>'+garmentTitle[slip.type]+'<span>.</span></h1></div><div class="fit-options"><label class="name-label">Customer <span>optional</span><input id="customer" type="text" maxlength="60" autocomplete="off" placeholder="e.g. Aman" value="'+esc(slip.name)+'" '+(busy?'disabled':'')+'></label><fieldset class="units" '+(busy?'disabled':'')+'><legend>Unit</legend><button type="button" data-unit="in" aria-pressed="'+(slip.unit==='in')+'">in</button><button type="button" data-unit="cm" aria-pressed="'+(slip.unit==='cm')+'">cm</button></fieldset></div></div>'
    +(isOutfit?'<nav class="step-tabs" aria-label="Garment">'+pieces().map((k,i)=>'<button data-piece="'+k+'" '+(busy?'disabled':'')+(k===active?' aria-current="step"':'')+'><span>0'+(i+1)+'</span>'+garmentTitle[k]+'<small>'+captured(k)+'/6</small></button>').join('')+'</nav>':'')
    +'<div class="workbench"><div class="diagram-panel"><div class="panel-head"><div><span class="eyebrow">GARMENT DIAGRAM</span><h2>'+garmentTitle[active]+'</h2></div><span class="panel-index">FIG. '+(active==='shirt'?'01':'02')+'</span></div><div class="diagram">'+drawGarment(active,c.values,c.flags,slip.unit,{id:'active-'+active})+'</div><div class="diagram-footer"><span><i class="dot"></i> Captured</span><span><i class="dot review"></i> Check</span><span><i class="dot missing"></i> Blank</span></div></div>'
    +'<div class="entry"><section class="capture-panel" aria-labelledby="voice-title"><div class="panel-head"><div><span class="eyebrow">01 / CAPTURE</span><h2 id="voice-title">Say it out loud.</h2></div><span class="engine-status">'+engineLabel()+'</span></div><p>'+voiceCopy+'</p><div class="record-actions"><button class="primary record '+(phase==='recording'?'recording':'')+'" id="record" '+(['permission','processing'].includes(phase)?'disabled':'')+'>'+(phase==='recording'?'<span class="stop-square"></span>':mic)+'<span>'+button+'</span>'+(phase==='recording'?'<span id="elapsed" aria-hidden="true">0:00</span>':'')+'</button>'+(phase==='processing'||phase==='permission'||phase==='recording'?'<button class="text-button" id="cancel-capture">Cancel</button>':'')+'</div>'
    +'<div class="alternates"><label class="language">Speech <select id="speech-language" '+(busy?'disabled':'')+'><option value="auto">Auto detect</option><option value="en">English</option><option value="hi">Hindi / Hinglish</option><option value="pa">Punjabi</option></select></label><label class="file-label '+(busy?'disabled':'')+'">Upload audio<input id="audio-file" type="file" accept="audio/*,.webm,.mp4" '+(busy?'disabled':'')+'></label><button id="use-sample" class="text-button" '+(busy?'disabled':'')+'>Try a sample</button></div>'
    +(message?'<div class="status-note" role="status">'+esc(message)+(Object.keys(c.flags).length?'<button id="jump-to-review" class="text-button">Review flagged fields</button>':'')+'</div>':'')
    +'<details '+(existing?'open':'')+' class="transcript"><summary>'+(existing?'Transcript · '+esc(c.source):'Type or paste dictation (including Wispr Flow)')+'</summary><textarea id="transcript" maxlength="1000" aria-label="Measurement transcript" placeholder="Chest 34, sleeve 22" '+(busy?'disabled':'')+'>'+esc(c.transcript)+'</textarea><button class="secondary" id="apply-text" '+(busy?'disabled':'')+'>Find measurements '+arrow+'</button></details></section>'
    +'<section class="review-panel" aria-labelledby="review-title"><div class="panel-head"><div><span class="eyebrow">02 / REVIEW</span><h2 id="review-title">Check the slip.</h2></div><span class="panel-index">'+captured(active)+'/6 CAPTURED</span></div><p>Compare the numbers with your tape. Unsure? Leave the field blank.</p><div class="field-list">'+fields.map(([key,label])=>fieldRow(key,label,c)).join('')+'</div></section></div></div>'
    +'<div class="savebar"><div><strong>'+capturedTotal+' of '+total+' captured</strong><span>'+(reviewTotal?reviewTotal+' to check before saving':(capturedTotal<total?'Unmeasured fields stay blank.':'All fields captured. Check once before saving.'))+'</span></div><div>'+(hasNext?'<button id="next-piece" class="secondary" '+(busy?'disabled':'')+'>Next: trousers →</button>':'')+'<button class="primary" id="save" '+(busy||!capturedTotal||reviewTotal?'disabled':'')+'>Save fitting '+arrow+'</button></div></div></section>';
  bindCapture(c);
  if (focus) document.getElementById(focus)?.focus({preventScroll:true});
}
function fieldRow(key,label,c) {
  const data=c.values[key], flag=c.flags[key];
  return '<div class="measurement '+(flag?'flagged':'')+'" id="row-'+key+'"><div class="measure-line"><div><label for="field-'+key+'">'+label+'</label><span class="field-status" id="status-'+key+'">'+(flag?'Check':data?data.source==='Manual'?'Entered':data.source==='Sample'?'Sample':'Captured':'Not measured')+'</span></div><div class="value-wrap"><input id="field-'+key+'" inputmode="decimal" autocomplete="off" maxlength="6" aria-describedby="status-'+key+(flag?' flag-'+key:'')+'" data-measure="'+key+'" placeholder="—" value="'+esc(data?.value)+'" '+(phase!=='ready'?'disabled':'')+'><span>'+slip.unit+'</span></div></div>'
    +(flag?'<div class="flag-detail" id="flag-'+key+'"><span>'+esc(flag.reason)+(flag.candidate?' · heard '+esc(flag.candidate):'')+'</span><div>'+(flag.canUse?'<button class="text-button" data-use="'+key+'">Use '+esc(flag.candidate)+'</button>':'')+'<button class="text-button" data-keep="'+key+'">'+(data?'Keep '+esc(data.value):'Leave blank')+'</button></div></div>':'')+'</div>';
}
function changePiece(k) {
  if(phase!=='ready'||active===k) return;
  active=k; message=''; renderCapture(); $('#voice-title').setAttribute('tabindex','-1'); $('#voice-title').focus();
}
let language = 'auto';
function bindCapture(c) {
  $('#back-home').onclick=()=>navigate('home');
  $('#customer').oninput=e=>{slip.name=e.target.value;dirty=true;};
  main.querySelectorAll('[data-unit]').forEach(b=>b.onclick=()=>{
    if(slip.unit===b.dataset.unit)return;
    if((existingCount()||flagsCount())&&!confirm('Change units and clear all captured measurements? Existing numbers will not be converted.'))return;
    slip.unit=b.dataset.unit; pieces().forEach(k=>slip.pieces[k]={ values:{},flags:{},transcript:'',source:'' });
    dirty=true; message=''; renderCapture();
  });
  main.querySelectorAll('[data-piece]').forEach(b=>b.onclick=()=>changePiece(b.dataset.piece));
  if($('#next-piece'))$('#next-piece').onclick=()=>changePiece('trousers');
  $('#record').onclick=()=>phase==='recording'?finishRecording():startRecording();
  if($('#cancel-capture'))$('#cancel-capture').onclick=cancelCapture;
  $('#speech-language').value=language;
  $('#speech-language').onchange=e=>{language=e.target.value;};
  $('#audio-file').onchange=e=>{const file=e.target.files[0]; if(file)processAudio(file);};
  $('#use-sample').onclick=()=>applyTranscript(samples[active],'Sample');
  $('#apply-text').onclick=()=>applyTranscript($('#transcript').value,'Typed / pasted');
  $('#transcript').oninput=e=>{c.transcript=e.target.value;c.source='Typed / pasted';dirty=true;};
  main.querySelectorAll('[data-measure]').forEach(input=>{
    input.oninput=()=>{input.setCustomValidity('');};
    input.onchange=()=>editField(input);
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if(editField(input))input.blur();}};
  });
  $('.diagram').onclick=e=>{ const p=e.target.closest('[data-field]'); if(p) focusField(p.dataset.field); };
  $('.diagram').onkeydown=e=>{ const p=e.target.closest('[data-field]'); if(p&&['Enter',' '].includes(e.key)){e.preventDefault();focusField(p.dataset.field);} };
  main.querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>resolveFlag(b.dataset.use,true));
  main.querySelectorAll('[data-keep]').forEach(b=>b.onclick=()=>resolveFlag(b.dataset.keep,false));
  if($('#jump-to-review')) $('#jump-to-review').onclick=()=>focusField(Object.keys(c.flags)[0]);
  $('#save').onclick=save;
}
function focusField(key) {
  const el=$('#field-'+key);
  el?.focus();
  el?.select();
}
function editField(input) {
  const key=input.dataset.measure, raw=input.value.trim(), c=current();
  if (raw && !validValue(raw,slip.unit)) {
    input.setCustomValidity('Enter a valid '+(slip.unit==='in'?'number from 1 to 100 inches.':'number from 2.54 to 254 cm.'));
    input.reportValidity();
    return false;
  }
  const prior = c.values[key];
  if(!c.flags[key] && (raw ? prior?.value === Number(raw) : !prior)) return true;
  if(raw) c.values[key]={value:Number(raw),source:'Manual'};
  else delete c.values[key];
  delete c.flags[key]; dirty=true;
  // Update in place around the input so tabbing and pointer clicks aren't lost.
  input.value=raw?String(Number(raw)):'';
  updateReview(key);
  return true;
}
function updateReview(key) {
  const c=current();
  $('#row-'+key).classList.remove('flagged');
  $('#status-'+key).textContent=c.values[key]?(c.values[key].source==='Manual'?'Entered':c.values[key].source==='Sample'?'Sample':'Captured'):'Not measured';
  $('#flag-'+key)?.remove();
  $('#field-'+key).setAttribute('aria-describedby','status-'+key);
  $('.diagram').innerHTML=drawGarment(active,c.values,c.flags,slip.unit,{id:'active-'+active});
  $('.review-panel .panel-index').textContent=captured(active)+'/6 CAPTURED';
  const step=$('[data-piece="'+active+'"] small'); if(step)step.textContent=captured(active)+'/6';
  const count=existingCount(), check=flagsCount(), total=pieces().length*6;
  $('.savebar strong').textContent=count+' of '+total+' captured';
  $('.savebar > div > span').textContent=check?check+' to check before saving':count<total?'Unmeasured fields stay blank.':'All fields captured. Check once before saving.';
  $('#save').disabled=!count||!!check;
}
function resolveFlag(key,use) {
  const c=current(), f=c.flags[key]; if(!f)return;
  if(use && f.canUse) c.values[key]={value:Number(f.candidate),source:'Manual'};
  delete c.flags[key]; dirty=true; renderCapture('field-'+key);
}
function applyTranscript(text, source) {
  const c=current(), clean=text.trim().slice(0,1000);
  if(!clean){message='There’s no transcript yet. Record, upload, or type a measurement.';renderCapture('transcript');return;}
  const {values,flagged,notices}=parseTranscript(clean,active,slip.unit,c.values);
  Object.entries(values).forEach(([key,value])=>{
    c.values[key]={ value,source }; delete c.flags[key];
  });
  Object.assign(c.flags,flagged);
  c.transcript=clean; c.source=source; dirty=true;
  const n=Object.keys(values).length, flag=Object.keys(flagged).length;
  message=[source==='Sample'?'Sample data, not a recording.':'',n? n+' '+(n===1?'number captured.':'numbers captured.'):'', flag?flag+' '+(flag===1?'field needs a check.':'fields need a check.'):'',...notices].filter(Boolean).join(' ');
  live(message);
  renderCapture('record');
}
async function startRecording() {
  if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    message='Microphone needs a supported browser on localhost or HTTPS. You can upload audio or paste dictation.';
    renderCapture('record');return;
  }
  if(engine==='loading'){message='The local voice engine is warming up. Try again in a moment.';renderCapture('record');return;}
  if(engine==='unavailable'){message='Local voice engine is unavailable. Type or paste dictation to continue.';renderCapture('record');return;}
  const token={}; audioRequest=token; phase='permission'; message=''; renderCapture();
  try {
    const capturedStream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(audioRequest!==token){capturedStream.getTracks().forEach(t=>t.stop());return;}
    stream=capturedStream;
    recorder=new MediaRecorder(stream);
    const clips=[];
    recorder.ondataavailable=e=>{if(e.data.size)clips.push(e.data);};
    recorder.onstop=()=>{
      releaseMic();
      if(audioRequest!==token)return;
      processAudio(new Blob(clips,{type:clips[0]?.type||'audio/webm'}));
    };
    recorder.onerror=()=>{
      if(audioRequest!==token)return;
      cancelCapture();
      message='Recording was interrupted. Try again or upload a clip.';
      renderCapture('record');
    };
    recorder.start(); phase='recording'; renderCapture('record');
    const started=Date.now();
    timer=setInterval(()=>{const node=$('#elapsed'); if(node)node.textContent='0:'+String(Math.floor((Date.now()-started)/1000)).padStart(2,'0');},250);
    limit=setTimeout(finishRecording,30000);
  } catch(error) {
    if(audioRequest!==token)return;
    releaseMic(); phase='ready'; audioRequest=null;
    message=error.name==='NotAllowedError'?'Microphone permission denied. Allow access in your browser or upload a clip.':'Could not open the microphone. Try uploading a clip.';
    renderCapture('record'); live(message);
  }
}
function releaseMic() {
  clearInterval(timer); clearTimeout(limit);
  stream?.getTracks().forEach(t=>t.stop());
  stream=null; recorder=null;
}
function finishRecording(){
  if(recorder?.state==='recording'){ clearTimeout(limit); clearInterval(timer); recorder.stop(); }
}
function cancelCapture() {
  audioRequest?.controller?.abort(); audioRequest=null;
  if(recorder?.state==='recording')recorder.stop();
  releaseMic(); phase='ready'; message='Capture cancelled.'; renderCapture('record');
}
async function processAudio(blob) {
  if(blob.size===0||blob.size>8*1024*1024){phase='ready';audioRequest=null;message='Choose a non-empty audio clip under 8 MB and no longer than 30 seconds.';renderCapture('record');return;}
  const controller=new AbortController(); const token={controller};
  audioRequest=token; phase='processing'; message=''; renderCapture();
  const timeout=setTimeout(()=>controller.abort(),90000);
  try {
    const response=await fetch('/api/transcribe?language='+encodeURIComponent(language)+'&garment='+encodeURIComponent(active),{
      method:'POST',body:blob,headers:{'Content-Type':blob.type||'application/octet-stream'},signal:controller.signal,
    });
    const data=await response.json();
    if(!response.ok)throw Error(data.error || 'Transcription did not finish.');
    if(audioRequest!==token)return;
    phase='ready'; audioRequest=null;
    if (!data.text) {message='No clear speech detected. Try a shorter recording or type the measurement.';renderCapture('record');return;}
    applyTranscript(data.text,'Local voice');
  } catch(error) {
    if(audioRequest!==token)return;
    phase='ready';audioRequest=null;
    message=error.name==='AbortError'?'Transcription timed out. Try a shorter clip.':error.message;
    live(message);renderCapture('record');
  } finally { clearTimeout(timeout); }
}
function save() {
  if(flagsCount()||!existingCount())return;
  const invalid=[...main.querySelectorAll('[data-measure]')].find(input=>input.value.trim()&&!validValue(input.value,slip.unit));
  if(invalid){editField(invalid);invalid.focus();return;}
  slip.updatedAt=Date.now();
  // Do not retain the raw transcript in the saved record.
  const record=clone(slip);
  for(const p of Object.values(record.pieces)){p.transcript='';p.source='';}
  const next=[record,...slips.filter(s=>s.id!==slip.id)];
  try { localStorage.setItem(storageKey,JSON.stringify(next));storageError=false; }
  catch { storageError=true; }
  if(storageError){message='The browser could not save this slip. Check storage permissions and try again.';renderCapture('save');return;}
  slips=next; navigate('index',{force:true}); live('Fitting saved.');
}
$('.mark').onclick=e=>{e.preventDefault();navigate('home');};
$('#open-index').onclick=()=>navigate('index');
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
render();
refreshEngine();
