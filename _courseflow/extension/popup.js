const site=document.querySelector('#site'),course=document.querySelector('#course'),term=document.querySelector('#term');
chrome.storage.sync.get(['courseflowSite']).then(v=>{site.value=v.courseflowSite||'';});
chrome.tabs.query({active:true,currentWindow:true}).then(async tabs=>{
  const tab=tabs[0];
  if(!tab?.id||!tab.url?.startsWith('https://nubanner.neu.edu/StudentRegistrationSsb/'))return;
  try{
    const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>window.getSelection()?.toString()||''});
    const selected=result[0]?.result?.replace(/\s+/g,'').toUpperCase();
    if(/^[A-Z]{2,6}[0-9]{4}[A-Z]?$/.test(selected))course.value=selected;
  }catch{/* Manually entering a code always remains available. */}
});
document.querySelector('#open').addEventListener('submit',async event=>{
  event.preventDefault();
  try{
    const url=new URL(site.value.trim());
    if(url.username||url.password||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw new Error('Use your HTTPS CourseFlow address.');
    const code=course.value.replace(/\s+/g,'').toUpperCase();
    if(!/^[A-Z]{2,6}[0-9]{4}[A-Z]?$/.test(code))throw new Error('Enter a course code such as CS3100.');
    url.search='';url.hash='';
    if(!url.pathname.endsWith('/'))url.pathname+='/';
    await chrome.storage.sync.set({courseflowSite:url.toString()});
    const target=new URL(url.toString());target.searchParams.set('course',code);
    if(term.value)target.searchParams.set('term',term.value);
    await chrome.tabs.create({url:target.toString()});window.close();
  }catch(error){document.querySelector('#error').textContent=error.message;}
});
