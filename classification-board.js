/* Classroom Interactive — Stage 2 classification standalone Session preview.
   Existing Course/Session runtimes unchanged; security rules enforced in Supabase RPCs. */
(() => {
  'use strict';
  const C=window.ClassificationCore;
  const $=id=>document.getElementById(id);
  const KEYS={activity:'ci-classification-prototype-v1',results:'ci-classification-results-v1',draft:'ci-classification-draft-v2-'};
  function load(key,fallback){try{const s=localStorage.getItem(key);return s?JSON.parse(s):fallback}catch{return fallback}}
  function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{message('本機儲存空間不足，請匯出資料並檢查瀏覽器儲存空間。');return false}}
  const API=window.ClassroomSessionAPI, Cloud=window.ClassificationSession;
  const search=new URLSearchParams(location.search);
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  const sessionStudent=search.get('session')==='1';
  const ctx=sessionStudent?API?.getParticipantContext?.():null;
  const courseStudent=sessionStudent&&ctx?.sessionKind==='course';
  const embeddedPreview=!sessionStudent&&hash.get('embedded')==='1';
  const standalonePreview=!sessionStudent&&!embeddedPreview&&!!hash.get('data');
  const studentPreview=embeddedPreview||standalonePreview;
  const expectedNodeRef=hash.get('nodeRef')||'';
  const expectedActivityRef=hash.get('activityId')||'';
  function decodeEmbeddedActivity(){
    const encoded=hash.get('data')||'';
    if(!encoded.startsWith('u.'))return null;
    try{
      const payload=encoded.slice(2).replace(/-/g,'+').replace(/_/g,'/');
      const bytes=Uint8Array.from(atob(payload),ch=>ch.charCodeAt(0));
      const result=JSON.parse(new TextDecoder().decode(bytes));
      return result.cb||result.activity||null;
    }catch{return null;}
  }
  const cloudActivity=(courseStudent||studentPreview)?decodeEmbeddedActivity():(ctx?.activityMode==='classification-board'&&ctx?.activityEncoded?(()=>{
    try{return JSON.parse(ctx.activityEncoded)?.activity;}catch{return null;}
  })():null);
  let activity=C.normalizeActivity(cloudActivity||load(KEYS.activity,C.newActivity()));
  let teacherSession=null;
  let teacherActivity=null; // Immutable activity snapshot belonging to the cloud session.
  let cloudResults=null;
  let cloudGroup=null;
  let dirty=false;
  let loadingGroup=false;
  let courseNodeSettled=false;
  let courseNodeCurrent=false; // The latest validated Course Session still points at this Node.
  let coursePoll=null;
  let saving=false;
  let realtimeChannel=null;
  let syncTimer=null;
  let teacherRefreshBusy=false;
  function attachRealtime(sessionId,config,callback){
    realtimeChannel?.close?.();
    realtimeChannel=API.subscribeRealtime?.(sessionId,{config,onEvent:callback})||null;
    window.addEventListener('beforeunload',()=>realtimeChannel?.close?.(),{once:true});
  }
  function attachTeacherSync(){
    if(!teacherSession)return;
    attachRealtime(teacherSession.id,null,()=>{if(view==='compare'&&!teacherRefreshBusy)refreshTeacherResults().catch(e=>message(e.message));});
    if(syncTimer)clearInterval(syncTimer);
    syncTimer=setInterval(()=>{if(view==='compare'&&!teacherRefreshBusy)refreshTeacherResults().catch(e=>message(e.message));},8000);
  }
  let selectedAssetId='',view='teacher';
  // Stage 4: bind drafts to the Node encoded in THIS iframe link, not to a mutable
  // participant context that may already point to the teacher's next Node.
  const draftKey=()=>KEYS.draft+(sessionStudent?`${ctx?.sessionId||'unknown'}:${courseStudent?expectedNodeRef:''}:${ctx?.participantId||''}:`:(studentPreview?`preview:${embeddedPreview?expectedNodeRef:'share'}:`:''))+activity.id;
  // Upgrade the earlier preview's single draft key without deleting its data.
  let savedDraft=load(draftKey(),null);
  // Legacy unscoped preview drafts may only migrate into a local standalone editor.
  // Importing one into a real student Session (or a different Course Node) risks cross-activity contamination.
  if(!savedDraft&&!sessionStudent&&!studentPreview){
    const legacy=load('ci-classification-draft-v1',null);
    if(legacy?.activityId===activity.id){savedDraft={board:legacy,author:legacy.author||'',submitted:false,submittedId:''};}
  }
  let board=C.normalizeBoard(savedDraft?.board,activity);
  let submitted=!!savedDraft?.submitted;
  let submittedId=String(savedDraft?.submittedId||'');
  dirty=!!savedDraft?.dirty;
  let editBaseRevision=Number.isSafeInteger(savedDraft?.editBaseRevision)?savedDraft.editBaseRevision:null;
  let editGroupId=typeof savedDraft?.editGroupId==='string'?savedDraft.editGroupId:'';
  let groupIdentityConflict=!!savedDraft?.groupIdentityConflict;
  function message(s){$('status').textContent=s}
  function el(tag,content,cls){const n=document.createElement(tag);if(content!==undefined)n.textContent=String(content);if(cls)n.className=cls;return n}
  function div(cls){return el('div',undefined,cls)}
  function btn(title,handler,cls){const n=el('button',title,cls);n.type='button';n.addEventListener('click',handler);return n}
  function field(label,value,callback,options={}){
    const box=el('label',undefined,'field');box.append(el('span',label));
    const input=document.createElement(options.multiline?'textarea':'input');
    input.value=value??'';input.maxLength=options.limit||500;if(!options.multiline)input.type=options.type||'text';
    input.disabled=!!options.disabled;
    input.addEventListener(options.live?'input':'change',()=>callback(input.value));
    box.append(input);return box;
  }
  function persistDraft(){return save(draftKey(),{schemaVersion:2,board,author:$('authorName').value.trim().slice(0,60),submitted,submittedId,dirty,editBaseRevision,editGroupId,groupIdentityConflict});}
  function canEdit(){return !(courseStudent&&courseNodeSettled)&&!saving&&(!sessionStudent||activity.collaboration!=='group'||(cloudGroup?.assigned===true&&cloudGroup?.can_edit===true))&&(!submitted||activity.allowRevise)}
  function markDirty(){if(sessionStudent){if(!dirty&&activity.collaboration==='group'){editBaseRevision=Number(cloudGroup?.revision)||0;editGroupId=cloudGroup?.group_id||'';}dirty=true;}persistDraft();}
  function syncBoard(){board=C.normalizeBoard(board,activity);persistDraft()}
  function configUpdate(){
    const oldMode=activity.mode;
    activity.title=$('activityTitle').value.trim().slice(0,120)||'未命名活動';
    activity.guidance=$('guidance').value.trim().slice(0,500);
    activity.mode=$('classificationMode').value==='assigned'?'assigned':'free';
    activity.collaboration=$('collaborationMode').value==='group'?'group':'individual';
    activity.maxGroups=Math.max(0,Math.min(100,Math.floor(Number($('maxGroups').value)||0)));
    ['allowMultiple','requireAll','requireReason','allowRename','allowRevise'].forEach(k=>activity[k]=$(k).checked);
    activity=C.normalizeActivity(activity);
    cloudResults=null;
    save(KEYS.activity,activity);
    if(activity.mode!==oldMode){board=C.newBoard(activity);submitted=false;submittedId='';message('分類模式已切換，新的分類板已初始化；原本的提交成果仍保留。')}
    else syncBoard();
    return true;
  }
  function refreshAssetEditor(){
    $('assetsEditor').replaceChildren();
    activity.assets.forEach((asset,i)=>{
      const card=div('subcard editor-asset');
      const picker=el('label',undefined,'picker');const radio=document.createElement('input');radio.type='radio';radio.name='selectedAsset';radio.checked=asset.id===selectedAssetId;radio.addEventListener('change',()=>selectedAssetId=asset.id);
      picker.append(radio,el('strong',`素材 ${i+1}`));card.append(picker);
      card.append(field('文字',asset.label,value=>{asset.label=value.trim().slice(0,500);save(KEYS.activity,activity);syncBoard();},{limit:500}));
      card.append(field('圖片 HTTPS URL',asset.image,value=>{if(value.trim()&&!C.httpsUrl(value.trim()))return message('圖片網址必須以 HTTPS 開頭');asset.image=C.httpsUrl(value.trim());save(KEYS.activity,activity);},{limit:2048}));
      const actions=div('toolbar compact');
      actions.append(btn('上移',()=>moveAsset(i,-1)),btn('下移',()=>moveAsset(i,1)),btn('複製',()=>duplicateAsset(asset.id)));
      card.append(actions);$('assetsEditor').append(card);
    });
  }
  function refreshPresetEditor(){
    $('presetEditor').replaceChildren();
    activity.presetGroups.forEach((g,i)=>{
      const c=div('subcard toolbar');c.append(field(`類別 ${i+1}`,g.name,v=>{if(!v.trim())return message('類別名稱不可為空');g.name=v.trim().slice(0,80);save(KEYS.activity,activity);syncBoard();},{limit:80}));
      c.append(btn('刪除',()=>{activity.presetGroups.splice(i,1);save(KEYS.activity,activity);syncBoard();refreshPresetEditor()}));
      $('presetEditor').append(c);
    });
  }
  function renderTeacher(){
    $('activityTitle').value=activity.title;
    $('guidance').value=activity.guidance;
    $('classificationMode').value=activity.mode;
    $('collaborationMode').value=activity.collaboration;
    $('maxGroups').value=activity.maxGroups;
    for(const key of ['allowMultiple','requireAll','requireReason','allowRename','allowRevise'])$(key).checked=activity[key];
    refreshAssetEditor();refreshPresetEditor();
  }
  function moveAsset(i,delta){const j=i+delta;if(j<0||j>=activity.assets.length)return;[activity.assets[i],activity.assets[j]]=[activity.assets[j],activity.assets[i]];save(KEYS.activity,activity);refreshAssetEditor()}
  function duplicateAsset(assetId){const a=activity.assets.find(x=>x.id===assetId);if(!a)return message('請先選擇素材');if(activity.assets.length>=200)return message('素材最多 200 筆');activity.assets.push({...a,id:C.id()});save(KEYS.activity,activity);refreshAssetEditor()}
  function assetCard(asset,draggable){
    const box=div('asset');box.dataset.assetId=asset.id;
    const title=el('strong',asset.label||'圖片素材');box.append(title);
    if(asset.image){const img=document.createElement('img');img.loading='lazy';img.alt=asset.label||'分類素材';img.src=asset.image;
      img.onerror=()=>{img.remove();box.append(el('small','圖片目前無法載入，仍可使用文字或分類功能。'))};box.append(img)}
    if(draggable){box.draggable=true;box.classList.add('is-draggable');box.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',asset.id);event.dataTransfer.effectAllowed='copyMove'})}
    return box;
  }
  function membershipsFor(assetId){return board.memberships.filter(m=>m.assetId===assetId).map(m=>m.groupId)}
  function member(assetId,groupId,checked){if(!canEdit())return;C.assign(board,activity,assetId,groupId,checked);markDirty();renderStudent()}
  function showGroup(g,i){
    const c=div('group');c.dataset.groupId=g.id;
    c.addEventListener('dragover',event=>{if(!canEdit())return;event.preventDefault();c.classList.add('dragover')});
    c.addEventListener('dragleave',()=>c.classList.remove('dragover'));
    c.addEventListener('drop',event=>{event.preventDefault();c.classList.remove('dragover');const aid=event.dataTransfer?.getData('text/plain');if(activity.assets.some(a=>a.id===aid)&&canEdit())member(aid,g.id,true)});
    const top=div('group-head');
    const renameDisabled=!canEdit()||(activity.mode==='assigned'&&!activity.allowRename);
    top.append(field(`類別 ${i+1}`,g.name,v=>{if(renameDisabled)return;const value=v.trim();if(!value)return message('類別名稱不可為空');g.name=value.slice(0,80);markDirty();renderStudent()},{limit:80,disabled:renameDisabled}));
    const buttons=div('toolbar compact');
    if(activity.mode==='free'){
      buttons.append(btn('↑',()=>moveGroup(i,-1)),btn('↓',()=>moveGroup(i,1)),btn('刪除此類',()=>{if(!canEdit())return;board.groups.splice(i,1);board.memberships=board.memberships.filter(m=>m.groupId!==g.id);markDirty();renderStudent()}));
    }
    if(buttons.childElementCount)top.append(buttons);c.append(top);
    const list=div('items');const byId=new Map(activity.assets.map(x=>[x.id,x]));
    const members=board.memberships.filter(m=>m.groupId===g.id).map(m=>m.assetId);
    const ordered=[...new Set([...g.assetOrder,...members])].filter(aid=>members.includes(aid));
    if(!ordered.length)list.append(el('p','尚未分配素材','hint'));
    for(const aid of ordered){const asset=byId.get(aid);if(!asset)continue;
      const item=div('assigned-item');item.append(assetCard(asset,canEdit()));
      const actions=div('toolbar compact');
      actions.append(btn('上移',()=>moveItem(g,aid,-1)),btn('下移',()=>moveItem(g,aid,1)));
      if(activity.allowMultiple)actions.append(btn('移除此類',()=>member(aid,g.id,false)));
      for(const b of actions.children)b.disabled=!canEdit();
      item.append(actions);list.append(item);
    }
    c.append(list);
    c.append(field(activity.requireReason?'共同特徵與分類理由（必填）':'共同特徵與分類理由（選填）',g.reason||'',v=>{g.reason=v.slice(0,1000);markDirty()},{multiline:true,live:true,limit:1000,disabled:!canEdit()}));
    return c;
  }
  function moveGroup(i,delta){if(!canEdit())return;const j=i+delta;if(j<0||j>=board.groups.length)return;[board.groups[i],board.groups[j]]=[board.groups[j],board.groups[i]];markDirty();renderStudent()}
  function moveItem(group,aid,delta){if(!canEdit())return;const i=group.assetOrder.indexOf(aid),j=i+delta;if(i<0||j<0||j>=group.assetOrder.length)return;[group.assetOrder[i],group.assetOrder[j]]=[group.assetOrder[j],group.assetOrder[i]];markDirty();renderStudent()}
  function renderStudent(){
    syncBoard();
    const locked=!canEdit();
    $('studentTitle').textContent=activity.title;$('studentGuide').textContent=activity.guidance;
    $('newGroupName').disabled=activity.mode==='assigned'||locked;
    $('createGroup').disabled=activity.mode==='assigned'||locked;
    $('studentMessage').textContent=locked?'這份成果已提交，教師不允許再次修改。':submitted?'已提交成果；教師允許修改並重新提交。':'選擇素材並分配至類別，完成後提交成果。';
    $('unassigned').replaceChildren();
    for(const a of activity.assets){
      const c=assetCard(a,!locked);const selection=div('field');
      selection.append(el('span',activity.allowMultiple?'指定類別（可複選）':'指定類別'));
      if(activity.allowMultiple){
        for(const g of board.groups){const wrap=el('label',undefined,'choice-line');const check=document.createElement('input');check.type='checkbox';check.disabled=locked;check.checked=membershipsFor(a.id).includes(g.id);
          check.addEventListener('change',()=>member(a.id,g.id,check.checked));wrap.append(check,el('span',g.name));selection.append(wrap)}
      } else {
        const select=document.createElement('select');select.disabled=locked;select.setAttribute('aria-label',`${a.label||'圖片素材'}的類別`);select.add(new Option('尚未分類',''));
        board.groups.forEach(g=>select.add(new Option(g.name,g.id)));
        select.value=membershipsFor(a.id)[0]||'';select.addEventListener('change',()=>member(a.id,select.value,!!select.value));selection.append(select);
      }
      if(!board.groups.length)selection.append(el('p',activity.mode==='assigned'?'教師尚未建立分類類別':'請先在上方建立一個分類群組','hint'));
      c.append(selection);$('unassigned').append(c);
    }
    $('studentBoard').replaceChildren();board.groups.forEach((g,i)=>$('studentBoard').append(showGroup(g,i)));
    $('submitBoard').disabled=locked;
    const reload=$('reloadCloudGroup');if(reload)reload.hidden=!(sessionStudent&&activity.collaboration==='group');
  }
  function readResults(){const v=load(KEYS.results,[]);return Array.isArray(v)?v.filter(x=>x&&typeof x==='object'):[]}
  function resultsForActivity(){return readResults().filter(x=>x.activityId===activity.id)}
  function renderCompare(){
    const source=teacherSession?(teacherActivity||activity):activity;
    const results=teacherSession?(cloudResults||[]):resultsForActivity();
    $('resultSummary').textContent=teacherSession?`目前取得 ${results.length} 份雲端成果（來源：${source.title}）。`:`目前本機已保存 ${results.length} 份成果。`;
    const mask=$('maskIdentity')?.checked!==false&&!!teacherSession;
    const author=(r,i)=>mask?`成果 ${i+1}`:(r.author||`成果 ${i+1}`);
    $('resultBoards').replaceChildren();$('comparisonMatrix').replaceChildren();
    if(!results.length){$('comparisonMatrix').append(el('p','尚未提交分類成果。','hint'));return}
    const matrix=C.comparisonMatrix(source,results);
    const table=document.createElement('table');const head=document.createElement('thead');const row=document.createElement('tr');
    row.append(el('th','素材'));results.forEach((r,i)=>row.append(el('th',author(r,i))));head.append(row);table.append(head);
    const body=document.createElement('tbody');
    for(const m of matrix){const tr=document.createElement('tr');tr.append(el('th',m.assetLabel));m.assignments.forEach(name=>tr.append(el('td',name)));body.append(tr)}table.append(body);
    $('comparisonMatrix').append(el('h3','相同素材在不同成果中的分類方式'),table);
    for(const [i,r] of results.entries()){const c=div('subcard result-card');c.append(el('h3',author(r,i)),el('small',new Date(r.submittedAt).toLocaleString('zh-TW')));
      for(const g of r.groups||[]){const group=div('group');group.append(el('strong',g.name),el('p',g.reason||'未填寫理由','hint'));
        const assetLabels=(r.memberships||[]).filter(m=>m.groupId===g.id).map(m=>r.assets?.find(a=>a.id===m.assetId)?.label||'圖片素材');
        group.append(el('p',assetLabels.join('、')||'沒有素材'));c.append(group)}$('resultBoards').append(c)}
  }
  function openView(v){view=v;['teacher','student','compare'].forEach(k=>{$(k+'View').classList.toggle('hidden',k!==v);$(k+'Tab').classList.toggle('primary',k===v)});
    if(v==='teacher')renderTeacher();if(v==='student')renderStudent();if(v==='compare'){renderCompare();if(teacherSession&&!teacherRefreshBusy)refreshTeacherResults().catch(e=>message(e.message||'同步失敗'));}}
  async function submit(){
    const error=C.validate(activity,board);if(error)return message(error);
    if(saving)return;
    saving=true;renderStudent();
    try{
      if(sessionStudent){
        if(!ctx || ctx.activityMode!=='classification-board')throw Error('分類 Session 已過期，請重新加入');
        const state=await API.studentState();
        if(state.status!=='active')throw Error('Session 已結束');
        if(courseStudent && (state.current_node_ref!==expectedNodeRef||state.node_settled===true))
          throw Error('教師已切換／結算活動，請返回課程頁面');
        if(activity.collaboration==='group'){
          if(!cloudGroup?.assigned)throw Error('老師尚未分組');
          if(groupIdentityConflict)throw Error('分組已變更，請先重新載入新小組成果，舊草稿已保留');
          if(!cloudGroup.can_edit)throw Error('只有小組代表能提交共同成果');
          const expected=editBaseRevision??(Number(cloudGroup.revision)||0);
          const result=await Cloud.submitGroup(ctx,{activityId:activity.id,groups:board.groups,memberships:board.memberships},expected);
          cloudGroup.revision=result.revision;
          editBaseRevision=null;editGroupId='';groupIdentityConflict=false;
          API.publishRealtime?.(ctx.sessionId,'classification-board',ctx.cloudConfig);
        }else{
          if(ctx.mode!=='cloud')throw Error('本版獨立分類 Session 需使用 Supabase');
          if(courseStudent)await Cloud.submitCourseIndividual(ctx,{activityId:activity.id,groups:board.groups,memberships:board.memberships});
          else await Cloud.submitIndividual(ctx,{activityId:activity.id,groups:board.groups,memberships:board.memberships});
        }
        submitted=true;dirty=false;editBaseRevision=null;editGroupId='';groupIdentityConflict=false;persistDraft();renderStudent();message('雲端已確認收到分類成果');
        if(courseStudent && window.parent!==window)window.parent.postMessage({type:'classroom:activity-complete',activityId:expectedActivityRef},location.origin);
        return;
      }
      const old=readResults();let resultId=submittedId;
      if(!resultId||!old.some(x=>x.id===resultId))resultId=C.id();
      const item={schemaVersion:2,id:resultId,activityId:activity.id,author:$('authorName').value.trim().slice(0,60)||'匿名成果',
        submittedAt:new Date().toISOString(),assets:structuredClone(activity.assets),groups:structuredClone(board.groups),memberships:structuredClone(board.memberships)};
      const index=old.findIndex(x=>x.id===resultId);if(index<0)old.push(item);else old[index]=item;
      if(!save(KEYS.results,old))return;
      submitted=true;submittedId=resultId;persistDraft();renderStudent();message(studentPreview?'預覽成果已保存在此裝置。':'成果已保存在此裝置，可切換「成果比較」查看。');
      if(embeddedPreview&&window.parent!==window)window.parent.postMessage({type:'classroom:activity-complete',activityId:expectedActivityRef},location.origin);
    }catch(error){message(/revision conflict/i.test(error.message||'')?'小組版本衝突：雲端已有新的成果；本機草稿仍在，請重新載入雲端版本後再編輯。':(error.message||'提交失敗，已保留草稿，請稍後重試'));}
    finally{saving=false;renderStudent();}
  }
  async function refreshGroupState(){
    if(!sessionStudent||activity.collaboration!=='group'||!ctx||loadingGroup)return;
    loadingGroup=true;
    try{
      if(ctx.mode!=='cloud')throw Error('小組共同成果需使用 Supabase Session');
      const next=await Cloud.groupState(ctx);
      if(courseStudent&&!courseNodeCurrent)return; // Do not display a stale group response after a Node switch.
      const previous=cloudGroup;
      const changedGroup=!!previous?.group_id&&previous.group_id!==next.group_id;
      if(dirty&&(changedGroup||groupIdentityConflict||(editGroupId&&editGroupId!==next.group_id))){
        groupIdentityConflict=true;cloudGroup={...next,can_edit:false};persistDraft();
        message('教師已調整分組，本機草稿已保留。請先確認並重新載入新小組的成果。');
      }else{
        cloudGroup=next;
        const newer=Number(next.revision)>Number(previous?.revision||0);
        if(dirty&&next.can_edit&&editBaseRevision!==null&&Number(next.revision)>editBaseRevision){
          message('小組成果有其他裝置提交的新版本，本機草稿仍保留；提交將因版本衝突被拒絕。');
        }
        if(!dirty&&(changedGroup||!previous||newer)){
          board=C.normalizeBoard(next.board,activity);
          submitted=!!next.board;editBaseRevision=null;editGroupId='';groupIdentityConflict=false;
          persistDraft();
        }
        // Read-only members always follow the stored group's latest result.
        if(!next.can_edit&&next.board&&(changedGroup||!previous||newer)){
          board=C.normalizeBoard(next.board,activity);submitted=true;dirty=false;editBaseRevision=null;editGroupId='';groupIdentityConflict=false;persistDraft();
        }
      }
      const info=$('cloudStudentInfo');info.classList.remove('hidden');
      info.textContent=!next.assigned?'老師尚未分組，請稍候…':
        `${next.group_label}｜${next.can_edit?'你是小組代表，可提交成果':'正在檢視小組共同成果（僅代表可編輯）'}`;
      renderStudent();
    }catch(error){message(error.message||'小組資料同步失敗（保留本機草稿）');}
    finally{loadingGroup=false;}
  }
  async function reloadGroupBoard(){
    if(!ctx||activity.collaboration!=='group')return;
    if(dirty&&!window.confirm('這會以雲端成果取代目前尚未提交的草稿。確定繼續？'))return;
    try{
      const next=await Cloud.groupState(ctx);
      cloudGroup=next;board=C.normalizeBoard(next.board,activity);
      submitted=!!next.board;dirty=false;editBaseRevision=null;editGroupId='';groupIdentityConflict=false;
      persistDraft();renderStudent();message('已重新載入目前小組的雲端成果。');
    }catch(error){message(error.message||'無法重新載入小組成果');}
  }
  // R6: never use teacher snapshot or local cache to expose classmates' work.
  // Unpublished state must yield zero boards from the server, not just hide elements.
  let publishedRefreshBusy=false;
  let publishedEpoch=0;
  function clearPublishedResults(){
    // Invalidate outstanding RPCs so an old response cannot resurrect a withdrawn/previous Node view.
    publishedEpoch++;
    $('coursePublishedPanel').classList.add('hidden');
    $('coursePublishedResults').replaceChildren();
  }
  async function refreshPublishedResults(){
    if(!courseStudent||!ctx||!courseNodeCurrent||publishedRefreshBusy)return;
    publishedRefreshBusy=true;
    const epoch=++publishedEpoch;
    const panel=$('coursePublishedPanel'),contents=$('coursePublishedResults');
    try{
      const remote=await Cloud.studentPublished(ctx);
      if(epoch!==publishedEpoch||!courseNodeCurrent||ctx.currentNodeRef!==expectedNodeRef||
          (remote?.node_ref && remote.node_ref!==expectedNodeRef))return;
      if(!remote?.published){clearPublishedResults();return;}
      panel.classList.remove('hidden');contents.replaceChildren();
      const rows=(Array.isArray(remote.results)?remote.results:[]).slice(0,200);
      $('coursePublishedHint').textContent=`老師已公布 ${rows.length} 份匿名分類成果；不同類別不代表判斷錯誤。`;
      if(!rows.length){contents.append(el('p','目前尚未有可比較的成果。','hint'));return;}
      const table=document.createElement('table');table.className='published-matrix';
      const head=document.createElement('thead'),header=document.createElement('tr');
      for(const label of ['素材',...rows.map((r,i)=>`成果 ${i+1}`)])header.append(el('th',label));
      head.append(header);table.append(head);
      const body=document.createElement('tbody');
      for(const asset of activity.assets){
        const tr=document.createElement('tr');tr.append(el('th',asset.label||'圖片素材'));
        for(const item of rows){
          const board=item.board||{};
          const memberships=Array.isArray(board.memberships)?board.memberships:[];
          const groups=Array.isArray(board.groups)?board.groups:[];
          const labels=memberships.filter(m=>m.assetId===asset.id).map(m=>groups.find(g=>g.id===m.groupId)?.name||'未命名');
          tr.append(el('td',labels.join('、')||'未分類'));
        }
        body.append(tr);
      }
      table.append(body);const scroller=div('comparison-scroll');scroller.append(table);contents.append(scroller);
      rows.forEach((item,i)=>{
        const card=div('published-result-card');card.append(el('h3',`成果 ${i+1}`));
        for(const g of item.board?.groups||[]){
          const names=(item.board?.memberships||[]).filter(m=>m.groupId===g.id)
            .map(m=>activity.assets.find(a=>a.id===m.assetId)?.label||'圖片素材');
          card.append(el('p',`${g.name}：${names.join('、')||'尚未分類'}${g.reason?`｜理由：${g.reason}`:''}`));
        }
        contents.append(card);
      });
    }catch(error){
      if(epoch!==publishedEpoch)return;
      clearPublishedResults();
      // Explicit error for missing migration; don't display cached or teacher data.
      if(!/PGRST202|404|not found/i.test(error.message||''))message(error.message||'無法讀取教師公布的成果');
    }finally{publishedRefreshBusy=false;}
  }
  async function hydrateIndividual(){
    if(!sessionStudent||activity.collaboration!=='individual'||!ctx)return;
    try{
      const state=courseStudent?await Cloud.courseIndividualState(ctx):await Cloud.individualState(ctx);
      if(state?.board&&!dirty){
        board=C.normalizeBoard(state.board,activity);
        submitted=true;editBaseRevision=null;persistDraft();renderStudent();
        message('已還原雲端已提交的個人分類成果。');
      }
    }catch(error){message(error.message||'無法還原之前的作答（本機草稿仍保留）');}
  }
  async function createCloudSession(){
    configUpdate();if(!activity.assets.length)throw Error('請先設定分類素材');
    if(activity.mode==='assigned'&&!activity.presetGroups.length)throw Error('指定分類須建立類別');
    if(!API.isCloudConfigured())throw Error('請先在首頁完成 Supabase 設定');
    const source=C.normalizeActivity(structuredClone(activity));
    const session=await API.createSession({title:source.title,activityMode:'classification-board',
      activityEncoded:JSON.stringify({schemaVersion:2,kind:'classification-board',activity:source}),stageCount:1});
    teacherSession=session;teacherActivity=source;cloudResults=null;
    localStorage.setItem(`ci-classification-last-session:${activity.id}`,teacherSession.id);
    $('assignCloudGroups').hidden=activity.collaboration!=='group';
    $('refreshCloudResults').hidden=false;
    $('cloudTeacherInfo').classList.remove('hidden');
    const url=API.buildJoinUrl(teacherSession);
    $('cloudTeacherInfo').replaceChildren(el('strong',`課堂代碼：${teacherSession.code}`),el('p',`加入網址：${url}`));
    const link=el('a','開啟加入頁');link.href=url;link.target='_blank';link.rel='noopener';$('cloudTeacherInfo').append(link);
    attachTeacherSync();
  }
  async function refreshTeacherResults(){
    if(teacherRefreshBusy)return;
    const session=teacherSession,source=teacherActivity;
    if(!session||!source)throw Error('請先建立或恢復分類 Session');
    teacherRefreshBusy=true;
    try{
      const snapshot=await API.teacherSnapshot(session);
      const responses=(snapshot.responses||[]).filter(r=>
        r.mode==='classification-board'&&r.stage_key==='final'&&
        (r.node_ref||'')===''&&r.payload?.board?.activityId===source.id);
      const rows=responses.map((r,i)=>({id:r.participant_id||`p${i}`,activityId:source.id,
        author:r.student_code||`學生 ${i+1}`,assets:source.assets,groups:r.payload.board.groups||[],
        memberships:r.payload.board.memberships||[],submittedAt:r.submitted_at||new Date().toISOString()}));
      if(source.collaboration==='group'){
        const remote=await Cloud.teacherGroups(session);
        (remote||[]).filter(r=>r.board?.activityId===source.id).forEach(r=>rows.push({
          id:r.group_id,activityId:source.id,author:r.group_label,
          assets:source.assets,groups:r.board.groups||[],memberships:r.board.memberships||[],
          submittedAt:r.updated_at||new Date().toISOString()}));
      }
      // Ignore responses to a Session that was replaced while awaiting network calls.
      if(session!==teacherSession)return;
      cloudResults=rows;
      if(view==='compare')renderCompare();
      message(`已同步 ${rows.length} 份雲端成果`);
    }finally{teacherRefreshBusy=false;}
  }
  function download(filename,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
  function wire(){
    $('teacherTab').onclick=()=>openView('teacher');
    $('studentTab').onclick=()=>{configUpdate();openView('student')};
    $('compareTab').onclick=()=>openView('compare');
    $('saveConfig').onclick=()=>{configUpdate();message('設定已儲存')};
    $('addAsset').onclick=()=>{const label=$('assetText').value.trim(),raw=$('assetImage').value.trim(),image=C.httpsUrl(raw);
      if(raw&&!image)return message('圖片必須是 HTTPS 網址');
      if(!label&&!image)return message('請輸入素材文字或 HTTPS 圖片網址');
      if(activity.assets.length>=200)return message('素材最多 200 筆');
      activity.assets.push({id:C.id(),label:label.slice(0,500),image});$('assetText').value='';$('assetImage').value='';save(KEYS.activity,activity);refreshAssetEditor();message('素材已新增')};
    $('addBatchAssets').onclick=()=>{const lines=$('batchAssets').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      if(!lines.length)return message('請每行輸入一筆素材');
      const adding=lines.slice(0,Math.max(0,200-activity.assets.length));
      if(!adding.length)return message('素材已達 200 筆上限');
      adding.forEach(label=>activity.assets.push({id:C.id(),label:label.slice(0,500),image:''}));
      save(KEYS.activity,activity);$('batchAssets').value='';refreshAssetEditor();message(`已新增 ${adding.length} 筆素材`)};
    $('duplicateAsset').onclick=()=>duplicateAsset(selectedAssetId);
    $('removeAsset').onclick=()=>{if(!selectedAssetId)return message('請先選擇素材');
      activity.assets=activity.assets.filter(x=>x.id!==selectedAssetId);selectedAssetId='';save(KEYS.activity,activity);syncBoard();refreshAssetEditor();message('素材已移除')};
    $('addPreset').onclick=()=>{const name=$('presetGroupName').value.trim();if(!name)return message('請填寫類別名稱');
      if(activity.presetGroups.length>=100)return message('指定類別最多 100 個');
      activity.presetGroups.push({id:C.id(),name:name.slice(0,80)});$('presetGroupName').value='';save(KEYS.activity,activity);syncBoard();refreshPresetEditor()};
    $('createGroup').onclick=()=>{if(activity.mode!=='free'||!canEdit())return;
      const name=$('newGroupName').value.trim();if(!name)return message('請輸入類別名稱');
      if(activity.maxGroups&&board.groups.length>=activity.maxGroups)return message('已達分類群組數量上限');
      board.groups.push({id:C.id(),name:name.slice(0,80),reason:'',assetOrder:[]});$('newGroupName').value='';markDirty();renderStudent()};
    $('authorName').addEventListener('input',()=>persistDraft());
    ['input','change'].forEach(eventName=>$('studentView').addEventListener(eventName,event=>{
      if(sessionStudent&&event.target?.id!=='authorName'&&canEdit())markDirty();},{capture:true}));
    $('saveDraft').onclick=()=>{persistDraft();message('草稿已保存在這台裝置')};
    $('restoreDraft').onclick=()=>{const old=load(draftKey(),null);if(!old)return message('找不到這份活動的本機草稿');
      board=C.normalizeBoard(old.board,activity);$('authorName').value=old.author||'';submitted=!!old.submitted;submittedId=old.submittedId||'';dirty=!!old.dirty;editBaseRevision=Number.isSafeInteger(old.editBaseRevision)?old.editBaseRevision:null;editGroupId=old.editGroupId||'';groupIdentityConflict=!!old.groupIdentityConflict;renderStudent();message('已恢復草稿')};
    $('submitBoard').onclick=submit;
    $('reloadCloudGroup')?.addEventListener('click',reloadGroupBoard);
    $('maskIdentity')?.addEventListener('change',()=>{if(view==='compare')renderCompare();});
    $('createCloudSession').onclick=async()=>{try{await createCloudSession();}catch(e){message(e.message||'建立失敗');}};
    $('resumeCloudSession').onclick=async()=>{
      try{
        const id=localStorage.getItem(`ci-classification-last-session:${activity.id}`);
        const sessions=API.loadTeacherHistory().filter(item=>item.activityMode==='classification-board'&&item.mode==='cloud');
        const history=sessions.find(item=>item.id===id)||sessions[0];
        if(!history)throw Error('沒有可以還原的分類 Session，請建立新課堂');
        const [snapshot,remoteActivity]=await Promise.all([API.teacherSnapshot(history),Cloud.teacherActivity(history)]);
        if(snapshot.activity_mode!=='classification-board')throw Error('這不是分類活動 Session');
        teacherActivity=C.normalizeActivity(remoteActivity);
        teacherSession=history;cloudResults=null;
        $('assignCloudGroups').hidden=teacherActivity.collaboration!=='group';$('refreshCloudResults').hidden=false;
        $('cloudTeacherInfo').classList.remove('hidden');
        const url=API.buildJoinUrl(teacherSession);
        $('cloudTeacherInfo').replaceChildren(el('strong',`課堂代碼：${teacherSession.code}`),el('p',`加入網址：${url}`));
        const link=el('a','開啟加入頁');link.href=url;link.target='_blank';link.rel='noopener';$('cloudTeacherInfo').append(link);
        attachTeacherSync();
        message('已恢復教師控制 Session');
      }catch(e){message(e.message||'恢復失敗');}
    };
    $('assignCloudGroups').onclick=async()=>{try{if(!teacherSession)throw Error('請先建立 Session');
      const snap=await API.teacherSnapshot(teacherSession);if((snap.participant_count||0)<2)throw Error('至少兩位學生加入後才能分組');
      if((await Cloud.teacherGroups(teacherSession)).some(row=>row.board))throw Error('已有小組成果，請勿重新分組');
      if(teacherActivity?.collaboration!=='group')throw Error('目前 Session 不是小組分類模式');
      await API.assignSessionGroups(teacherSession,4);message('分組完成，請學生稍候自動更新');
      if(view==='compare')await refreshTeacherResults();}
      catch(e){message(e.message||'分組失敗');}};
    $('refreshCloudResults').onclick=async()=>{try{openView('compare');await refreshTeacherResults();}catch(e){message(e.message||'更新失敗');}};
    $('exportActivity').onclick=()=>{configUpdate();download('classification-activity.json',activity)};
    $('exportResults').onclick=()=>download('classification-results.json',{schemaVersion:2,activityId:(teacherActivity||activity).id,results:teacherSession?(cloudResults||[]):resultsForActivity()});
    $('importActivity').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;
      try{if(file.size>1024*1024)throw Error('活動 JSON 不能超過 1 MB');const input=JSON.parse(await file.text());activity=C.normalizeActivity(input);
        board=C.newBoard(activity);submitted=false;submittedId='';selectedAssetId='';$('authorName').value='';save(KEYS.activity,activity);persistDraft();renderTeacher();message('已匯入分類活動（不會刪除其他活動的本機成果）')}
      catch(error){message(error.message||'活動匯入失敗')}finally{event.target.value=''}});
  }
  wire();$('authorName').value=savedDraft?.author||'';
  if(sessionStudent||studentPreview){
    if(!cloudActivity){
      $('teacherView').classList.add('hidden');
      $('studentView').classList.add('hidden');
      $('teacherTab').classList.add('hidden');
      $('compareTab').classList.add('hidden');
      $('studentTab').disabled=true;
      message('活動內容無法讀取，請從教師端重新產生分享連結，或重新加入課堂。');
      return;
    }
    if(standalonePreview){
      document.body.classList.add('shared-classification-student');
      document.querySelector('header .tag').textContent='學生預覽（本機暫存）';
      const hint=document.querySelector('header p.hint');
      if(hint)hint.textContent='觀察素材、建立分類，並說明你選擇這種分類方式的理由。';
    }
    if(courseStudent){
      document.body.classList.add('course-classification-student');
      document.querySelector('header .tag').textContent='Course 活動節點';
      if(!expectedNodeRef||ctx?.currentNodeRef!==expectedNodeRef)message('活動節點已變更，請返回課程頁面');
      // Track the newest *completed and applied* check, rather than the newest
      // *started* check. At 6s polling intervals, a 7–30s RPC would otherwise
      // invalidate every older response and leave this Node permanently unsynced.
      // A later response that already applied still wins over a late older one.
      let courseCheckSeq=0;
      let courseCheckApplied=0;
      async function verifyCourse(){
        const requestSeq=++courseCheckSeq;
        try{
          const state=await API.studentState();
          if(requestSeq<courseCheckApplied)return; // A newer poll already resolved this state.
          const stillCurrent=state.status==='active'&&state.current_node_ref===expectedNodeRef;
          const nextSettled=!stillCurrent||state.node_settled===true;
          if(!nextSettled){
            const remote=await Cloud.courseActivity(ctx);
            if(requestSeq<courseCheckApplied)return;
            if(remote?.id!==activity.id)throw Error('分類節點設定不一致');
          }
          if(requestSeq<courseCheckApplied)return;
          const wasSettled=courseNodeSettled;
          courseCheckApplied=requestSeq;
          courseNodeSettled=nextSettled;
          courseNodeCurrent=stillCurrent;
          if(!stillCurrent)clearPublishedResults();
          if(nextSettled&&!wasSettled)message('老師已切換或結算此節點，分類結果已保留。');
          renderStudent();
          if(stillCurrent && activity.collaboration==='group'&&!cloudGroup&&!loadingGroup)
            refreshGroupState();
          if(stillCurrent)await refreshPublishedResults();
        }catch(error){
          if(requestSeq<courseCheckApplied)return;
          courseCheckApplied=requestSeq;
          courseNodeCurrent=false;courseNodeSettled=true;renderStudent();clearPublishedResults();
          message(error.message||'無法驗證課程活動');
        }
      }
      verifyCourse();coursePoll=setInterval(verifyCourse,6000);
      addEventListener('beforeunload',()=>clearInterval(coursePoll),{once:true});
    }
    $('teacherTab').classList.add('hidden');$('compareTab').classList.add('hidden');
    $('teacherView').classList.add('hidden');$('cloudTeacherPanel').classList.add('hidden');
    if(sessionStudent){$('authorName').value=ctx?.studentCode||'';$('authorName').disabled=true;}
    if(sessionStudent&&activity.collaboration==='group'){
      const info=$('cloudStudentInfo');info.classList.remove('hidden');info.textContent='正在取得小組資料…';
      refreshGroupState();
      attachRealtime(ctx.sessionId,ctx.cloudConfig,()=>refreshGroupState());
      setInterval(()=>refreshGroupState(),6000);
    }else if(sessionStudent) hydrateIndividual();
    openView('student');
  }else{
    renderTeacher();if(savedDraft)message('已從本機儲存資料還原上次的分類進度。');
  }
})();
