import {mkdirSync,existsSync,writeFileSync,renameSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {Store} from '../db/store.ts';
import type {Profiles} from '../profile/store.ts';
import type {CvState,CvVersion,LatexDiagnostic} from '../../shared/documents.ts';
import {compileLatex,LatexCompileError} from './compile.ts';
import {renderCv} from './template.ts';
export class Cv {
  store:Store;profiles:Profiles;directory:string;changed:()=>void;active?:Promise<void>;controller?:AbortController;closed=false;
  compiler=compileLatex;
  constructor(store:Store,profiles:Profiles,dataDir:string,changed:()=>void){this.store=store;this.profiles=profiles;this.directory=join(dataDir,'cv');this.changed=changed;mkdirSync(this.directory,{recursive:true,mode:0o700});}
  versions():CvVersion[]{return this.store.db.prepare('SELECT version,source,created_by AS createdBy,profile_revision AS profileRevision,compile_status AS compileStatus,compile_log AS log,created_at AS createdAt FROM cv_versions ORDER BY version DESC').all().map(row=>({version:Number(row.version),source:String(row.source),createdBy:row.createdBy,profileRevision:row.profileRevision,compileStatus:row.compileStatus,diagnostics:row.log?JSON.parse(String(row.log)):[],createdAt:row.createdAt})) as CvVersion[];}
  current(){return this.versions()[0]||null;}
  state():CvState{const versions=this.versions();return{current:versions[0]||null,versions,pdfVersion:versions.find(v=>existsSync(join(this.directory,`${v.version}.pdf`)))?.version||null,compiling:!!this.active,tasks:[]};}
  save(source:string,expectedVersion:number,createdBy:CvVersion['createdBy']='user',profileRevision:number|null=null){
    if(!source.trim()||Buffer.byteLength(source)>2*1024*1024)throw new Error('Use nonempty LaTeX source up to 2 MiB.');
    if((this.current()?.version||0)!==expectedVersion)throw new Error('The CV changed. Review the current version before saving.');
    if(this.active)throw new Error('Wait for the current compile to finish.');const version=Math.max(expectedVersion,this.store.get('cvVersionFloor',0))+1;
    this.store.db.prepare('INSERT INTO cv_versions(version,source,created_by,profile_revision,created_at) VALUES(?,?,?,?,?)').run(version,source,createdBy,profileRevision,new Date().toISOString());return this.current()!;
  }
  edit(source:string,expectedVersion:number){const current=this.current(),saved=this.store.transaction(()=>this.save(source,expectedVersion,'user',current?.profileRevision||null));this.compile(saved.version);return this.state();}
  generate(expectedVersion:number){const profile=this.profiles.get();if(!profile.basics.name||!(profile.basics.summary||profile.experience.length||profile.projects.length))throw new Error('Add your name and background to the profile first.');const saved=this.store.transaction(()=>this.save(renderCv(profile),expectedVersion,'generated',profile.revision));this.compile(saved.version);return this.state();}
  restore(version:number,expectedVersion:number){const previous=this.versions().find(v=>v.version===version);if(!previous)throw new Error('CV version not found.');const saved=this.store.transaction(()=>this.save(previous.source,expectedVersion,'restore',previous.profileRevision));this.compile(saved.version);return this.state();}
  compile(version:number){if(this.active)throw new Error('A CV compile is already running.');const current=this.versions().find(v=>v.version===version);if(!current)throw new Error('CV version not found.');this.controller=new AbortController();
    this.active=(async()=>{try{const {pdf,diagnostics}=await this.compiler(current.source,this.controller!.signal);if(this.closed)return;const path=join(this.directory,`${version}.pdf`),temporary=`${path}.tmp`;writeFileSync(temporary,pdf,{mode:0o600});renameSync(temporary,path);this.store.db.prepare("UPDATE cv_versions SET compile_status='ok',compile_log=? WHERE version=?").run(JSON.stringify(diagnostics),version);}
      catch(error){if(this.closed)return;const diagnostics:LatexDiagnostic[]=error instanceof LatexCompileError?error.diagnostics.length?error.diagnostics:[{severity:'error',message:error.message}]:[{severity:'error',message:'The compiler could not finish. Your source and previous PDF are preserved.'}];this.store.db.prepare("UPDATE cv_versions SET compile_status='failed',compile_log=? WHERE version=?").run(JSON.stringify(diagnostics),version);}
      finally{this.active=undefined;this.controller=undefined;if(!this.closed)this.changed();}})();this.changed();return this.state();
  }
  pdf(version:number){if(!this.versions().some(v=>v.version===version))throw new Error('CV version not found.');const path=join(this.directory,`${version}.pdf`);if(!existsSync(path))throw new Error('This version has no compiled PDF.');return new Uint8Array(readFileSync(path));}
  close(){this.closed=true;this.controller?.abort();}
}
