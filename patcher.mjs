// EPS-16 Plus T11 patching and standard HFE v1 MFM transport.
// Original firmware bytes are supplied by the user, never bundled here.
export const DISK_SIZE = 819200;
const utf8 = new TextEncoder();
const fail = message => { throw new Error(message); };
const be = (b, p, n = 2) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[p + i]; return v; };
const le = (b, p) => b[p] | b[p + 1] << 8;
const putle = (b, p, v) => { b[p] = v; b[p + 1] = v >> 8; };
export async function sha256(bytes) {
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function extractOs(disk) {
  if (disk.length !== DISK_SIZE || disk[550] !== 73 || disk[551] !== 68 || disk[1052] !== 79 || disk[1053] !== 83)
    fail('No supported EPS disk (800 KiB IMG) found.');
  const entries = [];
  for (let i = 0; i < 39; i++) { const p = 1536 + i * 26; if (disk[p + 1] === 0x1b) entries.push(p); }
  if (entries.length !== 1) fail('Die Diskette muss genau einen EPS-16-Plus-OS-Eintrag enthalten.');
  const p = entries[0], count = be(disk, p + 14), blocks = [], seen = new Set();
  if (!count || count > 1585) fail('Invalid OS file size.');
  let next = be(disk, p + 18, 4);
  for (let i = 0; i < count; i++) {
    if (next < 15 || next >= 1600 || seen.has(next)) fail('Corrupt OS file chain.');
    seen.add(next); blocks.push(next);
    next = be(disk, (5 + Math.floor(next / 170)) * 512 + next % 170 * 3, 3);
  }
  if (next !== 1) fail('Invalid OS file chain ending.');
  const payload = new Uint8Array(count * 512);
  blocks.forEach((block, i) => payload.set(disk.subarray(block * 512, block * 512 + 512), i * 512));
  return { payload, blocks };
}
export async function patchDisk(disk, patch) {
  const {payload, blocks} = extractOs(disk);
  const originalHash = await sha256(payload);
  if (originalHash === patch.outputOsSha256) fail('This file already contains Lazy Chop T11. Please use the unmodified original.');
  if (originalHash !== patch.originalOsSha256) fail('Unsupported OS. The unmodified EPS-16 Plus OS 1.30 is required.');
  const changed = payload.slice();
  for (const op of patch.operations) {
    let bytes;
    if (op.type === 'copy') {
      if (!Number.isInteger(op.source) || !Number.isInteger(op.length) || op.source < 0 || op.length < 0 || op.source + op.length > payload.length) fail('Invalid patch copy range.');
      bytes = payload.slice(op.source, op.source + op.length);
    } else if (op.type === 'write') {
      if (!/^(?:[0-9a-f]{2})+$/i.test(op.hex)) fail('Invalid patch data.');
      bytes = Uint8Array.from(op.hex.match(/../g), x => parseInt(x, 16));
    } else fail('Unbekannte Patch-Operation.');
    if (!Number.isInteger(op.offset) || op.offset < 0 || op.offset + bytes.length > changed.length) fail('Patch exceeds OS file bounds.');
    changed.set(bytes, op.offset);
  }
  if (await sha256(changed) !== patch.outputOsSha256) fail('Patched OS checksum mismatch. No download created.');
  const result = disk.slice();
  blocks.forEach((block, i) => result.set(changed.subarray(i * 512, i * 512 + 512), block * 512));
  return result;
}
const reverse = Uint8Array.from({length:256}, (_,n) => { let r=0; for(let i=0;i<8;i++){r=r*2+(n&1);n>>=1;} return r; });
function crc(bytes, initial = 0xffff) {
  let c=initial;
  for (const b of bytes) { c ^= b << 8; for(let i=0;i<8;i++) c = ((c<<1) ^ ((c&0x8000)?0x1021:0)) & 65535; }
  return c;
}
const syncCrc = crc([0xa1,0xa1,0xa1]);
function encodeSide(disk, track, side) {
  const data = new Uint8Array(12544); let pos=0,previous=0;
  const word = w => { if(pos+2>data.length) fail('MFM track is too large.'); data[pos++]=w>>8;data[pos++]=w; };
  const byte = b => { let w=0;for(let bit=7;bit>=0;bit--){const d=(b>>bit)&1;w=(w<<2)|((!(previous||d))<<1)|d;previous=d;}word(w); };
  const repeat = (b,n) => { for(let i=0;i<n;i++)byte(b); };
  const sync = () => { for(let i=0;i<3;i++)word(0x4489); previous=1; };
  repeat(0x4e,80);
  const first=(track*6+side*8)%10;
  for(let p=0;p<10;p++){
    const sector=(first+p)%10, id=[0xfe,track,side,sector,2]; const idcrc=crc(id,syncCrc);
    repeat(0,12);sync();id.forEach(byte);byte(idcrc>>8);byte(idcrc&255);repeat(0x4e,22);
    repeat(0,12);sync();byte(0xfb);
    const offset=((track*2+side)*10+sector)*512, bytes=disk.subarray(offset,offset+512);
    const dc=crc(bytes,crc([0xfb],syncCrc)); bytes.forEach(byte);byte(dc>>8);byte(dc&255);repeat(0x4e,40);
  }
  repeat(0x4e,(data.length-pos)/2); return data;
}
export function encodeHfe(disk) {
  if(disk.length!==DISK_SIZE)fail('Incorrect IMG size.');
  const hfe=new Uint8Array((2+80*49)*512).fill(255);hfe.set(utf8.encode('HXCPICFE'));
  hfe.set([0,80,2,0],8);putle(hfe,12,250);putle(hfe,14,0);hfe[16]=7;hfe[17]=1;putle(hfe,18,1);
  for(let t=0;t<80;t++){
    const start=(2+t*49)*512;putle(hfe,512+t*4,start/512);putle(hfe,514+t*4,49*512);
    for(let side=0;side<2;side++){
      const bytes=encodeSide(disk,t,side);
      for(let i=0;i<bytes.length;i++)hfe[start+Math.floor(i/256)*512+side*256+i%256]=reverse[bytes[i]];
    }
  }
  return hfe;
}
function decodeBytes(stream,offset,count) {
  if(offset+count*2>stream.length)fail('Abgeschnittenes MFM-Feld.');
  const bytes=new Uint8Array(count);
  for(let i=0;i<count;i++){const word=stream[offset+i*2]*256+stream[offset+i*2+1];let b=0;for(let bit=7;bit>=0;bit--)b=(b<<1)|((word>>(bit*2))&1);bytes[i]=b;}
  return bytes;
}
export function decodeHfe(hfe) {
  if(hfe.length<1024 || !utf8.encode('HXCPICFE').every((x,i)=>hfe[i]===x)) fail('Not a supported HFE v1 file.');
  if(hfe[8]!==0 || hfe[9]!==80 || hfe[10]!==2 || hfe[11]!==0 || le(hfe,12)!==250 || ![0,300].includes(le(hfe,14)))
    fail('HFE v1 with 80 tracks, 2 sides and 250 kbit/s is required. HFE v3 is unsupported.');
  const table=le(hfe,18)*512;
  if(table<512 || table+320>hfe.length)fail('Invalid HFE track table.');
  const disk=new Uint8Array(DISK_SIZE), ranges=[];
  for(let t=0;t<80;t++){
    const start=le(hfe,table+t*4)*512,length=le(hfe,table+t*4+2);
    if(!length || start<table+320 || start+length>hfe.length)fail('Invalid HFE track bounds.');
    if(ranges.some(([a,b])=>start<b && start+length>a))fail('Overlapping HFE tracks.');ranges.push([start,start+length]);
    for(let side=0;side<2;side++){
      const stream=[];
      for(let b=0;b<length;b+=512)for(let i=0;i<256 && b+side*256+i<length;i++)stream.push(reverse[hfe[start+b+side*256+i]]);
      let pending=-1,seen=0;
      for(let p=0;p+6<=stream.length;p++){
        if(stream[p]!==0x44 || stream[p+1]!==0x89 || stream[p+2]!==0x44 || stream[p+3]!==0x89 || stream[p+4]!==0x44 || stream[p+5]!==0x89)continue;
        const at=p+6, mark=decodeBytes(stream,at,1)[0];
        if(mark===0xfe){
          const id=decodeBytes(stream,at,7);
          if(id[1]!==t || id[2]!==side || id[3]>=10 || id[4]!==2 || crc(id.subarray(0,5),syncCrc)!==be(id,5))fail(`Invalid sector ID or CRC on track ${t}, side ${side}.`);
          pending=id[3];
        }else if((mark===0xfb || mark===0xf8) && pending>=0){
          const bytes=decodeBytes(stream,at,515);
          if(crc(bytes.subarray(0,513),syncCrc)!==be(bytes,513))fail(`Corrupt data CRC on track ${t}, side ${side}, sector ${pending}.`);
          const offset=((t*2+side)*10+pending)*512;
          if(seen&(1<<pending)){
            if(!bytes.subarray(1,513).every((v,i)=>disk[offset+i]===v))fail('Conflicting duplicate HFE sectors.');
          }else{disk.set(bytes.subarray(1,513),offset);seen|=1<<pending;}
          pending=-1;
        }
      }
      if(seen!==1023)fail(`Incomplete HFE track ${t}, side ${side}.`);
    }
  }
  return disk;
}
export function readDisk(bytes) {
  if(bytes.length===DISK_SIZE)return bytes.slice();
  return decodeHfe(bytes);
}
export async function createDownload(input, patch) {
  const logical=readDisk(input), patched=await patchDisk(logical,patch), hfe=encodeHfe(patched);
  const decoded=decodeHfe(hfe);
  if(!decoded.every((b,i)=>b===patched[i]))fail('Internal HFE verification failed.');
  return {hfe,img:patched,sha256:await sha256(hfe),name:`EPS130-LAZY-${patch.version}.hfe`};
}
