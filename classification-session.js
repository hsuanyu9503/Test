/* Classification Session bridge — participant/teacher-scoped RPCs, no service keys. */
(function (root) {
  'use strict';
  function configFor(ctx) {
    const c=ctx?.cloudConfig || root.ClassroomSessionAPI?.getConfig?.();
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(c?.url||'')) throw Error('請先設定正確的 Supabase 專案');
    if(!c?.key || c.key.startsWith('sb_secret_')) throw Error('只能使用 Supabase Publishable key');
    return c;
  }
  async function rpc(name,params,ctx) {
    const c=configFor(ctx);
    // A publishable key is not necessarily a JWT: align with the existing Session API.
    const response=await fetch(`${c.url}/rest/v1/rpc/${name}`,{
      method:'POST',headers:{'apikey':c.key,'Content-Type':'application/json'},
      body:JSON.stringify(params)
    });
    const text=await response.text(); let data;
    try{data=text?JSON.parse(text):null;}catch{data=null;}
    if(!response.ok)throw Error(data?.message||data?.hint||`同步失敗（HTTP ${response.status}）`);
    return data;
  }
  async function submitIndividual(ctx,board) {
    const result=await rpc('submit_classification_individual',{
      p_session_id:ctx.sessionId,p_participant_token:ctx.participantToken,p_board:board
    },ctx);
    root.ClassroomSessionAPI?.publishRealtime?.(ctx.sessionId,'classification-board',ctx.cloudConfig);
    return result;
  }
  function individualState(ctx) {return rpc('get_classification_individual_board',{
    p_session_id:ctx.sessionId,p_participant_token:ctx.participantToken
  },ctx);}
  function groupState(ctx) {return rpc('get_classification_group_state',{
    p_session_id:ctx.sessionId,p_participant_token:ctx.participantToken,p_node_ref:ctx.currentNodeRef||''
  },ctx);}
  function submitGroup(ctx,board,revision) {return rpc('submit_classification_group_board',{
    p_session_id:ctx.sessionId,p_participant_token:ctx.participantToken,p_node_ref:ctx.currentNodeRef||'',
    p_expected_revision:revision,p_board:board
  },ctx);}
  function teacherGroups(meta) {return rpc('get_classification_teacher_boards',{
    p_session_id:meta.id,p_teacher_token:meta.teacherToken,p_node_ref:meta.currentNodeRef||''
  },meta);}
  function teacherActivity(meta) {return rpc('get_classification_teacher_activity',{
    p_session_id:meta.id,p_teacher_token:meta.teacherToken
  },meta);}
  const courseParams=ctx=>({p_session_id:ctx.sessionId,p_participant_token:ctx.participantToken,
    p_node_ref:ctx.currentNodeRef||''});
  function courseActivity(ctx){return rpc('get_classification_course_student_activity',courseParams(ctx),ctx);}
  function courseIndividualState(ctx){return rpc('get_classification_course_individual',courseParams(ctx),ctx);}
  async function submitCourseIndividual(ctx,board){
    const result=await rpc('submit_classification_course_individual',{...courseParams(ctx),p_board:board},ctx);
    root.ClassroomSessionAPI?.publishRealtime?.(ctx.sessionId,'classification-board',ctx.cloudConfig);
    return result;
  }
  function registerCourseNode(meta,nodeRef,board){return rpc('register_classification_course_node',{
    p_session_id:meta.id,p_teacher_token:meta.teacherToken,p_node_ref:nodeRef,p_activity:board
  },meta);}
  function teacherPublication(meta,nodeRef){return rpc('get_classification_course_teacher_publication',{
    p_session_id:meta.id,p_teacher_token:meta.teacherToken,p_node_ref:nodeRef
  },meta);}
  async function setPublication(meta,nodeRef,published,revision){
    const result=await rpc('set_classification_course_publication',{
      p_session_id:meta.id,p_teacher_token:meta.teacherToken,p_node_ref:nodeRef,
      p_published:published,p_expected_revision:revision
    },meta);
    root.ClassroomSessionAPI?.publishRealtime?.(meta.id,'classification-publication',meta.cloudConfig);
    return result;
  }
  function studentPublished(ctx){return rpc('get_classification_course_published',courseParams(ctx),ctx);}
  root.ClassificationSession={rpc,submitIndividual,individualState,groupState,submitGroup,teacherGroups,teacherActivity,
    registerCourseNode,courseActivity,courseIndividualState,submitCourseIndividual,
    teacherPublication,setPublication,studentPublished};
})(window);
