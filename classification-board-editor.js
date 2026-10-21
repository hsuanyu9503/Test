/* Stage 2 R6 — classification activity visual editor. No student data or Session access. */
(function(root){
  'use strict';
  const C=root.ClassificationCore;
  const $=id=>document.getElementById(id);
  const controls={title:'cbTitle',guidance:'cbGuidance',mode:'cbMode',collaboration:'cbCollab',maxGroups:'cbMaxGroups',allowMultiple:'cbMultiple',requireAll:'cbRequireAll',requireReason:'cbRequireReason',allowRename:'cbAllowRename',allowRevise:'cbAllowRevise'};
  const bools=new Set(['allowMultiple','requireAll','requireReason','allowRename','allowRevise']);
  let model=null;
  function notice(str){$('cbEditorStatus').textContent=str;}
  function normalize(raw){return C.normalizeActivity(raw?.activity||raw);}
  function syncJSON(){ $('classificationBoardJSON').value=JSON.stringify(model,null,2); }
  function node(tag,text,className){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;}
  function input(value,maxLength,callback){const el=document.createElement('input');el.type='text';el.maxLength=maxLength;el.value=value;el.addEventListener('input',()=>callback(el.value));return el;}
  function action(label,fn,disabled=false){const b=node('button',label,'btn btn-secondary');b.type='button';b.disabled=disabled;b.addEventListener('click',fn);return b;}
  function changed(){syncJSON();updateCounts();}
  function updateCounts(){ $('cbAssetCount').textContent=`${model.assets.length} 項`; }
  function rowButtons(arr,idx,render,onRemove,onCopy){
    const box=node('div',null,'cb-item-actions');
    box.append(action('↑',()=>{if(idx<=0)return;[arr[idx-1],arr[idx]]=[arr[idx],arr[idx-1]];changed();render();},idx===0));
    box.append(action('↓',()=>{if(idx>=arr.length-1)return;[arr[idx],arr[idx+1]]=[arr[idx+1],arr[idx]];changed();render();},idx>=arr.length-1));
    if(onCopy)box.append(action('複製',()=>onCopy(idx)));
    box.append(action('刪除',()=>{if(!confirm('確定刪除這一項？尚未儲存的變更可取消編輯還原。'))return;arr.splice(idx,1);changed();render();}));
    return box;
  }
  function renderAssets(){
    const list=$('cbAssetList');list.replaceChildren();updateCounts();
    if(!model.assets.length)list.append(node('p','尚未新增素材；可新增文字、圖片網址或批次建立。','field-help'));
    model.assets.forEach((asset,i)=>{
      const item=node('div',null,'cb-item');
      const title=node('span',`素材 ${i+1}`,'cb-item-title');
      const label=node('label',null,'field');label.append(node('span','素材文字'));
      label.append(input(asset.label,500,v=>{asset.label=v;changed();}));
      const image=node('label',null,'field');image.append(node('span','圖片 HTTPS 網址'));
      const url=input(asset.image,2048,v=>{asset.image=v;changed();});url.setAttribute('inputmode','url');image.append(url);
      const preview=node('small',asset.id,'cb-id');preview.title='此素材的永久識別 ID；修改順序不改變 ID';
      item.append(title,label,image,preview,rowButtons(model.assets,i,renderAssets,null,index=>{
        if(model.assets.length>=200)return notice('素材上限為 200 項');
        const original=model.assets[index];model.assets.splice(index+1,0,{...original,id:C.id()});changed();renderAssets();
      }));
      list.append(item);
    });
  }
  function renderGroups(){
    const list=$('cbGroupList');list.replaceChildren();
    if(!model.presetGroups.length)list.append(node('p','尚未設定指定類別。自由分類模式可略過。','field-help'));
    model.presetGroups.forEach((group,i)=>{
      const item=node('div',null,'cb-item');item.append(node('span',`類別 ${i+1}`,'cb-item-title'));
      const label=node('label',null,'field');label.append(node('span','類別名稱'),input(group.name,80,v=>{group.name=v;changed();}));
      item.append(label,node('small',group.id,'cb-id'),rowButtons(model.presetGroups,i,renderGroups));list.append(item);
    });
  }
  function render(){
    for(const [key,id] of Object.entries(controls)){
      const el=$(id);if(!el)continue;
      if(bools.has(key))el.checked=!!model[key];else el.value=String(model[key]??'');
    }
    renderAssets();renderGroups();syncJSON();
  }
  function load(raw){model=normalize(raw);render();notice('分類活動已載入；修改後請按「儲存活動」。');return model;}
  function ensure(){if(!model)load(C.newActivity());}
  // The advanced JSON textarea is kept as the exact source for legacy imports and tests.
  function read(){
    ensure();
    const raw=JSON.parse($('classificationBoardJSON').value||'null');
    const candidate=normalize(raw);
    // Do not silently discard incomplete items during editing: surface validation.
    const assets=Array.isArray(raw?.assets)?raw.assets:(Array.isArray(raw?.activity?.assets)?raw.activity.assets:[]);
    if(assets.some(a=>a&&!String(a.label||'').trim()&&!String(a.image||'').trim()))throw Error('素材的文字與圖片不能同時空白');
    if(assets.some(a=>a?.image&&!C.httpsUrl(a.image)))throw Error('圖片網址必須使用有效 HTTPS 網址');
    if(candidate.assets.length!==assets.length)throw Error('素材有重複 ID 或無效內容，請檢查');
    if(candidate.mode==='assigned'&&candidate.presetGroups.some(x=>!x.name.trim()))throw Error('指定類別不可空白');
    return candidate;
  }
  function addAsset(label,image){
    ensure();
    if(model.assets.length>=200)throw Error('素材數量最多 200 項');
    const clean=String(label||'').trim().slice(0,500), raw=String(image||'').trim();
    const url=C.httpsUrl(raw);
    if(raw&&!url)throw Error('圖片必須是有效 HTTPS 網址');
    if(!clean&&!url)throw Error('請輸入素材文字或圖片網址');
    model.assets.push({id:C.id(),label:clean,image:url});changed();renderAssets();
  }
  function bind(){
    if(!$('classificationBoardVisualEditor'))return;
    for(const [key,id] of Object.entries(controls)){
      const el=$(id);el.addEventListener(bools.has(key)||key==='mode'||key==='collaboration'?'change':'input',()=>{
        ensure();
        model[key]=bools.has(key)?el.checked:(key==='maxGroups'?Math.min(100,Math.max(0,Math.floor(Number(el.value)||0))):el.value);
        changed();
      });
    }
    $('cbAddAssetBtn').addEventListener('click',()=>{
      try{addAsset($('cbAddAssetText').value,$('cbAddAssetImage').value);$('cbAddAssetText').value='';$('cbAddAssetImage').value='';notice('已新增素材');}catch(e){notice(e.message);}
    });
    $('cbBatchAssetBtn').addEventListener('click',()=>{
      try{
        const lines=$('cbBatchAsset').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
        if(!lines.length)throw Error('請先輸入批次素材');
        if(model.assets.length+lines.length>200)throw Error('批次素材超過 200 項上限');
        for(const label of lines)addAsset(label,'');
        $('cbBatchAsset').value='';notice(`已新增 ${lines.length} 筆素材`);
      }catch(e){notice(e.message);}
    });
    $('cbAddGroupBtn').addEventListener('click',()=>{
      const name=$('cbAddGroupName').value.trim();if(!name)return notice('類別名稱不能留空');
      ensure();if(model.presetGroups.length>=100)return notice('最多 100 個類別');
      model.presetGroups.push({id:C.id(),name:name.slice(0,80)});$('cbAddGroupName').value='';changed();renderGroups();
    });
    $('cbApplyJSON').addEventListener('click',()=>{
      try{const raw=JSON.parse($('classificationBoardJSON').value);load(raw);notice('JSON 已套用，請按「儲存活動」。');}
      catch(e){notice(`JSON 有誤：${e.message}`);}
    });
  }
  bind();
  root.ClassificationBoardEditor={ensure,load,read,render};
})(window);
