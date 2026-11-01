import type { Task } from './ai.ts';
export type LetterVersion={jobId:number;version:number;body:string;reviewNotes:string[];createdBy:'generated'|'user'|'assistant'|'restore';profileRevision:number|null;createdAt:string};
export type LetterState={current:LetterVersion|null;versions:LetterVersion[];tasks:Task[];needsDescription:boolean};
export type LatexDiagnostic={severity:'error'|'warning';message:string;line?:number};
export type CvVersion={version:number;source:string;createdBy:'generated'|'user'|'assistant'|'restore';profileRevision:number|null;compileStatus:'ok'|'failed'|null;diagnostics:LatexDiagnostic[];createdAt:string};
export type CvState={current:CvVersion|null;versions:CvVersion[];pdfVersion:number|null;compiling:boolean;tasks:Task[]};
