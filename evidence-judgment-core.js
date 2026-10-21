/* Stage 3 R1 — data-driven evidence judgment; no lesson-specific vocabulary. */
(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.EvidenceJudgmentCore=api;})(function(){
 'use strict';
 const modes=['single','multiple','open'];
 const text=(v,n)=>String(v??'').trim().slice(0,n);
 const id=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`ej-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
 const defaults=()=>({schemaVersion:1,source:{id:id(),title:'',text:''},question:'',responseMode:'single',options:[{id:id(),label:''},{id:id(),label:''}],initialEnabled:true,rejudgeEnabled:true,reasonRequired:true,evidenceRequired:true,groupEnabled:false,discussionPrompt:'請與同伴比較支持各種判斷的證據。',rejudgePrompt:'檢視證據與交流後，你現在如何判斷？'});
 function normalize(raw){
  const d=defaults(),r=raw&&typeof raw==='object'?raw:{};
  const options=(Array.isArray(r.options)?r.options:d.options).slice(0,20).map((o,i)=>({id:text(o?.id,90)||`option-${i+1}`,label:text(o?.label,180)}));
  return {schemaVersion:1,source:{id:text(r.source?.id,90)||d.source.id,title:text(r.source?.title,120),text:text(r.source?.text,16000)},
   question:text(r.question,500),responseMode:modes.includes(r.responseMode)?r.responseMode:'single',options,
   initialEnabled:r.initialEnabled!==false,rejudgeEnabled:r.rejudgeEnabled!==false,reasonRequired:r.reasonRequired!==false,evidenceRequired:r.evidenceRequired!==false,groupEnabled:r.groupEnabled===true,
   discussionPrompt:text(r.discussionPrompt??d.discussionPrompt,600),rejudgePrompt:text(r.rejudgePrompt??d.rejudgePrompt,500)};
 }
 function validateSettings(raw){const a=normalize(raw);
  if(!a.question)return '請設定核心判斷問題';
  if(!a.source.text)return '請提供供學生尋找證據的文字材料';
  if(a.responseMode!=='open'){
   if(a.options.length<2||a.options.some(o=>!o.label))return '請提供至少兩項完整判斷選項';
   if(new Set(a.options.map(o=>o.id)).size!==a.options.length)return '選項 ID 不可重複';
   if(new Set(a.options.map(o=>o.label)).size!==a.options.length)return '選項文字不可重複';
  }
  return '';
 }
 function steps(a){const d=normalize(a);return [...(d.initialEnabled?['initial']:[]),'evidence',...(d.rejudgeEnabled?['final']:[])];}
 const blankJudgment=()=>({choices:[],open:'',reason:''});
 const blank=()=>({schemaVersion:1,phase:0,completed:false,initial:blankJudgment(),evidence:{quote:'',relation:'',judgment:blankJudgment()},final:blankJudgment()});
 function normalizeJudgment(raw,a){const d=raw||{},ids=new Set(a.options.map(o=>o.id));return {
  choices:[...new Set((Array.isArray(d.choices)?d.choices:[]).map(x=>String(x)).filter(x=>ids.has(x)))].slice(0,a.responseMode==='single'?1:20),
  open:text(d.open,1000),reason:text(d.reason,2000)};}
 function normalizeDraft(raw,activity){const a=normalize(activity),r=raw&&typeof raw==='object'?raw:{},out=blank();
  out.phase=Math.max(0,Math.min(steps(a).length,Math.floor(Number(r.phase)||0)));
  out.completed=r.completed===true&&out.phase===steps(a).length;
  out.initial=normalizeJudgment(r.initial,a);
  out.final=normalizeJudgment(r.final,a);
  out.evidence={quote:text(r.evidence?.quote,2000),relation:text(r.evidence?.relation,2000),judgment:normalizeJudgment(r.evidence?.judgment,a)};
  return out;}
 function validateJudgment(j,a,{requireReason=true}={}){
  const v=normalizeJudgment(j,a);
  if(a.responseMode==='open'? !v.open : !v.choices.length)return '請先完成判斷';
  if(requireReason&&a.reasonRequired&&!v.reason)return '請說明判斷理由';
  return '';
 }
 function validateStep(activity,draft,key){const a=normalize(activity),d=normalizeDraft(draft,a);
  if(key==='initial'||key==='final')return validateJudgment(d[key],a);
  if(key==='evidence'){
   if(!a.initialEnabled){const err=validateJudgment(d.evidence.judgment,a);if(err)return err;}
   if(a.evidenceRequired&&!d.evidence.quote)return '請選取或輸入支持判斷的文字證據';
   if(a.evidenceRequired&&!d.evidence.relation)return '請說明這段證據如何支持你的判斷';
   return '';
  }
  return '不支援的階段';}
 function judgmentSignature(j,a){const v=normalizeJudgment(j,a);return a.responseMode==='open'?v.open:v.choices.slice().sort().join('|');}
 function compare(activity,draft){const a=normalize(activity),d=normalizeDraft(draft,a);
  if(!a.initialEnabled||!a.rejudgeEnabled)return {comparable:false,changed:null};
  return {comparable:true,changed:judgmentSignature(d.initial,a)!==judgmentSignature(d.final,a)};}
 return {id,defaults,normalize,validateSettings,steps,blank,normalizeDraft,normalizeJudgment,validateJudgment,validateStep,compare};
});
