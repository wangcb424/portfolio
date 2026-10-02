import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {api,dateTime,type SearchResult,type Seat,type Term,type Watch} from './api';
import {answerQuestion,type AssistantContext,type AssistantConversationContext,type AssistantReply,type AssistantServices} from './assistant/engine';

type Message={id:number;role:'user'|'assistant';text:string;reply?:AssistantReply;failed?:boolean};
type Props={active:boolean;context:AssistantContext;renderSeat:(seat:Seat)=>ReactNode};
const MAX_MESSAGES=20;
const suggestions=['CS3100 seats','比较 CS3100 和 CS3520','我的关注','Spring 2027','通知机制'];
const services:AssistantServices={
  search:(term,course)=>api<SearchResult>(`/catalog/sections?term=${encodeURIComponent(term)}&q=${encodeURIComponent(course)}`),
  getTerms:()=>api<Term[]>('/catalog/terms'),
  getWatches:()=>api<Watch[]>('/watchlist'),
};
function sourceUrl(value:string){try{const url=new URL(value);return url.protocol==='https:'?url.href:undefined;}catch{return undefined;}}

export default function Assistant({active,context,renderSeat}:Props){
  const [messages,setMessages]=useState<Message[]>([]);
  const [input,setInput]=useState('');
  const [pending,setPending]=useState(false);
  const [limited,setLimited]=useState(false);
  const sequence=useRef(0),generation=useRef(0),inFlight=useRef(false);
  const previous=useRef<AssistantConversationContext|undefined>(undefined);
  const transcript=useRef<HTMLDivElement>(null);
  const composer=useRef<HTMLTextAreaElement>(null);
  const termLabel=context.terms.find(term=>term.code===context.selectedTerm)?.description||'Choose a term in Explore courses';

  function append(message:Message){
    if(message.id>MAX_MESSAGES)setLimited(true);
    setMessages(current=>[...current,message].slice(-MAX_MESSAGES));
  }
  async function ask(question:string){
    const text=question.trim();
    if(!text||text.length>500||inFlight.current)return;
    inFlight.current=true;setPending(true);setInput('');
    const requestGeneration=generation.current;
    append({id:++sequence.current,role:'user',text});
    try{
      const reply=await answerQuestion(text,context,services,previous.current);
      if(requestGeneration!==generation.current)return;
      if(reply.context)previous.current=reply.context;
      append({id:++sequence.current,role:'assistant',text:reply.text,reply});
    }catch{
      if(requestGeneration!==generation.current)return;
      append({id:++sequence.current,role:'assistant',failed:true,text:/[\u3400-\u9fff]/.test(text)?'暂时无法完成查询。请稍后再试，或在 Explore courses 中查询。我没有获取到新的席位数据，也没有替你新增关注。':'The lookup could not finish. Try again in a moment, or use Explore courses. No fresh seat data was retrieved and no watch was added.'});
    }finally{
      if(requestGeneration===generation.current){inFlight.current=false;setPending(false);composer.current?.focus();}
    }
  }
  function clear(){generation.current++;sequence.current=0;inFlight.current=false;previous.current=undefined;setPending(false);setMessages([]);setLimited(false);setInput('');composer.current?.focus();}
  function submit(event:FormEvent){event.preventDefault();void ask(input);}
  useEffect(()=>{if(active&&transcript.current)transcript.current.scrollTop=transcript.current.scrollHeight;},[active,messages.length,pending]);

  return <section className="assistant-page" aria-labelledby="assistant-title">
    <div className="assistant-heading"><div><p className="eyebrow">ASK ABOUT YOUR NEXT CLASS</p><h1 id="assistant-title">AI assistant<span>.</span></h1><p>Ask about seats, compare courses, or understand your watchlist.</p></div><span className="assistant-free">FREE · NO ACCOUNT</span></div>
    <div className="assistant-model-note"><strong>Local intent recognition · 本地意图识别 · 非通用大模型</strong><p>This focused assistant interprets course questions on your device and looks up public school data. Chat never adds or removes a watch automatically; use a course’s Track button.</p></div>
    <div className="assistant-shell">
      <div className="assistant-toolbar"><div><span className="assistant-status-dot"/><strong>CourseFlow assistant</strong><small>Default term: {termLabel}</small></div><button className="text-button" onClick={clear} disabled={!messages.length&&!pending}>Clear chat</button></div>
      <div className="assistant-log" ref={transcript} role="log" aria-label="Course assistant conversation" aria-relevant="additions text" aria-busy={pending}>
        {!messages.length&&!pending&&<div className="assistant-welcome"><div className="assistant-mark" aria-hidden="true">✦</div><h2>Which course is on your mind?</h2><p>Try “Does CS3100 have seats?” or “帮我比较 CS3100 和 CS3520”.<br/>Seat numbers come from course lookup results, with their check time.</p></div>}
        {limited&&<p className="assistant-limit">Only the most recent 20 messages are kept in this chat.</p>}
        {messages.map(message=><article className={`assistant-message ${message.role==='user'?'assistant-question':'assistant-reply'}`} key={message.id}>
          <p className="assistant-speaker">{message.role==='user'?'YOU':'COURSEFLOW'}</p>
          <p className="assistant-message-text">{message.text}</p>
          {message.failed&&<p className="assistant-warning" role="status">Lookup unavailable · 席位暂时无法确认</p>}
          {message.reply?.warning&&<p className="assistant-warning" role="status">{message.reply.warning}</p>}
          {message.reply?.terms&&message.reply.terms.length>0&&<ul className="assistant-terms" aria-label="Published terms">{message.reply.terms.map(term=><li key={term.code}>{term.description}<span>{term.code}</span></li>)}</ul>}
          {message.reply?.sections&&message.reply.sections.length>0&&<div className="cards assistant-cards">{message.reply.sections.map(seat=>renderSeat(seat))}</div>}
          {(message.reply?.source||message.reply?.queriedAt)&&<div className="assistant-sources">{message.reply.source&&(sourceUrl(message.reply.source.url)?<a href={sourceUrl(message.reply.source.url)} target="_blank" rel="noreferrer">Source: {message.reply.source.label} ↗</a>:<span>Source: {message.reply.source.label}</span>)}{message.reply.queriedAt&&<span>Queried {dateTime(message.reply.queriedAt)}</span>}</div>}
        </article>)}
        {pending&&<div className="assistant-thinking" role="status"><span className="spinner"/> Understanding your question and checking the relevant data…</div>}
      </div>
      <div className="assistant-compose">
        <div className="assistant-suggestions" aria-label="Suggested questions">{suggestions.map(question=><button key={question} type="button" disabled={pending} onClick={()=>void ask(question)}>{question}</button>)}</div>
        <form onSubmit={submit}><label htmlFor="assistant-question">Ask in English or 中文</label><div className="assistant-input-row"><textarea id="assistant-question" ref={composer} value={input} onChange={event=>setInput(event.target.value)} maxLength={500} rows={2} placeholder="e.g. CS3100 有空位吗？" onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void ask(input);}}}/><button className="primary" disabled={pending||!input.trim()} type="submit">{pending?'Checking…':'Send ↗'}</button></div><p className="assistant-privacy">Chat stays in memory; refreshing clears it. Course codes and terms go to the public lookup service. Clearing chat keeps your saved watches. <span>{input.length}/500</span></p></form>
      </div>
    </div>
  </section>;
}
