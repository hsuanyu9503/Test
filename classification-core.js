/* Classroom Interactive — reusable client-side classification domain model.
   No DOM, database, classroom-specific content, or remote storage dependency. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ClassificationCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const VERSION = 2;
  const id = () => globalThis.crypto?.randomUUID?.() || ('id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  const label = (value, limit) => String(value ?? '').trim().slice(0, limit);
  const bool = value => !!value;
  const httpsUrl = value => {
    if (!value) return '';
    try { const parsed = new URL(String(value)); return parsed.protocol === 'https:' ? parsed.href : ''; }
    catch { return ''; }
  };
  function newActivity() {
    return {schemaVersion:VERSION, id:id(), title:'素材分類與共同特徵',
      guidance:'請觀察素材，依你認為合理的標準進行分類，並說明理由。',
      mode:'free', collaboration:'individual', maxGroups:0, allowMultiple:false, requireAll:true,
      requireReason:true, allowRename:true, allowRevise:true,
      assets:[], presetGroups:[]};
  }
  function normalizeActivity(raw) {
    if (!raw || typeof raw !== 'object') throw Error('活動資料格式不正確');
    const a = newActivity();
    a.id = label(raw.id, 100) || id();
    a.title = label(raw.title, 120) || a.title;
    a.guidance = label(raw.guidance, 500);
    a.mode = raw.mode === 'assigned' ? 'assigned' : 'free';
    a.collaboration = raw.collaboration === 'group' ? 'group' : 'individual';
    a.maxGroups = Math.min(100, Math.max(0, Math.floor(Number(raw.maxGroups) || 0)));
    for (const key of ['allowMultiple','requireAll','requireReason']) a[key] = bool(raw[key]);
    a.allowRename = raw.allowRename !== false;
    a.allowRevise = raw.allowRevise !== false;
    const seen = new Set();
    a.assets = (Array.isArray(raw.assets) ? raw.assets : []).slice(0, 200).map(x => {
      if (!x || typeof x !== 'object') return null;
      return {id:label(x.id,100)||id(), label:label(x.label,500), image:httpsUrl(x.image)};
    }).filter(x => { if (!x || (!x.label && !x.image) || seen.has(x.id)) return false; seen.add(x.id); return true; });
    seen.clear();
    a.presetGroups = (Array.isArray(raw.presetGroups) ? raw.presetGroups : []).slice(0,100).map(x => {
      if (!x || typeof x !== 'object') return null;
      return {id:label(x.id,100)||id(),name:label(x.name,80)};
    }).filter(x => { if (!x || !x.name || seen.has(x.id)) return false; seen.add(x.id); return true; });
    a.schemaVersion = VERSION;
    return a;
  }
  function newBoard(a) {
    return {schemaVersion:VERSION, activityId:a.id, mode:a.mode,
      groups:a.mode==='assigned' ? a.presetGroups.map(g => ({...g,reason:'',assetOrder:[]})) : [],
      memberships:[]};
  }
  function normalizeBoard(raw,a) {
    if (!raw || typeof raw!=='object' || raw.activityId!==a.id || (raw.mode && raw.mode!==a.mode)) return newBoard(a);
    const template = newBoard(a);
    const candidates = Array.isArray(raw.groups)?raw.groups:[];
    const seen = new Set();
    if(a.mode === 'assigned') {
      template.groups = a.presetGroups.map(g => {
        const old = candidates.find(x => x?.id === g.id);
        return {id:g.id,name:a.allowRename ? (label(old?.name,80)||g.name) : g.name,
          reason:label(old?.reason,1000),assetOrder:Array.isArray(old?.assetOrder)?old.assetOrder.slice(0,200):[]};
      });
    } else {
      template.groups = candidates.slice(0,100).map(g => {
        if (!g || typeof g!=='object') return null;
        return {id:label(g.id,100)||id(), name:label(g.name,80), reason:label(g.reason,1000),
          assetOrder:Array.isArray(g.assetOrder)?g.assetOrder.slice(0,200):[]};
      }).filter(g => {if(!g || seen.has(g.id)) return false; seen.add(g.id);return true;});
    }
    const groupIds = new Set(template.groups.map(g => g.id));
    const assetIds = new Set(a.assets.map(x => x.id));
    const membershipSeen = new Set();
    for (const m of (Array.isArray(raw.memberships)?raw.memberships:[]).slice(0,20000)) {
      if (!m || !groupIds.has(m.groupId) || !assetIds.has(m.assetId)) continue;
      const key=m.assetId+'\u0000'+m.groupId;
      if (membershipSeen.has(key)) continue;
      if (!a.allowMultiple && template.memberships.some(x=>x.assetId===m.assetId)) continue;
      membershipSeen.add(key);
      template.memberships.push({assetId:m.assetId,groupId:m.groupId});
    }
    for (const g of template.groups) {
      const belonging = template.memberships.filter(x=>x.groupId===g.id).map(x=>x.assetId);
      g.assetOrder = [...new Set(g.assetOrder.filter(x=>belonging.includes(x)))];
      for(const x of belonging) if(!g.assetOrder.includes(x)) g.assetOrder.push(x);
    }
    return template;
  }
  function assign(board,a,assetId,groupId,checked) {
    if(!a.assets.some(x=>x.id===assetId)) return false;
    if(groupId && !board.groups.some(x=>x.id===groupId)) return false;
    if(!a.allowMultiple) {
      board.memberships=board.memberships.filter(m=>m.assetId!==assetId);
      for (const g of board.groups) g.assetOrder=g.assetOrder.filter(x=>x!==assetId);
    } else if(groupId) {
      board.memberships=board.memberships.filter(m=>!(m.assetId===assetId&&m.groupId===groupId));
      if(!checked) {const group=board.groups.find(x=>x.id===groupId);group.assetOrder=group.assetOrder.filter(x=>x!==assetId);}
    }
    if(checked && groupId) {
      board.memberships.push({assetId,groupId});
      const group=board.groups.find(x=>x.id===groupId);
      if(!group.assetOrder.includes(assetId)) group.assetOrder.push(assetId);
    }
    return true;
  }
  function validate(a,board) {
    if(!a.assets.length) return '請先新增分類素材';
    if(!board.groups.length) return '至少需要建立一個分類群組';
    if(board.groups.some(g=>!g.name.trim())) return '類別名稱不可留空';
    if(a.mode==='assigned' && a.presetGroups.length===0) return '教師尚未建立指定類別';
    if(a.maxGroups && board.groups.length>a.maxGroups) return '類別數量超過限制';
    if(a.requireAll && a.assets.some(asset=>!board.memberships.some(m=>m.assetId===asset.id))) return '尚有素材未完成分類';
    if(a.requireReason && board.groups.some(g=>!g.reason.trim())) return '每個類別都需要填寫共同特徵或理由';
    return '';
  }
  function comparisonMatrix(a,results) {
    return a.assets.map(asset => ({assetId:asset.id,assetLabel:asset.label||'圖片素材',
      assignments:results.map(result => {
        const ids=(result.memberships||[]).filter(m=>m.assetId===asset.id).map(m=>m.groupId);
        const names=(result.groups||[]).filter(g=>ids.includes(g.id)).map(g=>g.name);
        return names.length?names.join('、'):'未分類';
      })}));
  }
  return {VERSION, id, newActivity, normalizeActivity, newBoard, normalizeBoard, assign, validate, comparisonMatrix, httpsUrl};
});
