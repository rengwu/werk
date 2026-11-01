import { boardFor } from './catalog.ts';
import { parseBoardListing,parseBoardDetail,jobUrl,lead } from './parsers.ts';
import { readUrl,RequestLimitError,NotModified } from '../../http.ts';
import type { FetchContext } from '../../http.ts';
import type { Source,IncomingJob } from '../types.ts';

export async function collectPublicBoard(source:Source,ctx:FetchContext,emit:(job:IncomingJob)=>void,checkpoint:(value:Record<string,unknown>)=>void,read:typeof readUrl=readUrl) {
  const board=boardFor(source.identifier),index=Number(source.checkpoint.seedIndex||0)%board.seeds.length,seed=board.seeds[index];
  const pages={...(source.checkpoint.pages as Record<string,string>||{})};
  let pending=(source.checkpoint.pending as Array<{url:string;attempts:number;nextAt:number}>||[]).filter(p=>!!jobUrl(source.identifier,p.url)).slice(0,128);
  const save=()=>checkpoint({seedIndex:(index+1)%board.seeds.length,pages,pending});
  const discover=async(url:string)=>{const body=await read(url,ctx);if(!body)return;const parsed=parseBoardListing(source.identifier,body,url);for(const job of parsed.jobs){if(job.title!=='Job opening')emit(job);if(job.descriptionQuality!=='full'&&!pending.some(p=>p.url===job.url))pending.push({url:job.url,attempts:0,nextAt:0});}pending=pending.slice(-128);if(parsed.next)pages[seed]=parsed.next;else delete pages[seed];save();};
  const older=pages[seed];await discover(seed);
  if(older&&older!==seed&&ctx.requests<Math.min(2,ctx.limit-1))await discover(older);
  for(const item of [...pending]){
    if(ctx.requests>=ctx.limit)break;if(item.nextAt>Date.now())continue;
    try{const body=await read(item.url,ctx,{cache:false,allowRedirect:u=>!!jobUrl(source.identifier,u.href)});if(body){const job=parseBoardDetail(source.identifier,body,lead(source.identifier,item.url));emit(job);}pending=pending.filter(p=>p!==item);}
    catch(error){if(error instanceof RequestLimitError||error instanceof NotModified)throw error;item.attempts++;item.nextAt=Date.now()+Math.min(7*86400000,3600000*2**Math.min(item.attempts,8));save();throw error;}
    save();
  }
}
