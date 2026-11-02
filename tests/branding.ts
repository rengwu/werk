import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { ElectronApplication } from 'playwright-core';

export async function verifyBranding(app: ElectronApplication, exe: string, output: string) {
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  const runtime=await app.evaluate(({app,BrowserWindow})=>({
    name:app.getName(),version:app.getVersion(),packaged:app.isPackaged,
    title:BrowserWindow.getAllWindows()[0].getTitle(),resources:process.resourcesPath,
  }));
  assert.equal(runtime.packaged,true,'Branding verification requires the packaged app');
  assert.equal(runtime.name,pkg.productName);assert.equal(runtime.title,pkg.productName);assert.equal(runtime.version,pkg.version);
  const hash=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
  const sourceHash=hash(await readFile('resources/icon.png'));
  assert.equal(hash(await readFile(join(runtime.resources,'icon.png'))),sourceHash);
  const stock=createRequire(import.meta.url)('electron') as string;
  const bundle=(path:string)=>process.platform==='darwin'?dirname(dirname(dirname(path))):path;
  const iconPath=join(output,'app-icon.png'),stockPath=join(output,'electron-icon.png');
  let metadata:Record<string,string>;
  if(process.platform==='darwin') {
    const plist=JSON.parse(execFileSync('plutil',['-convert','json','-o','-',join(bundle(exe),'Contents/Info.plist')],{encoding:'utf8'}));
    metadata=Object.fromEntries(['CFBundleDisplayName','CFBundleName','CFBundleIdentifier','CFBundleExecutable','CFBundleShortVersionString','CFBundleVersion','CFBundleIconFile'].map(key=>[key,plist[key]]));
    assert.equal(plist.CFBundleDisplayName,pkg.productName);assert.equal(plist.CFBundleName,pkg.productName);
    assert.equal(plist.CFBundleIdentifier,pkg.build.appId);assert.equal(plist.CFBundleExecutable,'werk');
    assert.equal(plist.CFBundleShortVersionString,pkg.version);assert.equal(plist.CFBundleVersion,pkg.version);
    const stockPlist=JSON.parse(execFileSync('plutil',['-convert','json','-o','-',join(bundle(stock),'Contents/Info.plist')],{encoding:'utf8'}));
    for(const [root,name,outputPath] of [[bundle(exe),plist.CFBundleIconFile,iconPath],[bundle(stock),stockPlist.CFBundleIconFile,stockPath]])
      execFileSync('sips',['-s','format','png',join(root,'Contents/Resources',name),'--out',outputPath],{stdio:'pipe'});
  } else {
    metadata=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',
      '$v=(Get-Item -LiteralPath $env:WERK_VERIFY_EXE).VersionInfo; @{ProductName=$v.ProductName;FileDescription=$v.FileDescription;CompanyName=$v.CompanyName;ProductVersion=$v.ProductVersion;FileVersion=$v.FileVersion} | ConvertTo-Json -Compress',
    ],{encoding:'utf8',env:{...process.env,WERK_VERIFY_EXE:exe}}));
    assert.equal(basename(exe),'werk.exe');assert.equal(metadata.ProductName,pkg.productName);
    assert.equal(metadata.FileDescription,pkg.productName);assert.equal(metadata.CompanyName,pkg.author);
    assert.ok(metadata.ProductVersion.startsWith(pkg.version));assert.ok(metadata.FileVersion.startsWith(pkg.version));
    for(const [input,outputPath] of [[exe,iconPath],[stock,stockPath]])execFileSync('powershell.exe',['-NoProfile','-Command',
      'Add-Type -AssemblyName System.Drawing; $icon=[System.Drawing.Icon]::ExtractAssociatedIcon($env:WERK_VERIFY_EXE); $image=$icon.ToBitmap(); $image.Save($env:WERK_VERIFY_ICON,[System.Drawing.Imaging.ImageFormat]::Png); $image.Dispose(); $icon.Dispose();',
    ],{env:{...process.env,WERK_VERIFY_EXE:input,WERK_VERIFY_ICON:outputPath}});
  }
  const icon=await readFile(iconPath),stockIcon=await readFile(stockPath);
  assert.ok(icon.length>100);assert.notEqual(hash(icon),hash(stockIcon),'The built app must not use Electron’s icon');
  return {name:runtime.name,version:runtime.version,title:runtime.title,metadata,sourceIconSha256:sourceHash,osIconSha256:hash(icon),differsFromElectronIcon:true};
}
