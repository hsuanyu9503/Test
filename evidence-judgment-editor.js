/* Stage 3 R1 visual activity editor; uses the same activity registry as existing modules. */
(function(root){'use strict';const C=root.EvidenceJudgmentCore;
 const $=id=>document.getElementById(id),section=$('evidenceJudgmentEditorSection');if(!section||!C)return;
 let model=C.defaults();
 const fields={question:'ejQuestion',sourceTitle:'ejSourceTitle',sourceText:'ejSourceText',responseMode:'ejResponseMode',discussionPrompt:'ejDiscussion',rejudgePrompt:'ejRejudge'};
 function renderOptions(){const wrap=$('ejOptions');wrap.replaceChildren();for(const [i,opt] of model.options.entries()){
  const row=document.createElement('div');row.className='ej-editor-option';
  const label=document.createElement('span');label.textContent=`${i+1}.`;
  const input=document.createElement('input');input.value=opt.label;input.maxLength=180;input.setAttribute('aria-label',`選項 ${i+1}`);
  input.addEventListener('input',()=>{opt.label=input.value;});
  const move=document.createElement('button');move.type='button';move.textContent='↑';move.title='上移';move.disabled=i===0;
  move.addEventListener('click',()=>{[model.options[i-1],model.options[i]]=[model.options[i],model.options[i-1]];renderOptions();});
  const copy=document.createElement('button');copy.type='button';copy.textContent='複製';
  copy.addEventListener('click',()=>{if(model.options.length<20){model.options.splice(i+1,0,{id:C.id(),label:opt.label});renderOptions();}});
  const remove=document.createElement('button');remove.type='button';remove.textContent='刪除';
  remove.addEventListener('click',()=>{model.options.splice(i,1);renderOptions();});
  row.append(label,input,move,copy,remove);wrap.append(row);
 }
 $('ejOptionsSection').hidden=model.responseMode==='open';}
 function render(){for(const [k,v] of Object.entries(fields)){$(v).value=k==='sourceTitle'?model.source.title:k==='sourceText'?model.source.text:model[k]||'';}
  for(const [k,v] of Object.entries({initialEnabled:'ejInitial',rejudgeEnabled:'ejRejudgeEnabled',reasonRequired:'ejReasonRequired',evidenceRequired:'ejEvidenceRequired',groupEnabled:'ejGroupEnabled'}))$(v).checked=model[k];renderOptions();}
 function load(raw){model=C.normalize(raw);render();}
 function read(){for(const [key,id] of Object.entries(fields)){
  if(key==='sourceTitle')model.source.title=$(id).value;
  else if(key==='sourceText')model.source.text=$(id).value;
  else model[key]=$(id).value;
 }
  for(const [key,id] of Object.entries({initialEnabled:'ejInitial',rejudgeEnabled:'ejRejudgeEnabled',reasonRequired:'ejReasonRequired',evidenceRequired:'ejEvidenceRequired',groupEnabled:'ejGroupEnabled'}))model[key]=$(id).checked;
  model.options.forEach((o,i)=>{const input=$('ejOptions').children[i]?.querySelector('input');if(input)o.label=input.value;});
  model=C.normalize(model);return model;}
 $('ejAddOption').addEventListener('click',()=>{read();if(model.options.length<20){model.options.push({id:C.id(),label:''});renderOptions();}});
 $('ejResponseMode').addEventListener('change',()=>{read();renderOptions();});
 load(model);
 root.EvidenceJudgmentEditor={load,read,ensure:()=>{if(!model)load(C.defaults());}};
})(window);
