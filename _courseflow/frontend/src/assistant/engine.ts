import type {Seat,Term,Watch,SearchResult} from '../api.ts';
import {classifyIntent} from './classifier.ts';

export type AssistantConversationContext={courses:string[];term:string};
export type AssistantContext={terms:Term[];selectedTerm:string;watches:Watch[];freeMode:boolean;staleSeconds?:number};
export type AssistantServices={
  search(term:string,course:string):Promise<SearchResult>;
  getTerms():Promise<Term[]>;
  getWatches():Promise<Watch[]>;
};
export type AssistantReply={
  text:string;intent:string;sections?:Seat[];terms?:Term[];
  source?:{label:string;url:string};queriedAt?:string;warning?:string;
  context?:AssistantConversationContext;
};

const OFFICIAL='https://nubanner.neu.edu/StudentRegistrationSsb/ssb/term/termSelection?mode=search';
const MAX_WATCH_GROUPS=3;
const coursePattern=/\b([a-z]{2,6})[\s-]*([0-9]{4})([a-z]?)\b/gi;
const nonSubjects=new Set(['SPRING','SUMMER','FALL','AUTUMN','WINTER','TERM','IN','FOR','FROM','DURING','YEAR']);
const seasonPattern='(?:summer\\s*(?:1|2|i{1,2})?|spring|fall|autumn|winter|春季?|秋季?|冬季?|夏(?:季)?[一二12]?)';
const pick=(zh:boolean,chinese:string,english:string)=>zh?chinese:english;
const codes=(input:string)=>[...new Set([...input.matchAll(coursePattern)]
  .filter(match=>!nonSubjects.has(match[1].toUpperCase()))
  .map(match=>(match[1]+match[2]+match[3]).toUpperCase()))];
const validCode=(code:string)=>/^[A-Z]{2,6}[0-9]{4}[A-Z]?$/.test(code);
const validTerms=(terms:Term[])=>Array.isArray(terms)?terms.filter(t=>t&&/^\d{6}$/.test(t.code)&&typeof t.description==='string'):[];
const termLabel=(terms:Term[],code:string)=>terms.find(term=>term.code===code)?.description||code;
const unique=(items:string[])=>[...new Set(items)];

function season(value:string):string {
  const text=value.toLowerCase();
  if(/summer\s*(?:2|ii\b)|夏(?:季)?[二2]/.test(text))return 'summer2';
  if(/summer\s*(?:1|i\b)|夏(?:季)?[一1]/.test(text))return 'summer1';
  if(/summer|夏/.test(text))return 'summer';
  if(/spring|春/.test(text))return 'spring';
  if(/fall|autumn|秋/.test(text))return 'fall';
  if(/winter|冬/.test(text))return 'winter';
  return '';
}

function termRequest(input:string) {
  // A course such as CS2027 is not a request for year 2027; CRNs are not term codes.
  const text=input.replace(coursePattern,(whole,subject:string)=>nonSubjects.has(subject.toUpperCase())?whole:' ')
    .replace(/\bcrn\s*[:#]?\s*\d{4,8}\b/gi,' ');
  const numeric=unique([...text.matchAll(/\b20\d{4}\b/g)].map(match=>match[0]));
  const expressions=[
    new RegExp(`(${seasonPattern})\\s*(?:semester|term|学期)?\\s*[-,]?\\s*(20\\d{2})(?!\\d)`,'gi'),
    new RegExp(`(20\\d{2})(?!\\d)\\s*年?\\s*[-,]?\\s*(${seasonPattern})`,'gi'),
  ];
  const named=expressions.flatMap((pattern,index)=>[...text.matchAll(pattern)].map(match=>({
    season:season(match[index===0?1:2]),year:match[index===0?2:1],label:match[0],
  })));
  const names=[...new Map(named.map(item=>[item.season+item.year,item])).values()];
  const relative=/下(?:个)?学期|上(?:个)?学期|本学期|这个学期|当前学期|明年|今年|next\s+(?:term|semester|spring|fall|summer|winter|year)|last\s+(?:term|semester)|(?:this|current)\s+(?:term|semester|year)/i.test(text);
  const incomplete=!numeric.length&&!names.length&&(relative||new RegExp(seasonPattern,'i').test(text)||/(?:^|\D)20\d{2}(?!\d)/.test(text));
  return {numeric,names,incomplete,explicit:!!(numeric.length||names.length||incomplete)};
}

function scopeGuard(input:string,zh:boolean):AssistantReply|undefined {
  const unsafe=/https?:\/\/|javascript:|<script|system\s*prompt|developer\s*message|ignore.{0,35}(?:instructions|rules)|change.{0,20}(?:instructions|rules)|read.{0,20}(?:private|messages)|忽略.{0,20}(?:指令|规则)|系统提示词|执行.{0,12}(?:命令|代码)|读取.{0,8}(?:私信|密码)|document\.cookie|\bfetch\s*\(/i;
  if(unsafe.test(input))return {intent:'unsupported',text:pick(zh,
    '我只能只读查询固定的学校公开课程数据，不能打开自定义链接、执行代码或指令。请直接输入课程代码和学期。',
    'I can only read course data from the fixed public school source. I cannot open custom URLs or execute code or instructions. Ask with a course code and term.')};
  if(/prereq|eligib|can\s+i\s+(?:enroll|register)|allowed\s+to\s+(?:enroll|register)|先修|选课资格|有资格|能不能选|能否选|能选这门/i.test(input))
    return {intent:'unsupported',text:pick(zh,'公开余位不能证明你满足先修、专业限制或选课资格。我不读取学生账号，也不能判断资格；请在 Banner 或向 advisor 确认。',
      'A public seat count does not establish prerequisites, major restrictions, or your eligibility. I do not read student accounts or decide eligibility; confirm in Banner or with your advisor.')};
  if(/professor|instructor|教授|老师/.test(input.toLowerCase()))return {intent:'unsupported',text:pick(zh,
    '我不评价、排名或推荐教授。课程搜索可以显示来源提供的任课信息；这个助手只解释余位、学期和使用方式。',
    'I do not rate, rank, or recommend instructors. Course search can show supplied instructor details; this assistant handles seats, terms, and product help.')};
  if(/predict|forecast|tomorrow|next\s+(?:week|month)|预测|明天|后天|下周|下个月/i.test(input))return {intent:'unsupported',text:pick(zh,
    '我不能预测未来空位。可以查询当前返回的席位快照，但不能保证之后会有位或一定能注册。',
    'I cannot predict future seats. I can query the currently returned snapshot, which cannot guarantee a future opening or successful registration.')};
  if(/\b(?:exams?|assignments?|homework|syllabus|grades?|gpa|inheritance|weather|jokes?)\b|考试|作业|教学大纲|评分|成绩|天气|笑话/i.test(input))return {intent:'unsupported',text:pick(zh,
    '我只处理课程余位、学期和 CourseFlow 使用说明；不回答考试、作业、成绩或其他领域的问题。没有发起课程查询。',
    'I handle course seats, terms, and CourseFlow product help, not exams, assignments, grades, or unrelated topics. No course query was made.')};
  if(/^(?:please\s+)?(?:register|enroll|drop|delete|remove|subscribe|add|track|watch)\b|(?:can|could)\s+you\s+(?:register|enroll|drop|delete|remove|add)|(?:帮我|替我|直接|立即|自动).{0,15}(?:报名|抢课|选上|选课|退|删|关注)|(?:退掉|退课|删除|自动注册)/i.test(input))
    return {intent:'unsupported',text:pick(zh,
      '这个助手不会注册、退课、添加或删除关注。你可以自行点击课程卡片的关注按钮；真正的注册或退课需要在学校系统完成。',
      'This assistant does not register, drop classes, or add or remove watches. Use the course card buttons yourself to manage watches; registration and dropping take place in the school system.')};
  return undefined;
}

async function resolveTerm(input:string,context:AssistantContext,services:AssistantServices,zh:boolean,previous?:AssistantConversationContext):Promise<{term:string;terms:Term[]}|{reply:AssistantReply}> {
  let terms=validTerms(context.terms),refreshed=false,failed=false;
  const refresh=async()=>{if(refreshed)return;refreshed=true;try{terms=validTerms(await services.getTerms());}catch{failed=true;}};
  const requested=termRequest(input);
  const clarify=(message:string):{reply:AssistantReply}=>({reply:{intent:'clarify',text:message,terms,
    ...(failed?{warning:pick(zh,'学期列表刷新失败，已有列表可能不完整。','Term refresh failed; the loaded list may be incomplete.')}:{}),
  }});
  if(!terms.length)await refresh();
  if(requested.incomplete)return clarify(pick(zh,
    '请指定明确的学期和年份，例如 Fall 2026 或 Spring 2027。“下学期”或只有年份不足以确定查询，我不会自动改用当前选中的学期。',
    'Specify a term and year, such as Fall 2026 or Spring 2027. A relative term or year alone is ambiguous; I will not silently use the selected term.'));
  if(requested.numeric.length>1||requested.names.length>1)return clarify(pick(zh,'一次只能比较同一学期。请选择一个学期再查询。','Choose one term; a comparison uses the same term for all courses.'));
  const matches=()=>terms.filter(term=>{
    const name=requested.names[0];
    if(requested.numeric.length&&term.code!==requested.numeric[0])return false;
    if(name){const found=season(term.description);return term.description.includes(name.year)&&(name.season==='summer'?found.startsWith('summer'):found===name.season);}
    return true;
  });
  if(requested.numeric.length||requested.names.length){
    let found=matches();
    if(!found.length){await refresh();found=matches();}
    if(found.length!==1){
      const label=requested.names[0]?.label||requested.numeric[0];
      return clarify(found.length>1?pick(zh,`${label} 对应多个学期，请从列表选择具体的 Summer 1、Summer 2 或其他学期。`,`${label} matches multiple terms. Select the specific Summer 1, Summer 2, or other term.`):pick(zh,
        `当前返回的学期列表中没有 ${label}；可能尚未发布，或列表暂时不完整。我没有改查其他学期。请从可用列表选择，或稍后再试。`,
        `${label} is not in the returned term list. It may not be published yet, or the list may be incomplete. I have not substituted another term; choose an available term or try later.`));
    }
    return {term:found[0].code,terms};
  }
  const selected=context.selectedTerm||previous?.term||'';
  if(!terms.some(term=>term.code===selected))await refresh();
  if(!terms.some(term=>term.code===selected))return clarify(pick(zh,'请先选择一个可用学期；没有有效学期时我不会猜测。','Select an available term first; I will not guess without a valid term.'));
  return {term:selected,terms};
}

function fresh(seat:Seat,seconds:number,now:number):boolean {
  const checked=Date.parse(seat.checkedAt);
  return !seat.errorMessage&&Number.isFinite(checked)&&checked<=now+60000&&now-checked<=seconds*1000
    &&Number.isInteger(seat.available)&&Number.isInteger(seat.capacity)&&seat.capacity>=0&&seat.available<=seat.capacity;
}
function unknownSeat(seat:Seat,reason:string,now:number):Seat {
  return {...seat,errorMessage:reason,lastAttemptAt:new Date(now).toISOString()};
}
function seatText(seat:Seat,zh:boolean,current:boolean):string {
  const name=`${seat.code} · CRN ${seat.crn}`;
  if(!current)return pick(zh,`${name}：余位未知；上次记录 ${seat.available}（${seat.checkedAt}），此次未核实。`,
    `${name}: availability unknown; last known ${seat.available} at ${seat.checkedAt}, not verified now.`);
  return pick(zh,`${name}：${seat.available} 个余位（容量 ${seat.capacity}）。`,`${name}: ${seat.available} available (capacity ${seat.capacity}).`);
}

type Query={term:string;code:string;seats:Seat[];failed:boolean;truncated:boolean;fetchedAt?:string};
async function query(term:string,code:string,services:AssistantServices,known:Seat[],now:number):Promise<Query> {
  try {
    const result=await services.search(term,code);
    if(!result||!Array.isArray(result.sections)||!Number.isFinite(Date.parse(result.fetchedAt)))throw new Error('Invalid response');
    if(result.sections.some(seat=>!seat||seat.term!==term||seat.code!==code||!['banner','demo'].includes(seat.source)
      ||!Number.isInteger(seat.available)||!Number.isInteger(seat.capacity)||!Number.isFinite(Date.parse(seat.checkedAt))))throw new Error('Invalid response');
    return {term,code,seats:result.sections.slice(0,50),failed:false,truncated:result.truncated||result.sections.length>50,fetchedAt:result.fetchedAt};
  } catch {
    return {term,code,seats:known.filter(seat=>seat.term===term&&seat.code===code).map(seat=>unknownSeat(seat,'Assistant refresh failed; last known only.',now)),failed:true,truncated:false};
  }
}
function metadata(queries:Query[],zh:boolean):Pick<AssistantReply,'source'|'queriedAt'> {
  const successful=queries.filter(item=>!item.failed);
  const dates=successful.map(item=>item.fetchedAt!).filter(Boolean).sort();
  const demo=queries.some(item=>item.seats.some(seat=>seat.source==='demo'));
  return {...(successful.length&&!demo?{source:{label:pick(zh,'学校公开 Banner 查询','Public school Banner search'),url:OFFICIAL}}:{}),
    ...(dates.length?{queriedAt:dates[0]}:{})};
}

function selectors(input:string):{kind:'crn'|'section';value:string}[] {
  const found:{kind:'crn'|'section';value:string}[]=[];
  for(const match of input.matchAll(/\b(crn|sections?|sec)\s*[:#]?\s*(\d{1,8})(?:\s*(?:and|vs\.?|versus|和|与|、|,)\s*(\d{1,8}))?/gi)){
    const kind=match[1].toLowerCase()==='crn'?'crn':'section';
    found.push({kind,value:match[2]});if(match[3])found.push({kind,value:match[3]});
  }
  for(const match of input.matchAll(/(?:第\s*)?(\d{1,3})\s*班/g))found.push({kind:'section',value:match[1]});
  return [...new Map(found.map(item=>[item.kind+item.value,item])).values()];
}
const selectorMatches=(seat:Seat,selector:{kind:'crn'|'section';value:string})=>selector.kind==='crn'?seat.crn===selector.value:seat.sectionNumber.replace(/^0+/,'')===selector.value.replace(/^0+/,'');

async function watchesReply(input:string,context:AssistantContext,services:AssistantServices,zh:boolean,now:number):Promise<AssistantReply> {
  let watches=context.watches,listFailed=false;
  try{watches=await services.getWatches();if(!Array.isArray(watches))throw new Error('Invalid list');}catch{watches=context.watches;listFailed=true;}
  const valid=watches.filter(watch=>watch?.section&&validCode(watch.section.code)&&/^\d{6}$/.test(watch.section.term)).slice(0,20);
  if(!valid.length)return {intent:'watchlist',text:pick(zh,'当前没有可查询的关注课程。请先在搜索结果中自行添加关注。','There are no saved courses to check. Add a watch yourself from the search results first.'),
    ...(listFailed?{warning:pick(zh,'关注列表读取失败，以上只依据本页已有列表。','Watchlist refresh failed; this uses the list already on this page.')}:{}),sections:[]};
  const known=valid.map(watch=>watch.section);
  const groups=[...new Map(known.map(seat=>[seat.term+':'+seat.code,{term:seat.term,code:seat.code}])).values()];
  const checked=groups.slice(0,MAX_WATCH_GROUPS),skipped=groups.slice(MAX_WATCH_GROUPS),queries:Query[]=[];
  // Serial, bounded requests avoid flooding the school's public search queue.
  for(const group of checked)queries.push(await query(group.term,group.code,services,known,now));
  const sections:Seat[]=[],warnings:string[]=[],lines:string[]=[];
  for(const result of queries){
    for(const original of known.filter(seat=>seat.term===result.term&&seat.code===result.code)){
      const found=result.seats.find(seat=>seat.id===original.id);
      sections.push(found||unknownSeat(original,'This watched section was not returned; availability is unknown.',now));
    }
    if(result.failed)warnings.push(pick(zh,`${result.code}（${result.term}）查询失败，不能判断余位。`,`${result.code} (${result.term}) failed; availability is unknown.`));
    if(result.truncated)warnings.push(pick(zh,`${result.code} 的结果不完整，未返回的关注 section 不能视为满员。`,`${result.code} returned partial results; a missing watched section cannot be treated as full.`));
  }
  const seconds=context.staleSeconds??900,current=sections.filter(seat=>fresh(seat,seconds,now));
  const thresholdMode=/threshold|阈值|达到.*提醒/i.test(input);
  const watchFor=(seat:Seat)=>valid.find(watch=>watch.section.id===seat.id)!;
  const open=current.filter(seat=>thresholdMode?(watchFor(seat).enabled&&seat.available>=watchFor(seat).threshold):seat.available>0);
  lines.push(thresholdMode?pick(zh,`本次检查了 ${checked.length} 个“学期＋课程”组。成功且未过期的数据中，${open.length} 个 section 达到已启用关注的提醒阈值：`,
    `Checked ${checked.length} term/course groups. Among successful, fresh results, ${open.length} sections meet an enabled watch's alert threshold:`):pick(zh,`本次检查了 ${checked.length} 个“学期＋课程”组。成功且未过期的数据中，${open.length} 个已关注 section 有空位：`,
    `Checked ${checked.length} term/course groups. Among successful, fresh results, ${open.length} watched sections have seats:`));
  if(thresholdMode)lines.push(...current.map(seat=>{
    const watch=watchFor(seat),met=watch.enabled&&seat.available>=watch.threshold;
    return seatText(seat,zh,true)+' '+pick(zh,`提醒阈值 ${watch.threshold}；${!watch.enabled?'关注已暂停':met?'已达到':'未达到'}。`,
      `Alert threshold ${watch.threshold}; ${!watch.enabled?'watch paused':met?'met':'not met'}.`);
  }));
  else if(open.length)lines.push(...open.map(seat=>seatText(seat,zh,true)));
  if(!open.length)lines.push(pick(zh,'这不表示查询失败、未返回或未检查的课程已经满员。','This does not mean failed, missing, or unchecked courses are full.'));
  const uncertain=sections.filter(seat=>!fresh(seat,seconds,now));
  if(uncertain.length){lines.push(...uncertain.map(seat=>seatText(seat,zh,false)));warnings.push(pick(zh,'部分记录已过期或未能核实，余位未知。','Some observations are stale or unverified; their availability is unknown.'));}
  if(skipped.length)warnings.push(pick(zh,`为控制请求数，本次未检查：${skipped.map(group=>`${group.code} (${group.term})`).join(', ')}。没有更新这些课程的结论。`,
    `Request limit: not checked in this answer: ${skipped.map(group=>`${group.code} (${group.term})`).join(', ')}. No current conclusion was made for them.`));
  if(listFailed)warnings.push(pick(zh,'关注列表读取失败，本次使用页面已有列表。','Watchlist refresh failed; the previously loaded list was used.'));
  if(sections.some(seat=>seat.source==='demo'))warnings.push(pick(zh,'这些是模拟演示数据，不是学校实时席位。','These are synthetic demo data, not live school seats.'));
  return {intent:'watchlist',text:lines.join('\n'),sections,...metadata(queries,zh),...(warnings.length?{warning:warnings.join(' ')}:{})};
}

function faq(intent:string,free:boolean,zh:boolean):AssistantReply {
  const texts:Record<string,[string,string]>={
    notifications:free?[
      '免费版在网页打开、可见且浏览器没有休眠时，约每 5 分钟检查已关注课程。达到你设置的阈值后可显示站内提醒；设备通知需要浏览器支持并由你授权。关闭页面后不会继续检查或提醒，也没有邮件推送。助手本身不会替你开启通知。',
      'The free version checks watches about every 5 minutes while the page is open, visible, and the browser is awake. It can show in-app alerts when your threshold is reached; device notifications require browser support and your permission. Checking and alerts stop when the page closes, and it does not send email. This assistant does not enable notifications for you.']:[
      '完整服务由服务器检查已关注课程；邮件或 Web Push 取决于部署者配置。演示模式只产生模拟提醒，不发送真实邮件。助手不会替你修改阈值或通知权限。',
      'The full service checks watched courses on its server. Email or Web Push depends on deployment configuration. Demo mode only creates simulated alerts and sends no real email. This assistant does not change thresholds or notification permissions.'],
    privacy:free?[
      '免费版不需要学校账号或注册账号。关注和设置保存在当前浏览器；查询服务会收到你查询的课程代码、学期及通常的网络请求信息。不会自动跨设备同步，分享设备的人可能看到浏览器中的关注。课程助手的意图模型在设备上运行；问题原文不发送给外部 AI 服务。',
      'The free version needs no school login or registration. Watches and settings stay in this browser; the lookup service receives course codes, terms, and ordinary network request information. There is no automatic cross-device sync, and people sharing this browser may see saved watches. The intent model runs on-device; your full question is not sent to an external AI service.']:[
      '学校席位查询不需要学校账号。完整服务使用自己的邮箱账号保存并同步关注；具体保存方式取决于部署。课程助手的意图模型在设备上运行，问题原文不发送给外部 AI 服务。',
      'Public school-seat lookup does not need a school login. The full service uses its own email account to save and sync watches, with storage depending on deployment. The intent model runs on-device; full questions are not sent to an external AI service.'],
    help:[
      '这是轻量本地意图分类模型加只读查询工具，不是通用大语言模型。可问“CS3100 还有空位吗”“比较 CS3100 和 CS3200”“我的关注哪些有位”“有哪些学期”。我只根据返回的数据回答，不预测空位、不评教授、不判断资格，也不会注册或退课。',
      'This is a small local intent classifier with read-only query tools, not a general-purpose large language model. Try “CS3100 seats”, “compare CS3100 and CS3200”, “which of my watches have seats?”, or “available terms”. I answer from returned data, without predicting openings, rating instructors, deciding eligibility, registering, or dropping classes.'],
  };
  return {intent,text:texts[intent][zh?0:1]};
}

/** Read-only orchestration: natural language never becomes a URL, SQL, code, or write operation. */
export async function answerQuestion(input:string,context:AssistantContext,services:AssistantServices,previous?:AssistantConversationContext):Promise<AssistantReply> {
  input=input.normalize('NFKC').trim();const zh=/[\u3400-\u9fff]/.test(input),now=Date.now();
  if(!input||input.length>500)return {intent:'clarify',text:pick(zh,'请输入不超过 500 字符的课程问题。','Enter a course question of up to 500 characters.')};
  const guarded=scopeGuard(input,zh);if(guarded)return guarded;
  const explicitCourses=codes(input),request=termRequest(input),chosen=selectors(input);
  if(explicitCourses.length>2||chosen.length>2)return {intent:'clarify',text:pick(zh,'一次最多查询或比较 2 门课程，或同一课程的 2 个 section。请缩小范围。','Ask about at most 2 courses, or 2 sections of the same course, at a time.')};
  // Remove parsed term slots before ML inference. Otherwise "Spring 2027" can
  // resemble a course token to a deliberately small character model.
  let classificationText=input;
  for(const item of request.names)classificationText=classificationText.split(item.label).join(' ');
  for(const item of request.numeric)classificationText=classificationText.replace(new RegExp(`\\b${item}\\b`,'g'),' ');
  const classification=classifyIntent(classificationText.trim()||input);
  let intent:string=classification.intent;
  const seatCue=/\b(?:seats?|spots?|places?|sections?|availability|available|open|full|closed|vacanc(?:y|ies))\b|余位|空位|名额|人数|剩|满|位置|有位|班次|班级/i.test(input);
  const comparisonCue=/compare|versus|\bvs\b|比较|对比|哪个|哪门|最多/i.test(input);
  const privacyCue=/\b(?:privacy|private|personal|password|account|login|data|openai|conversation|messages|sync)\b|隐私|数据|账号|密码|保存|存储|对话|聊天|外部\s*AI|同步/i.test(input);
  const notificationCue=/\b(?:notify|notifications?|alerts?|email|remind|background|push)\b|通知|提醒|推送|邮件|后台|关.*页面|休眠/i.test(input);
  const helpCue=/\b(?:help|assistant|courseflow|llm)\b|what can you do|how (?:do i |to )use|how does (?:this|it) work|怎么用|如何使用|能做|功能|帮助|使用范围|模型|助手|你是谁/i.test(input);
  let followText=classificationText.replace(coursePattern,(whole,subject:string)=>nonSubjects.has(subject.toUpperCase())?whole:' ')
    .replace(/\b(?:crn|sections?|sec)\s*[:#]?\s*\d{1,8}/gi,' ').replace(/\d{1,3}\s*班/g,' ').trim();
  const followUp=!!previous&&(request.explicit||chosen.length>0||explicitCourses.length>0)
    &&/^(?:那|那么|再查|what about|how about|same)(?:\s|呢|in|for|and|vs|和|与|[?？。.!！、,])*$/i.test(followText)
    &&!privacyCue&&!notificationCue&&!helpCue;
  if(followUp)intent=(explicitCourses.length||previous!.courses.length)>1?'compare':'availability';
  // Validate model labels against explicit slots and supported topic schemas. The
  // classifier's independent evaluation is reported separately from this routing.
  if(explicitCourses.length&&seatCue&&intent==='terms')intent='availability';
  if(intent==='compare'&&explicitCourses.length===1&&!comparisonCue&&chosen.length<2)intent='availability';
  if(explicitCourses.length&&request.incomplete&&!privacyCue&&!notificationCue){
    const resolved=await resolveTerm(input,context,services,zh,previous);
    if('reply' in resolved)return resolved.reply;
  }
  if(!explicitCourses.length&&!followUp&&request.explicit&&!privacyCue&&!notificationCue){
    const resolved=await resolveTerm(input,context,services,zh,previous);
    if('reply' in resolved)return resolved.reply;
    return {intent:'terms',terms:resolved.terms.filter(term=>term.code===resolved.term),
      text:pick(zh,`当前返回的学期列表包含 ${termLabel(resolved.terms,resolved.term)}。你可以选择此学期后查询课程；我没有查询或推测席位。`,
        `The returned term list includes ${termLabel(resolved.terms,resolved.term)}. Select it to look up courses; no seat query or prediction was made.`),
      source:{label:pick(zh,'学校公开 Banner 查询','Public school Banner search'),url:OFFICIAL}};
  }
  if(!explicitCourses.length&&privacyCue&&!notificationCue)intent='privacy';
  if(['notifications','privacy','help'].includes(intent)){
    if((intent==='notifications'&&notificationCue)||(intent==='privacy'&&privacyCue)||(intent==='help'&&helpCue))return faq(intent,context.freeMode,zh);
    return {intent:'unknown',text:pick(zh,'这个问题超出我支持的课程查询和使用说明范围，我没有执行查询。','That is outside my supported course lookup and product-help scope. No query was made.')};
  }
  if(intent==='watchlist')return watchesReply(input,context,services,zh,now);
  if(intent==='terms'){
    try {
      const terms=validTerms(await services.getTerms());
      return {intent,terms,text:pick(zh,'下面是学校查询当前返回的学期；缺少的学期可能尚未发布，不能自动替换为其他学期。','These are the terms currently returned by public search. A missing term may not be published yet; it will not be substituted with another term.'),
        source:{label:pick(zh,'学校公开 Banner 查询','Public school Banner search'),url:OFFICIAL},queriedAt:new Date(now).toISOString()};
    }catch{return {intent,terms:validTerms(context.terms),text:pick(zh,'学期查询失败。下面仅保留页面此前已加载的列表，不能确认其完整性。','Term lookup failed. The previously loaded list is retained below, without claiming it is complete.'),warning:pick(zh,'未获取最新学期列表。','No fresh term list was obtained.')};}
  }
  if(!['availability','compare'].includes(intent))return {intent:'unknown',text:pick(zh,'我没有把握理解这个问题。请试“CS3100 还有空位吗”“比较 CS3100 和 CS3200”或“有哪些学期”。我没有发起课程查询。','I am not confident I understood. Try “CS3100 seats”, “compare CS3100 and CS3200”, or “available terms”. No course query was made.')};
  const bare=input.replace(coursePattern,(whole,subject:string)=>nonSubjects.has(subject.toUpperCase())?whole:'COURSE');
  const bareQuery=/^(?:(?:please\s+)?(?:check|search|look\s+up|show)\s*|(?:请|帮我)?(?:查一下|查询|查|看看)?\s*)?COURSE\s*(?:呢)?[?？。.!！]?$/i.test(bare);
  if(!seatCue&&!comparisonCue&&!bareQuery&&!followUp)return {intent:'unknown',text:pick(zh,'我能查询课程余位，但没有把握这就是你的问题。请明确说“查询 CS3100 的余位”；未执行查询。','I can check seats, but I am not confident that is what you asked. Say “check seats for CS3100”; no query was made.')};
  const courses=explicitCourses.length?explicitCourses:(previous?.courses.filter(validCode).slice(0,2)||[]);
  if(!courses.length)return {intent:'clarify',text:pick(zh,'请提供课程代码，例如 CS3100。只有 CRN 或 section 编号还不足以查询。','Provide a course code such as CS3100. A CRN or section number alone is not enough to search.')};
  if(chosen.length&&courses.length!==1)return {intent:'clarify',text:pick(zh,'指定 CRN 或 section 比较时，请一次只提供一门课程，避免编号对应错误。','For named CRNs or sections, use one course at a time so section numbers cannot be mixed up.')};
  const queryContext=followUp&&previous?{...context,selectedTerm:previous.term}:context;
  const resolved=await resolveTerm(input,queryContext,services,zh,previous);if('reply' in resolved)return resolved.reply;
  const queries:Query[]=[];const known=context.watches.map(watch=>watch.section);
  for(const course of courses)queries.push(await query(resolved.term,course,services,known,now));
  let sections=queries.flatMap(item=>item.seats);const lines:string[]=[],warnings:string[]=[];
  if(chosen.length){
    sections=sections.filter(seat=>chosen.some(selector=>selectorMatches(seat,selector)));
    for(const selector of chosen)if(!sections.some(seat=>selectorMatches(seat,selector)))warnings.push(pick(zh,`${selector.kind} ${selector.value} 未返回，余位未知。`,`${selector.kind} ${selector.value} was not returned; availability is unknown.`));
  }
  lines.push(pick(zh,`查询学期：${termLabel(resolved.terms,resolved.term)}。`,`Term: ${termLabel(resolved.terms,resolved.term)}.`));
  for(const result of queries){
    if(result.failed){lines.push(pick(zh,`${result.code} 查询失败，余位未知。`,`${result.code} lookup failed; availability is unknown.`));warnings.push(pick(zh,`${result.code} 未能刷新；旧记录不能当成当前余位。`,`${result.code} could not be refreshed; old values are not current availability.`));}
    else if(!result.seats.length)lines.push(pick(zh,`${result.code} 没有返回 section；这不等于余位为 0。`,`${result.code} returned no sections; that does not mean zero seats.`));
    if(result.truncated)warnings.push(pick(zh,`${result.code} 返回的结果不完整，结论仅限已返回的 section。`,`${result.code} returned partial results; conclusions apply only to returned sections.`));
  }
  const seconds=context.staleSeconds??900,current=sections.filter(seat=>fresh(seat,seconds,now));
  lines.push(...sections.map(seat=>seatText(seat,zh,fresh(seat,seconds,now))));
  if(sections.some(seat=>!fresh(seat,seconds,now)))warnings.push(pick(zh,'包含过期、失败或无法验证的记录；这些课程的当前余位未知。','Some records are stale, failed, or unverified; their current availability is unknown.'));
  if(intent==='compare'){
    const complete=queries.every(item=>!item.failed&&item.seats.length)&&current.length===sections.length&&current.length>1&&(!chosen.length||chosen.every(selector=>current.some(seat=>selectorMatches(seat,selector))))
      &&courses.every(course=>current.some(seat=>seat.code===course));
    if(complete){
      const best=Math.max(...current.map(seat=>seat.available)),leaders=current.filter(seat=>seat.available===best);
      lines.push(pick(zh,`在本次成功返回的 section 中，${leaders.map(seat=>`${seat.code} / ${seat.crn}`).join('、')} 余位最多（${best}）。这只是数量比较，不代表更适合你或能够注册。`,
        `Among the successfully returned sections, ${leaders.map(seat=>`${seat.code} / ${seat.crn}`).join(', ')} have the most available seats (${best}). This compares counts, not suitability or registration eligibility.`));
    }else warnings.push(pick(zh,'比较数据不齐或已过期，不能据此判断哪一门/哪个 section 余位更多。','Comparison data are incomplete or stale; I cannot determine which course or section has more seats.'));
  }
  if(sections.some(seat=>seat.source==='demo'))warnings.push(pick(zh,'这些是模拟演示数据，不是学校实时席位。','These are synthetic demo data, not live school seats.'));
  return {intent,text:lines.join('\n'),sections,...metadata(queries,zh),context:{courses,term:resolved.term},...(warnings.length?{warning:unique(warnings).join(' ')}:{})};
}
