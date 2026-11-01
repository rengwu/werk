import {accessSync,constants,realpathSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
export const latexRuntimeDirectory=()=>join(process.env.WERK_RESOURCES_DIR||resolve('resources'),'runtime');
export const latexExecutableName=(name:string)=>process.platform==='win32'?`${name}.exe`:name;
export function findTectonic(){try{const path=join(latexRuntimeDirectory(),'bin',latexExecutableName('tectonic'));if(!statSync(path).isFile())return;accessSync(path,constants.X_OK);return realpathSync(path);}catch{return;}}
export const latexCacheDirectory=()=>join(latexRuntimeDirectory(),'cache');
export const latexSandboxExecutable=()=>join(latexRuntimeDirectory(),'bin',latexExecutableName('texsandbox'));
