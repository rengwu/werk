import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {zipSync} from 'fflate';
import {z} from 'zod';

export const MAX_ZIP_BYTES=128*1024*1024, MAX_UNPACKED_BYTES=512*1024*1024;
const names=new Set(['manifest.json','data.json','cv.tex','cv.pdf']);
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const spec=z.object({bytes:z.number().int().nonnegative().max(MAX_UNPACKED_BYTES),sha256:z.string().regex(/^[0-9a-f]{64}$/)}).strict();
const manifestSchema=z.object({format:z.literal('werk-personal-backup'),version:z.literal(1),createdAt:z.iso.datetime(),files:z.record(z.string(),spec)}).strict();
export const json=(value:unknown)=>Buffer.from(JSON.stringify(value));
export function createArchive(files:Record<string,Uint8Array>){
  const createdAt=new Date().toISOString();
  const manifest=json({format:'werk-personal-backup',version:1,createdAt,files:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,{bytes:bytes.length,sha256:hash(bytes)}]))});
  if(manifest.length+Object.values(files).reduce((n,b)=>n+b.length,0)>MAX_UNPACKED_BYTES)throw new Error('The backup exceeds the 512 MiB uncompressed limit.');
  const bytes=zipSync({...files,'manifest.json':manifest},{level:6});
  if(bytes.length>MAX_ZIP_BYTES)throw new Error('The backup exceeds the 128 MiB ZIP limit.');
  return {name:`werk-${createdAt.replace(/[:.]/g,'-')}.zip`,bytes};
}

// This fixed four-entry format does not need ZIP64, encryption or filesystem extraction.
// Inspect the central and local headers before allocating decompressed buffers.
export function readArchive(input:Uint8Array){
  if(!input.length||input.length>MAX_ZIP_BYTES)throw new Error('Choose a ZIP backup no larger than 128 MiB.');
  const bytes=Buffer.from(input.buffer,input.byteOffset,input.byteLength),invalid=()=>new Error('This is not a readable werk ZIP backup.');
  const end=bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if(end<0||end+22>bytes.length||end+22+bytes.readUInt16LE(end+20)!==bytes.length||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))throw invalid();
  const count=bytes.readUInt16LE(end+10),central=bytes.readUInt32LE(end+16);
  if(count<2||count>4||bytes.readUInt16LE(end+8)!==count||central+bytes.readUInt32LE(end+12)!==end)throw invalid();
  const entries=new Map<string,{start:number;size:number;unpacked:number;method:number}>();
  const ranges:Array<[number,number]>=[];let offset=central,total=0;
  for(let i=0;i<count;i++){
    if(offset+46>end||bytes.readUInt32LE(offset)!==0x02014b50)throw invalid();
    const flags=bytes.readUInt16LE(offset+8),method=bytes.readUInt16LE(offset+10),size=bytes.readUInt32LE(offset+20),unpacked=bytes.readUInt32LE(offset+24);
    const length=bytes.readUInt16LE(offset+28),next=offset+46+length+bytes.readUInt16LE(offset+30)+bytes.readUInt16LE(offset+32),local=bytes.readUInt32LE(offset+42);
    if(next>end||bytes.readUInt16LE(offset+34)||flags&~0x808||![0,8].includes(method))throw invalid();
    const name=bytes.subarray(offset+46,offset+46+length).toString('utf8'),mode=(bytes.readUInt32LE(offset+38)>>>16)&0o170000;
    if(!names.has(name)||entries.has(name)||(mode&&mode!==0o100000)||(bytes.readUInt32LE(offset+38)&0x10))throw new Error('The ZIP contains an unexpected, duplicate or unsafe file.');
    const limit=name==='manifest.json'?16384:name==='cv.tex'?2*1024*1024:name==='cv.pdf'?8*1024*1024:MAX_UNPACKED_BYTES;
    total+=unpacked;if(unpacked>limit||total>MAX_UNPACKED_BYTES)throw new Error('The ZIP exceeds its uncompressed size limit.');
    if(local+30>central||bytes.readUInt32LE(local)!==0x04034b50||bytes.readUInt16LE(local+6)!==flags||bytes.readUInt16LE(local+8)!==method)throw invalid();
    const localLength=bytes.readUInt16LE(local+26),start=local+30+localLength+bytes.readUInt16LE(local+28);
    if(start+size>central||bytes.subarray(local+30,local+30+localLength).toString('utf8')!==name)throw invalid();
    if(!(flags&8)&&(bytes.readUInt32LE(local+18)!==size||bytes.readUInt32LE(local+22)!==unpacked))throw invalid();
    ranges.push([local,start+size]);entries.set(name,{start,size,unpacked,method});offset=next;
  }
  if(offset!==end||!entries.has('manifest.json')||!entries.has('data.json'))throw invalid();
  ranges.sort((a,b)=>a[0]-b[0]);if(ranges.some((r,i)=>i>0&&r[0]<ranges[i-1][1]))throw invalid();
  const read=(name:string)=>{
    const entry=entries.get(name);if(!entry)throw invalid();
    const compressed=bytes.subarray(entry.start,entry.start+entry.size);
    let result:Buffer;
    try{result=entry.method===0?Buffer.from(compressed):inflateRawSync(compressed,{maxOutputLength:Math.max(1,entry.unpacked)});}catch{throw new Error(`The backup file ${name} is damaged or too large.`);}
    if(result.length!==entry.unpacked)throw new Error(`The backup file ${name} is damaged.`);return result;
  };
  let manifest:z.infer<typeof manifestSchema>;
  try{manifest=manifestSchema.parse(JSON.parse(read('manifest.json').toString('utf8')));}catch{throw new Error('The backup manifest is invalid or uses an unsupported version.');}
  if(!manifest.files['data.json']||Object.keys(manifest.files).length!==entries.size-1||Object.keys(manifest.files).some(n=>n==='manifest.json'||!entries.has(n)))throw invalid();
  const files:Record<string,Buffer>={};
  for(const [name,spec] of Object.entries(manifest.files)){
    if(spec.bytes!==entries.get(name)!.unpacked)throw new Error(`The backup file ${name} has an invalid size.`);
    const data=read(name);if(hash(data)!==spec.sha256)throw new Error(`The backup file ${name} is damaged.`);files[name]=data;
  }
  return files;
}
