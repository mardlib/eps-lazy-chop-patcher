import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DISK_SIZE,sha256,extractOs,patchDisk,encodeHfe,decodeHfe,readDisk,createDownload} from '../patcher.mjs';
function fixture(){
 const disk=new Uint8Array(DISK_SIZE);disk.set([73,68],550);disk.set([79,83],1052);
 const p=1536+26;disk[p+1]=0x1b;disk[p+15]=3;disk[p+21]=20;
 const blocks=[20,34,99];
 for(let i=0;i<3;i++){
  const n=blocks[i],next=i===2?1:blocks[i+1],q=(5+Math.floor(n/170))*512+n%170*3;
  disk[q]=next>>16;disk[q+1]=next>>8;disk[q+2]=next;
  for(let j=0;j<512;j++)disk[n*512+j]=(i*73+j*31)&255;
 }
 return disk;
}
test('fragmented OS copy/write patch preserves all other disk sectors',async()=>{
 const disk=fixture(),{payload}=extractOs(disk),changed=payload.slice();changed.set(payload.slice(10,20),600);changed.set([1,2,3],800);
 const patch={originalOsSha256:await sha256(payload),outputOsSha256:await sha256(changed),operations:[{type:'copy',source:10,offset:600,length:10},{type:'write',offset:800,hex:'010203'}]};
 const result=await patchDisk(disk,patch);assert.deepEqual(extractOs(result).payload,changed);
 for(let i=0;i<disk.length;i++)if(![20,34,99].includes(Math.floor(i/512)))assert.equal(result[i],disk[i]);
 assert.deepEqual(extractOs(disk).payload,payload);
 await assert.rejects(patchDisk(result,patch),/already/);
 await assert.rejects(patchDisk(disk,{...patch,outputOsSha256:'00'}),/checksum/);
});
test('wrong original, FAT cycles and truncated images are rejected',async()=>{
 const disk=fixture(),patch={originalOsSha256:'00',operations:[]};await assert.rejects(patchDisk(disk,patch),/Unsupported/);
 const broken=disk.slice();broken[(5+Math.floor(20/170))*512+20%170*3+2]=20;
 assert.throws(()=>extractOs(broken),/file chain/);assert.throws(()=>extractOs(disk.slice(0,400)),/800 KiB/);
});
test('all sectors survive HFE encoding, including arbitrary byte patterns',()=>{
 const raw=Uint8Array.from({length:DISK_SIZE},(_,i)=>(i*37+(i>>8))&255),hfe=encodeHfe(raw);
 assert.equal(hfe.length,2008064);assert.deepEqual(decodeHfe(hfe),raw);assert.deepEqual(readDisk(hfe),raw);
 const broken=hfe.slice();broken[1024+512+24]^=0x02;assert.throws(()=>decodeHfe(broken),/CRC|sector|track/);
 const v3=hfe.slice();v3.set(new TextEncoder().encode('HXCHFEV3'));assert.throws(()=>decodeHfe(v3),/HFE/);
});
test('transport rejects unsupported geometry and broken track bounds',()=>{
 const hfe=encodeHfe(fixture()),bad=hfe.slice();bad[9]=79;assert.throws(()=>decodeHfe(bad),/80 tracks/);
 const truncated=hfe.slice(0,1900000);assert.throws(()=>decodeHfe(truncated),/track bounds/);
});
test('public assets contain a copy operation, not the original Wave table',async()=>{
 const patch=JSON.parse(await readFile(new URL('../patch.json',import.meta.url),'utf8'));
 assert.deepEqual(patch.operations[0],{type:'copy',source:0xa4ca,offset:0xa26a,length:210});
 assert.equal(patch.operations.filter(x=>x.type==='write').reduce((a,x)=>a+x.hex.length/2,0),1264);
});
test('private original produces exactly the hardware-tested T11 image',{skip:!process.env.TEST_EPS_ORIGINAL},async()=>{
 const original=new Uint8Array(await readFile(process.env.TEST_EPS_ORIGINAL));
 const expected=new Uint8Array(await readFile(process.env.TEST_EPS_T11_IMG));
 const expectedHfe=new Uint8Array(await readFile(process.env.TEST_EPS_T11_HFE));
 const patch=JSON.parse(await readFile(new URL('../patch.json',import.meta.url),'utf8'));
 const result=await createDownload(original,patch);assert.deepEqual(result.img,expected);assert.deepEqual(result.hfe,expectedHfe);
 const fromHfe=await createDownload(encodeHfe(original),patch);assert.deepEqual(fromHfe.hfe,expectedHfe);
});
