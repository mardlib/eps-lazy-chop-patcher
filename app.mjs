import {createDownload} from './patcher.mjs';
const input=document.querySelector('#original'), button=document.querySelector('#patch'), status=document.querySelector('#status'), result=document.querySelector('#result');
let url=null, busy=false;
const clear=()=>{if(url)URL.revokeObjectURL(url);url=null;result.hidden=true;document.querySelector('#download').removeAttribute('href');};
input.addEventListener('change',()=>{clear();status.className='status';const file=input.files[0];button.disabled=!file;document.querySelector('#filename').textContent=file?`${file.name} · ${(file.size/1024).toLocaleString('en-US',{maximumFractionDigits:0})} KiB`:'IMG · 800 KiB / HFE v1 · DD disk';status.textContent=file?'Ready for local verification.':'Choose your original OS file to begin.';});
button.addEventListener('click',async()=>{
 if(busy||!input.files[0])return;busy=true;button.disabled=true;input.disabled=true;clear();status.className='status';status.textContent='Checking original, applying patch, and verifying HFE …';
 try{
  const file=input.files[0];if(file.size>8*1024*1024)throw new Error('This file is too large for a supported DD disk.');
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const response=await fetch('./patch.json',{cache:'no-cache'});if(!response.ok)throw new Error('Could not load patch data.');
  const patch=await response.json(), output=await createDownload(new Uint8Array(await file.arrayBuffer()),patch);
  url=URL.createObjectURL(new Blob([output.hfe],{type:'application/octet-stream'}));
  const a=document.querySelector('#download');a.href=url;a.download=output.name;
  document.querySelector('#checksum').textContent=output.sha256;result.hidden=false;
  status.textContent='OS 1.30 recognized. Patch and all 1,600 HFE sectors verified.';
 }catch(error){status.className='status error';status.textContent=error.message||'Could not process this file.';}
 finally{busy=false;input.disabled=false;button.disabled=!input.files[0];}
});
