/* Stage 3 R2: preview stays local; formal Session writes only through authenticated Supabase RPCs. */
(async function(root){'use strict';
 const C=root.EvidenceJudgmentCore,$=id=>document.getElementById(id);
 const hash=new URLSearchParams(location.hash.slice(1));
 const parentQuery=new URLSearchParams(location.search);
 const sessionRequested=hash.get('session')==='1'||parentQuery.get('session')==='1';
 function showError(text){$('question').textContent='無法開啟活動';$('workspace').classList.add('hidden');$('source').textContent=text;$('copyEvidence').disabled=true;}
 const api=root.ClassroomSessionAPI;
 const context=sessionRequested?api?.getParticipantContext?.():null;
 if(sessionRequested&&(!context||context.mode!=="cloud")){
  showError('正式證據判斷活動必須由 QR Code 加入 Supabase Session，無法在本機預覽模式提交。');return;
 }
 async function decode(encoded){
  if(!encoded||!/^([uz])\./.test(encoded))throw Error('活動連結不完整');
  const bytes=atob(encoded.slice(2).replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-encoded.slice(2).length%4)%4));
  let buf=new Uint8Array([...bytes].map(c=>c.charCodeAt(0)));
  if(encoded[0]==='z'){
   if(typeof DecompressionStream!=='function')throw Error('此裝置不支援壓縮活動連結，請改用新版瀏覽器');
   const stream=new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
   buf=new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(buf));
 }
 let raw;try{raw=await decode(hash.get('data'));}catch(e){showError(e.message);return;}
 if(raw?.m!=='evidence-judgment'){showError('活動類型不相符');return;}
 const activity=C.normalize(raw.ej);
 const validation=C.validateSettings(activity);if(validation){showError(validation);return;}
 const stages=C.steps(activity);
 const identity=[hash.get('activityId')||raw.i||'standalone',hash.get('nodeRef')||'standalone'].map(x=>encodeURIComponent(x)).join(':');
 const nodeRef=hash.get('nodeRef')||'';
 // Standalone sessions and Course nodes never share local draft keys.
 const storageKey=`classroom-evidence-judgment-draft-v1:${sessionRequested?context.sessionId+':'+context.participantId+':':''}${identity}`;
 let draft;try{draft=C.normalizeDraft(JSON.parse(localStorage.getItem(storageKey)||'null'),activity);}catch{draft=C.blank();}
 let liveStage=1,liveRevision=0,liveSettled=false,liveClosed=false,submitted=false,busy=false,dirty=false;
 let versions=Object.fromEntries(stages.map(s=>[s,0]));
 let realtime=null,pollTimer=null,requestSerial=0,refreshInFlight=false,refreshQueued=false;
 // R4: Persist pending PERSONAL edits separately from the cloud-backed draft.
 // Version is the version at the start of editing, never the latest polled version.
 const pendingKey=`${storageKey}:pending-v2`;
 let pending={};
 if(sessionRequested){try{
   const stored=JSON.parse(localStorage.getItem(pendingKey)||'{}');
   if(stored&&typeof stored==='object'&&!Array.isArray(stored)){
     for(const phase of stages)if(Object.prototype.hasOwnProperty.call(stored,phase)&&
       Number.isSafeInteger(stored[phase])&&stored[phase]>=0){pending[phase]=stored[phase];versions[phase]=stored[phase];}
   }
 }catch{}}
 function persistPending(){if(!sessionRequested)return;
   try{if(Object.keys(pending).length)localStorage.setItem(pendingKey,JSON.stringify(pending));
    else localStorage.removeItem(pendingKey);}catch{}
 }
 function save(markDirty=true){
   if(sessionRequested&&markDirty){const phase=stages[draft.phase];
     if(phase&&!(phase in pending))pending[phase]=versions[phase]||0;
     dirty=!!(phase&&phase in pending);persistPending();
   }
   try{localStorage.setItem(storageKey,JSON.stringify(draft));}catch{}
 }
 function clearPending(phase){delete pending[phase];persistPending();dirty=!!pending[stages[liveStage-1]];}
 function displayNote(note){$('storageNote').textContent=note;}
 function payloadFor(phase){const j=draft[phase];return phase==='evidence'?draft.evidence:j;}
 function copyRemotePhase(row){const phase=row.phase;if(!stages.includes(phase))return;
   if(Object.prototype.hasOwnProperty.call(pending,phase))return;
   versions[phase]=Number(row.version)||0;
   const value=row.payload||{};
   if(phase==='evidence')draft.evidence={quote:String(value.quote||''),relation:String(value.relation||''),judgment:C.normalizeJudgment(value.judgment,activity)};
   else draft[phase]=C.normalizeJudgment(value,activity);
 }
 // R3 group evidence is an optional, independent record, never a replacement for personal evidence.
 let groupTicket=0,groupIdentity='',groupVersion=0,groupDirty=false,groupBusy=false,groupRemote=null,groupMeta=null,groupNoticeOverride='';
 // R5: A slow group GET must not be invalidated by every polling tick.
 let groupRefreshInFlight=false,groupRefreshQueued=false,groupRefreshForce=false;
 const blankGroup=()=>({judgment:C.blank().initial,quote:'',relation:'',discussion:''});
 let groupDraft=blankGroup();
 const groupFields=['groupReason','groupOpen','groupQuote','groupRelation','groupDiscussion'];
 function groupCacheKey(id){return `${storageKey}:group:${encodeURIComponent(id)}`;}
 function readGroupCache(id){try{return JSON.parse(localStorage.getItem(groupCacheKey(id))||'null');}catch{return null;}}
 function saveGroupCache(){if(!groupIdentity)return;groupDirty=true;groupNoticeOverride='';
   try{localStorage.setItem(groupCacheKey(groupIdentity),JSON.stringify({draft:groupDraft,baseVersion:groupVersion,dirty:true}));}catch{}
 }
 function applyGroupDraft(raw){const p=raw&&typeof raw==='object'?raw:{};
  groupDraft={judgment:C.normalizeJudgment(p.judgment,activity),quote:String(p.quote||'').slice(0,2000),
   relation:String(p.relation||'').slice(0,2000),discussion:String(p.discussion||'').slice(0,2000)};
 }
 function renderGroupForm(){const host=$('groupChoices');host.replaceChildren();
  const j=groupDraft.judgment;
  $('groupOpenLabel').classList.toggle('hidden',activity.responseMode!=='open');
  $('groupOpen').classList.toggle('hidden',activity.responseMode!=='open');
  $('groupOpen').value=j.open;
  if(activity.responseMode!=='open')for(const o of activity.options){
   const label=document.createElement('label');label.className='choice';
   const input=document.createElement('input');input.type=activity.responseMode==='single'?'radio':'checkbox';input.name='groupJudgment';input.value=o.id;input.checked=j.choices.includes(o.id);
   input.addEventListener('change',()=>{if(activity.responseMode==='single')j.choices=[o.id];
    else j.choices=input.checked?[...new Set([...j.choices,o.id])]:j.choices.filter(x=>x!==o.id);saveGroupCache();});
   const text=document.createElement('span');text.textContent=o.label;label.append(input,text);host.append(label);
  }
  $('groupReason').value=j.reason;$('groupQuote').value=groupDraft.quote;
  $('groupRelation').value=groupDraft.relation;$('groupDiscussion').value=groupDraft.discussion;
 }
 function reflectGroup(){const visible=sessionRequested&&activity.groupEnabled&&stages[liveStage-1]==='evidence';
  $('groupPanel').classList.toggle('hidden',!visible);
  if(!visible)return;
  const m=groupMeta,assigned=m?.assigned===true,rep=assigned&&m.is_representative===true;
  const canEdit=rep&&submitted&&!liveSettled&&!liveClosed&&!groupBusy;
  $('groupTitle').textContent=assigned?`${m.label||'本組'}｜小組共同證據`:'小組證據交流';
  $('groupMeta').textContent=!m?'正在同步小組分配…':!assigned?'尚未分組，請老師先完成分組。':
   `${m.member_count||0} 位成員 · ${rep?'你是小組代表':'組員檢視模式'} · ${m.submission?'已有共同成果':'尚無共同成果'}`;
  $('groupPrompt').textContent=activity.discussionPrompt;
  $('groupPanel').querySelectorAll('textarea,input').forEach(el=>el.disabled=!canEdit);
  $('groupSave').disabled=!canEdit;
  $('groupRestore').disabled=!assigned||groupBusy;
  if(!assigned)$('groupNotice').textContent='請先由教師進行分組。';
  else if(!rep)$('groupNotice').textContent='只有小組代表可以提交；這裡會同步顯示共同成果。';
  else if(!submitted)$('groupNotice').textContent='代表需先提交自己的證據，才能提交小組成果。';
  else if(groupDirty)$('groupNotice').textContent='尚未儲存的小組草稿保留於本機；如雲端已變更，提交時會檢查版本。';
  else $('groupNotice').textContent=`小組成果${m.submission?'已儲存於雲端':'尚未提交'}，可討論後由代表更新。`;
  if(groupNoticeOverride)$('groupNotice').textContent=groupNoticeOverride;
 }
 async function refreshGroup(force=false){
  if(!sessionRequested||!activity.groupEnabled||stages[liveStage-1]!=='evidence'){
   ++groupTicket; // invalidate a request belonging to the previously active phase
   groupMeta=null;
   $('groupPanel').classList.add('hidden');return;
  }
  if(groupRefreshInFlight){
   groupRefreshQueued=true;
   groupRefreshForce=groupRefreshForce||force;
   return;
  }
  groupRefreshInFlight=true;
  const ticket=++groupTicket;
  try{
   const result=await api.studentEvidenceGroup(nodeRef);
   if(ticket!==groupTicket||stages[liveStage-1]!=='evidence')return;
   // R4: reject a group snapshot from a different stage/revision.
   if((result.current_stage!=null&&Number(result.current_stage)!==liveStage)||
     (result.revision!=null&&liveRevision>0&&Number(result.revision)!==liveRevision)){
     groupMeta=null;$('groupPanel').classList.add('hidden');$('groupSave').disabled=true;void refreshCloud();return;
   }
   if(String(result.node_ref||'')!==(context.sessionKind==='course'?nodeRef:'')){
     groupMeta=null;groupRemote=null;$('groupPanel').classList.add('hidden');$('groupSave').disabled=true;return;
   }
   if(result.enabled!==true){$('groupPanel').classList.add('hidden');return;}
   const id=String(result.group_id||'');const changed=id!==groupIdentity;
   if(changed){groupIdentity=id;groupDirty=false;groupVersion=0;groupDraft=blankGroup();groupNoticeOverride='';
    const cached=id&&readGroupCache(id);if(cached?.dirty){groupDirty=true;groupVersion=Number(cached.baseVersion)||0;applyGroupDraft(cached.draft);}
   }
   groupMeta=result;groupRemote=result.submission||null;
   if(groupDirty && Number(result.submission?.version||0)!==groupVersion){
     groupNoticeOverride='雲端已有較新的小組成果；本機草稿仍保留。請確認內容後，再選擇重新載入雲端版本。';
   }
   if(id && (!groupDirty||force)){
    groupVersion=Number(result.submission?.version)||0;
    applyGroupDraft(result.submission?.payload||blankGroup());groupDirty=false;groupNoticeOverride='';
    try{localStorage.removeItem(groupCacheKey(id));}catch{}
   }
   if(changed||!groupDirty||force)renderGroupForm();reflectGroup();
  }catch(e){if(ticket!==groupTicket)return;
   groupMeta=null;groupRemote=null;
   $('groupPanel').classList.add('hidden');
   displayNote(`小組資料同步失敗：${e.message}。草稿仍保留於本機，確認目前活動後可重新整理。`);
   $('groupSave').disabled=true;
  }finally{
   groupRefreshInFlight=false;
   if(groupRefreshQueued){
    const nextForce=groupRefreshForce;
    groupRefreshQueued=false;groupRefreshForce=false;
    void refreshGroup(nextForce);
   }
  }
 }
 for(const [id,key,target] of [['groupReason','reason','judgment'],['groupOpen','open','judgment'],
  ['groupQuote','quote',''],['groupRelation','relation',''],['groupDiscussion','discussion','']]){
  $(id).addEventListener('input',()=>{if(target)groupDraft.judgment[key]=$(id).value;
   else groupDraft[key]=$(id).value;saveGroupCache();});
 }
 $('groupRestore').addEventListener('click',()=>{if(!groupMeta?.assigned)return;
  if(groupDirty&&!confirm('確定捨棄本機尚未提交的小組草稿，載入雲端成果？'))return;
  groupDirty=false;groupNoticeOverride='';groupVersion=Number(groupRemote?.version)||0;
  applyGroupDraft(groupRemote?.payload||blankGroup());try{localStorage.removeItem(groupCacheKey(groupIdentity));}catch{}
  renderGroupForm();reflectGroup();
 });
 $('groupSave').addEventListener('click',async()=>{
  if(!groupMeta?.is_representative||!submitted||groupBusy)return;
  const e=C.validateJudgment(groupDraft.judgment,activity);
  if(e){$('groupNotice').textContent=e;return;}
  if(activity.evidenceRequired&&(!groupDraft.quote.trim()||!groupDraft.relation.trim())){
   $('groupNotice').textContent='請填寫小組證據與證據關聯';return;
  }
  const editingGroup=groupIdentity;groupBusy=true;reflectGroup();
  try{
   const saved=await api.submitEvidenceGroup({nodeRef,payload:groupDraft,expectedVersion:groupVersion});
   if(editingGroup!==groupIdentity||String(saved.group_id)!==editingGroup)throw Error('分組已變更，請重新同步');
   ++groupTicket;groupVersion=Number(saved.version)||groupVersion+1;groupDirty=false;
   try{localStorage.removeItem(groupCacheKey(groupIdentity));}catch{}
   await refreshGroup(true);
   groupNoticeOverride='小組共同判斷已成功儲存到雲端。';
  }catch(e){groupNoticeOverride=`小組提交失敗：${e.message}。本機草稿仍保留；版本衝突時請先確認雲端成果。`;}
  finally{groupBusy=false;reflectGroup();}
 });
 function reflectState(){
   if(!sessionRequested)return;
   const phase=stages[Math.max(0,Math.min(liveStage-1,stages.length-1))];
   const locked=liveSettled||liveClosed||submitted||busy;
   $('next').disabled=locked;
   $('back').disabled=true;
   $('review').classList.add('hidden');$('reset').classList.add('hidden');
   const finished=liveStage===stages.length && submitted;
   const currentMessage=liveClosed?'Session 已關閉':liveSettled?'這項活動已結算':submitted?'已提交，等待老師切換至下一階段':busy?'正在保存到雲端…':`教師目前開放：${{initial:'初步判斷',evidence:'尋找證據',final:'再次判斷'}[phase]}`;
   const phasePending=Object.prototype.hasOwnProperty.call(pending,phase);
   const note=phasePending?'本機有尚未提交的個人草稿；不會被雲端同步覆蓋。提交時會檢查起始版本。':'';
   displayNote(`${currentMessage}。已提交的成果由 Supabase 保存；未提交草稿保留於本機。${note}`);
   const restore=$('personalRestore');if(restore){restore.classList.toggle('hidden',!phasePending);restore.disabled=busy;}
   $('workspace').querySelectorAll('textarea,input[type=checkbox],input[type=radio]').forEach(el=>el.disabled=locked);
   $('copyEvidence').disabled=locked;
   reflectGroup();
 }
 async function refreshCloud(force=false){
   if(!sessionRequested)return;
   // R4: do not starve a slow RPC by cancelling it on every 3-second poll.
   // Coalesce newer notifications into one follow-up fetch.
   if(refreshInFlight){refreshQueued=true;return;}
   refreshInFlight=true;
   const ticket=++requestSerial;
   try{
     const data=await api.studentEvidence(nodeRef);
     if(ticket!==requestSerial)return;
     if(String(data.node_ref||'')!==(context.sessionKind==='course'?nodeRef:''))throw Error('老師已切換活動，請返回課程頁面');
     const nextStage=Number(data.current_stage||1),oldStage=liveStage;
     liveRevision=Number(data.revision||0);liveSettled=data.settled===true;liveClosed=data.status!=='active';
     liveStage=Math.max(1,Math.min(nextStage,stages.length));
     const changedStage=oldStage!==liveStage;
     const newRows=Array.isArray(data.responses)?data.responses:[];
     const currentPhase=stages[liveStage-1];
     // Always refresh submitted phases unless there are pending edits to that phase.
     // In particular, a reload is NOT authorization to discard a local draft.
     for(const row of newRows)copyRemotePhase(row);
     dirty=Object.prototype.hasOwnProperty.call(pending,currentPhase);
     const currentRemote=newRows.find(r=>r.phase===currentPhase);
     submitted=!!currentRemote;
     draft.phase=liveStage-1;
     draft.completed=submitted&&liveStage===stages.length;
     if(draft.completed)draft.phase=stages.length;
     if(changedStage||!dirty||force)render();
     reflectState();
     // A draft may coexist with a newer cloud answer; never upgrade its CAS base.
     if(dirty&&currentRemote&&Number(currentRemote.version)!==pending[currentPhase]){
       displayNote('雲端已有其他版本，但本機個人草稿仍保留。請比較內容，必要時選擇「重新載入雲端個人答案」。');
     }
     if(activity.groupEnabled)void refreshGroup();
   }catch(e){
     if(ticket!==requestSerial)return;
     ++groupTicket;groupMeta=null;groupRemote=null;
     $('next').disabled=true;
     displayNote(`同步失敗：${e.message}。請確認網路連線；保留本機草稿，稍後重試。`);
     $('groupSave').disabled=true;$('groupPanel').classList.add('hidden');
   }finally{
     refreshInFlight=false;
     if(refreshQueued){refreshQueued=false;void refreshCloud();}
   }
 }
 async function submitCloud(){
   const phase=stages[liveStage-1];const err=C.validateStep(activity,draft,phase);
   if(err){$('error').textContent=err;return;}
   busy=true;reflectState();
   try{
     const result=await api.submitEvidence({nodeRef,phase,payload:payloadFor(phase),expectedVersion:versions[phase]||0});
     if((result.node_ref!=null&&String(result.node_ref)!==(context.sessionKind==='course'?nodeRef:''))||
       (result.phase!=null&&result.phase!==phase))
       throw Error('伺服器回傳了不同活動或階段的結果，請重新同步');
     ++requestSerial; // discard GETs initiated before the confirmed write
     versions[phase]=Number(result.version)||versions[phase]+1;
     clearPending(phase);submitted=true;save(false);
     $('error').textContent='已成功保存到雲端。';
     if(liveStage===stages.length){
       draft.phase=stages.length;draft.completed=true;save(false);render();
       if(root.parent!==root)root.parent.postMessage({type:'classroom:activity-complete',activityId:hash.get('activityId')||'',nodeRef:nodeRef},location.origin);
     }
   }catch(e){$('error').textContent=`儲存失敗：${e.message}。草稿仍在本機，可重新同步後再試。`;}
   finally{busy=false;reflectState();void refreshCloud();if(phase==='evidence'&&activity.groupEnabled)void refreshGroup();}
 }

 const choiceKey=phase=>phase==='evidence'?'judgment':phase;
 const activeJudgment=phase=>phase==='evidence'?draft.evidence.judgment:draft[phase];
 $('question').textContent=activity.question;
 $('subtitle').textContent=raw.s||'閱讀資料、提出證據並反思判斷。';
 $('sourceTitle').textContent=activity.source.title;
 $('source').textContent=activity.source.text;
 function buildChoices(phase){
  const host=$('choices');host.replaceChildren();
  const needsJudge=phase==='initial'||phase==='final'||(phase==='evidence'&&!activity.initialEnabled);
  if(!needsJudge)return;
  const judge=activeJudgment(phase);
  const label=document.createElement('strong');label.textContent=phase==='final'?(activity.rejudgePrompt||'再次判斷'):'你的判斷';host.append(label);
  if(activity.responseMode==='open'){
   const ta=document.createElement('textarea');ta.id='openJudgment';ta.maxLength=1000;ta.placeholder='請寫下你的判斷';ta.value=judge.open;ta.setAttribute('aria-label','開放回答');
   ta.addEventListener('input',()=>{judge.open=ta.value;save();});host.append(ta);return;
  }
  for(const o of activity.options){const wrapper=document.createElement('label');wrapper.className='choice';
   const input=document.createElement('input');input.type=activity.responseMode==='single'?'radio':'checkbox';input.name='judgment';input.value=o.id;input.checked=judge.choices.includes(o.id);
   input.addEventListener('change',()=>{if(activity.responseMode==='single')judge.choices=[o.id];else judge.choices=input.checked?[...new Set([...judge.choices,o.id])]:judge.choices.filter(x=>x!==o.id);save();});
   const span=document.createElement('span');span.textContent=o.label;wrapper.append(input,span);host.append(wrapper);
  }
 }
 function render(){
  const done=draft.completed&&draft.phase===stages.length;
  $('workspace').classList.toggle('hidden',done);
  $('complete').classList.toggle('hidden',!done);
  $('steps').replaceChildren();for(const [i,s] of stages.entries()){
   const span=document.createElement('span');span.className=i===draft.phase?'active':'';span.textContent=['initial','evidence','final'].includes(s)?({initial:'① 初步判斷',evidence:'② 蒐集證據',final:'③ 再次判斷'}[s]):s;$('steps').append(span);
  }
  if(done){renderComparison();return;}
  draft.phase=Math.max(0,Math.min(draft.phase,stages.length-1));
  const phase=stages[draft.phase];
  $('stageTitle').textContent={initial:'初步判斷',evidence:'尋找並說明證據',final:'重新檢視判斷'}[phase];
  $('stageHint').textContent=phase==='evidence'?activity.discussionPrompt:phase==='final'?'你可以維持也可以改變判斷，重點是理由與證據。':'先根據材料做出自己的判斷。';
  buildChoices(phase);
  const evidence=phase==='evidence';const needsReason=phase==='initial'||phase==='final'||(evidence&&!activity.initialEnabled);
  for(const k of ['quote','relation']){$(k).classList.toggle('hidden',!evidence);$(k+'Label').classList.toggle('hidden',!evidence);}
  $('reason').classList.toggle('hidden',!needsReason);$('reasonLabel').classList.toggle('hidden',!needsReason);
  $('quote').value=draft.evidence.quote;$('relation').value=draft.evidence.relation;
  $('reason').value=needsReason?activeJudgment(phase).reason:'';
  $('back').disabled=sessionRequested||draft.phase===0;
  $('next').textContent=sessionRequested?'提交此階段至雲端':draft.phase===stages.length-1?'完成本次判斷':'儲存並繼續';
  $('error').textContent='';
 }
 function describeJudgment(j){if(activity.responseMode==='open')return j.open||'（未填寫）';return activity.options.filter(o=>j.choices.includes(o.id)).map(o=>o.label).join('、')||'（未選擇）';}
 function renderComparison(){const host=$('comparison');host.replaceChildren();const add=(label,value)=>{const p=document.createElement('p');const strong=document.createElement('strong');strong.textContent=label+'：';p.append(strong,document.createTextNode(value||'（未填寫）'));host.append(p);};
  if(activity.initialEnabled)add('初步判斷',describeJudgment(draft.initial));
  add('提出的證據',draft.evidence.quote);add('證據與判斷的關聯',draft.evidence.relation);
  if(!activity.initialEnabled)add('判斷',describeJudgment(draft.evidence.judgment));
  if(activity.rejudgeEnabled)add('再次判斷',describeJudgment(draft.final));
  const result=C.compare(activity,draft);
  if(result.comparable)add('判斷歷程',result.changed?'曾修正判斷（不代表自動評定較好）':'維持原判斷（不代表沒有學習）');
 }
 for(const k of ['quote','relation'])$(k).addEventListener('input',()=>{draft.evidence[k]=$(k).value;save();});
 $('reason').addEventListener('input',()=>{const judge=activeJudgment(stages[draft.phase]);judge.reason=$('reason').value;save();});
 $('copyEvidence').addEventListener('click',()=>{const selection=root.getSelection();const node=selection?.anchorNode,focus=selection?.focusNode;
  if(!node||!focus||!$('source').contains(node)||!$('source').contains(focus)||selection.isCollapsed){$('error').textContent='請先在材料內選取文字';return;}
  const quote=selection.toString().trim().slice(0,2000);if(!quote)return;
  if(stages[draft.phase]!=='evidence'){$('error').textContent='已暫存證據文字；請先完成目前的判斷階段。';}
  draft.evidence.quote=quote;$('quote').value=quote;save();if(stages[draft.phase]==='evidence')$('error').textContent='已加入選取的文字。';});
 $('next').addEventListener('click',()=>{
  if(sessionRequested){void submitCloud();return;}
  const phase=stages[draft.phase],err=C.validateStep(activity,draft,phase);
  if(err){$('error').textContent=err;return;}
  draft.phase++;
  if(draft.phase>=stages.length){draft.completed=true;save();render();if(root.parent!==root){root.parent.postMessage({type:'classroom:activity-complete',activityId:hash.get('activityId')||'',nodeRef:hash.get('nodeRef')||''},location.origin);}return;}
  save();render();
 });
 $('personalRestore')?.addEventListener('click',()=>{
   if(!sessionRequested||busy)return;
   const phase=stages[liveStage-1];
   if(!Object.prototype.hasOwnProperty.call(pending,phase))return;
   if(!confirm('確定捨棄這個階段尚未提交的個人草稿，改用雲端已保存的答案？'))return;
   clearPending(phase);
   // A missing cloud row should restore an empty phase, not leave a stale draft.
   if(phase==='evidence')draft.evidence=C.blank().evidence;
   else draft[phase]=C.blank()[phase];
   save(false);void refreshCloud(true);
 });
 $('back').addEventListener('click',()=>{if(sessionRequested)return;if(draft.phase>0){draft.phase--;draft.completed=false;save();render();}});
 $('review').addEventListener('click',()=>{if(sessionRequested)return;draft.completed=false;draft.phase=stages.length-1;save();render();});
 $('reset').addEventListener('click',()=>{if(sessionRequested)return;if(!confirm('確定清除這個活動在本機的預覽結果？'))return;draft=C.blank();save();render();});
 render();
 if(sessionRequested){
   $('workspace').classList.add('r2-cloud-mode');
   reflectState();
   void refreshCloud(true);
   realtime=api.subscribeRealtime(context.sessionId,{config:context.cloudConfig,onEvent:()=>{void refreshCloud();}});
   pollTimer=setInterval(()=>{void refreshCloud();},3000);
   root.addEventListener('pagehide',()=>{clearInterval(pollTimer);try{realtime?.close?.();}catch{}});
 }
})(window);
