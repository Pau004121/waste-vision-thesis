import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import test from 'node:test';

const root=new URL('./',import.meta.url);
const html=await readFile(new URL('index.html',root),'utf8');
const app=await readFile(new URL('app.js',root),'utf8');
const config=await readFile(new URL('config.js',root),'utf8');
const backend='https://waste-vision-student-qr.icy-lamp-1597.chatgpt.site';

test('all browser assets stay within the GitHub Pages project subdirectory',async()=>{
  const page=new URL('https://thesis-student.github.io/waste-vision-thesis/');
  for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
    const target=new URL(match[1],page);
    assert.equal(target.origin,page.origin);assert.ok(target.pathname.startsWith('/waste-vision-thesis/'),match[1]);
    await readFile(new URL(match[1],root));
  }
  assert.ok(app.includes('src="./logo.png"'));assert.ok(!app.includes('src="/assets/'));
  assert.equal((await readFile(new URL('.nojekyll',root))).length,0);
});
test('CSP precedes scripts and allows only local code plus the retained API connection',()=>{
  const meta=html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(meta);assert.ok(html.indexOf(meta[0])<html.indexOf('<script'));
  const csp=new Map(meta[1].split('; ').map(value=>{const [key,...parts]=value.split(' ');return[key,parts.join(' ')];}));
  assert.equal(csp.get('script-src'),"'self'");assert.equal(csp.get('style-src'),"'self'");
  assert.equal(csp.get('connect-src'),"'self' "+backend);assert.equal(csp.get('base-uri'),"'none'");
  assert.ok(!meta[1].includes('unsafe-inline'));assert.ok(!meta[1].includes('https:;'));
  for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){assert.match(script[1],/src="\.\//);assert.equal(script[2],'');}
  assert.ok(!/\son[a-z]+\s*=|\sstyle\s*=/i.test(html));
  assert.ok(config.includes(backend));assert.ok(app.includes(`Object.freeze(['${backend}'])`));
});
test('repository inventory contains public frontend files and isolated tests only',async()=>{
  const allowed=new Set(['.gitattributes','.gitignore','.nojekyll','README.md','index.html','app.css','app.js','config.js','logo.png',
    'qrcode.js','qrcode-LICENSE.txt','THIRD_PARTY_NOTICES.txt','frontend.test.mjs','pages.test.mjs']);
  async function walk(folder,prefix=''){
    for(const entry of await readdir(folder,{withFileTypes:true})){
      if(entry.name==='.git')continue;
      const name=prefix+entry.name;
      if(entry.isDirectory())await walk(new URL(entry.name+'/',folder),name+'/');
      else{assert.ok(allowed.has(name),'Unexpected public repository file: '+name);allowed.delete(name);}
    }
  }
  await walk(root);assert.equal(allowed.size,0,'Missing expected public files');
  assert.ok(!/WV_KIOSK_SECRET|WV_PASSWORD_PEPPER|PRIVATE_KEY_PKCS8|BEGIN (?:RSA |EC )?PRIVATE KEY|appgprj_/.test(app+config+html));
  assert.match(fileURLToPath(root),/WasteVision_Thesis_Website/);
});
test('vendored QR renderer retains its exact upstream file and MIT license',async()=>{
  const vendor=await readFile(new URL('qrcode.js',root));
  assert.equal(createHash('sha256').update(vendor).digest('hex'),'79ec86f82856005b1c887905cfccfcfbec3821ca61c7fd5a952faa5f778f791c');
  const license=await readFile(new URL('qrcode-LICENSE.txt',root),'utf8');
  assert.match(license,/MIT License/);assert.match(license,/Kazuhiko Arase/);
  assert.ok(!/https?:\/\//.test(html.replaceAll(backend,'')),'No remote runtime asset URLs');
});
