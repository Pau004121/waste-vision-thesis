// Isolated fixtures exercise the production browser code without a live service.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import {webcrypto} from 'node:crypto';

const source=await readFile(new URL('./app.js',import.meta.url),'utf8');
const configSource=await readFile(new URL('./config.js',import.meta.url),'utf8');
const backend='https://waste-vision-student-qr.icy-lamp-1597.chatgpt.site';
function fixture(fetcher=async()=>{throw new Error('offline fixture');},options={}) {
  const values=new Map();
  const root={innerHTML:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}};
  const dialog={innerHTML:'',open:false,addEventListener(){},close(){this.open=false;},showModal(){this.open=true;}};
  const toast={textContent:'',hidden:true};
  const elements={'#root':root,'#review-dialog':dialog,'#toast':toast};
  const context={console,structuredClone,TextDecoder,Uint8Array,AbortController,crypto:webcrypto,Response,URL,
    location:{origin:'https://fixture.school'},navigator:{locks:{request:async(_key,callback)=>callback()}},setTimeout,clearTimeout,setInterval:()=>0,
    localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},
    document:{hidden:false,baseURI:options.baseURI||'https://fixture.github.io/waste-vision/',querySelector(selector){return elements[selector]??null;},addEventListener(){}},
    window:{addEventListener(){},scrollTo(){}},fetch:fetcher};
  vm.createContext(context);
  vm.runInContext(options.configOrigin ? configSource.replace(backend,options.configOrigin) : configSource,context);
  const injected=source.replace(/  render\(\);\s*\}\)\(\);\s*$/, '  globalThis.testApp={state,capture,current,run,signOut,pending,savePending,performOperation,api,checkQr,checkReceipt,render}; render();\n})();');
  assert.notEqual(injected,source);
  vm.runInContext(injected,context);
  return {...context.testApp,root,dialog,values,elements};
}
const student=(id='001',version=0)=>({studentId:id,fullName:`Fixture ${id}`,accountVersion:version,balance:50});
function login(app,id='001',version=0){app.state.epoch++;app.state.session={sessionToken:`fixture-private-token-${id}`,expiresAt:1900000000,student:student(id,version)};app.state.page='send';}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('late old-account QR or balance cannot apply after logout and another sign-in',async()=>{
  const app=fixture();login(app);
  let release;let applied=false;
  const work=app.run('fixture',()=>new Promise(resolve=>{release=resolve;}),()=>{applied=true;app.state.qr={qrText:'old-code'};});
  app.signOut('',false);login(app,'002');release({});await work;
  assert.equal(applied,false);assert.equal(app.state.session.student.studentId,'002');assert.equal(app.state.qr,null);
});
test('late 401 cannot sign out a newly active account',async()=>{
  const app=fixture();login(app);let reject;
  const work=app.run('fixture',()=>new Promise((_,fail)=>{reject=fail;}),()=>{});
  app.signOut('',false);login(app,'002');reject(Object.assign(new Error('old expired'),{status:401}));await work;
  assert.equal(app.state.session.student.studentId,'002');
});
test('login response cannot resurrect a session after an intervening sign-out',async()=>{
  const app=fixture();let release;let applied=false;
  const work=app.run('fixture',()=>new Promise(resolve=>{release=resolve;}),()=>{applied=true;},{auth:false});
  app.signOut('',false);release({});await work;assert.equal(applied,false);assert.equal(app.state.session,null);
});
test('pending request keeps its immutable payload across logout and owner changes',()=>{
  const app=fixture();login(app);
  const owner=app.capture().identity;
  const operation={owner,kind:'transfer',summary:'fixture',payload:{recipientId:'002',points:7,expectedRecipientName:'Fixture 002',expectedRecipientAccountVersion:0,requestId:'immutable-fixture-uuid'}};
  app.savePending(operation);app.signOut('',false);login(app,'002');assert.equal(app.pending(),null);
  login(app);assert.equal(app.pending().payload.requestId,'immutable-fixture-uuid');
  assert.throws(()=>app.savePending({...operation,payload:{...operation.payload,points:9}}),/previous receipt/);
  login(app,'001',1);assert.equal(app.pending(),null);
});
test('lost write reply retries the exact saved UUID and never trusts old receipt balance',async()=>{
  const calls=[];let lose=true;
  const app=fixture(async(path,options)=>{
    path=new URL(path).pathname;
    if(path==='/api/mobile/transfer'){
      calls.push(JSON.parse(options.body));if(lose){lose=false;throw new Error('reply lost after commit');}
      return json({transferId:'fixture-receipt',requestId:'exact-fixture-uuid',studentId:'001',accountVersion:0,studentName:'Fixture 001',recipientId:'002',recipientVersion:0,recipientName:'Fixture 002',points:7,balanceAfter:43,createdAt:'2026-11-12T00:00:00Z',dataVersion:1});
    }
    if(path==='/api/mobile/me')return json({student:{...student(),balance:48},serverTime:1900000000});
    if(path==='/api/mobile/transfers')return json({items:[]});
    throw new Error('unexpected '+path);
  });
  login(app);const owner=app.capture().identity;
  const operation={owner,kind:'transfer',summary:'fixture',total:7,payload:{recipientId:'002',points:7,expectedRecipientName:'Fixture 002',expectedRecipientAccountVersion:0,requestId:'exact-fixture-uuid'}};
  await app.performOperation(operation);assert.equal(app.pending().payload.requestId,'exact-fixture-uuid');
  await app.performOperation(app.pending());for(let i=0;i<10&&app.state.busy;i++)await tick();
  assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(app.pending(),null);
  assert.equal(app.state.session.student.balance,48);assert.equal(app.dialog.open,true);
});
test('API restricts paths, omits cookies, refuses redirects and sends nested errors safely',async()=>{
  let options,target;const app=fixture(async(path,value)=>{target=path;options=value;return json({error:{code:'INSUFFICIENT_POINTS',message:'There are not enough points.'}},409);});
  await assert.rejects(app.api('/api/mobile/transfer',{token:'fixture-private-token',payload:{points:9}}),/not enough points/);
  assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
  assert.equal(options.headers.Authorization,'Bearer fixture-private-token');
  assert.equal(target,backend+'/api/mobile/transfer');assert.equal(options.mode,'cors');assert.equal(options.referrerPolicy,'no-referrer');
  await assert.rejects(app.api('https://another.example/login'),/Invalid school/);
  await assert.rejects(app.api('/api/mobile/../kiosk/snapshot'),/Invalid school/);
  await assert.rejects(app.api('/api/mobile/me#private-fragment'),/Invalid school/);
});
test('server strings render as text and client QR accepts only short-lived signed server text',()=>{
  const app=fixture();login(app);app.state.session.student.fullName='<img src=x onerror=alert(1)>';app.render();
  assert.equal(app.root.innerHTML.includes('<img src=x'),false);assert.equal(app.root.innerHTML.includes('&lt;img'),true);
  assert.throws(()=>app.checkQr({qrText:'001',serverTime:10,expiresAt:130}),/invalid QR/);
  assert.throws(()=>app.checkQr({qrText:'WVQR1.payload.signature',serverTime:10,expiresAt:131}),/invalid QR/);
  assert.equal(app.checkQr({qrText:'WVQR1.payload.signature',serverTime:10,expiresAt:130}).qrText,'WVQR1.payload.signature');
});
test('malformed successful write response remains pending instead of becoming a receipt',async()=>{
  const app=fixture(async()=>json({unexpected:'not a transaction receipt'}));login(app);
  const operation={owner:app.capture().identity,kind:'transfer',summary:'fixture',total:7,payload:{recipientId:'002',points:7,expectedRecipientName:'Fixture 002',expectedRecipientAccountVersion:0,requestId:'uncertain-fixture-uuid'}};
  await app.performOperation(operation);
  assert.equal(app.pending().payload.requestId,'uncertain-fixture-uuid');
  assert.equal(app.dialog.open,false);assert.equal(app.state.session.student.balance,50);
  assert.match(app.state.message,/did not match/);
});
test('receipt binding rejects actor, account-generation, recipient, quote and nonce substitutions',()=>{
  const app=fixture();login(app);const actor=student();
  const operation={kind:'redeem',payload:{rewardId:1,quantity:2,expectedUnitCost:4,expectedRewardName:'Fixture notebook',requestId:'reward-fixture-uuid'}};
  const receipt={redemptionId:'receipt-fixture',claimCode:'FIXTURECLAIM',requestId:'reward-fixture-uuid',studentId:'001',accountVersion:0,studentName:'Fixture 001',rewardId:1,rewardName:'Fixture notebook',unitCost:4,quantity:2,totalPoints:8,balanceAfter:42,stockAfter:6,createdAt:'2026-11-12T00:00:00Z',collectedAt:null,dataVersion:2};
  assert.equal(app.checkReceipt(receipt,operation,actor),receipt);
  for(const patch of [{studentId:'002'},{accountVersion:1},{requestId:'another-nonce'},{rewardId:2},{rewardName:'Different item'},{unitCost:5},{quantity:3},{totalPoints:9},{stockAfter:-1},{dataVersion:undefined},{claimCode:''}]){
    assert.throws(()=>app.checkReceipt({...receipt,...patch},operation,actor),/did not match/);
  }
  const transfer={kind:'transfer',payload:{recipientId:'002',expectedRecipientAccountVersion:0,expectedRecipientName:'Fixture 002',points:8,requestId:'transfer-fixture-uuid'}};
  const sent={...receipt,transferId:'transfer-fixture',requestId:'transfer-fixture-uuid',recipientId:'002',recipientVersion:0,recipientName:'Fixture 002',points:8};
  assert.equal(app.checkReceipt(sent,transfer,actor),sent);
  for(const patch of [{recipientId:'003'},{recipientVersion:1},{recipientName:'Replaced Student'},{points:9}])assert.throws(()=>app.checkReceipt({...sent,...patch},transfer,actor),/did not match/);
});
test('corrupted or incomplete pending journal fails closed and cannot be overwritten',()=>{
  const app=fixture();login(app);const owner=app.capture().identity;
  const operation={owner,kind:'transfer',summary:'fixture',payload:{recipientId:'002',points:7,expectedRecipientName:'Fixture 002',expectedRecipientAccountVersion:0,requestId:'fixture-uuid'}};
  const key='wastevision.pending.v1:'+owner;
  for(const corrupt of ['{broken-json',JSON.stringify({owner,kind:'transfer',summary:'incomplete',payload:{requestId:'old-unknown-nonce'}})]){
    app.values.set(key,corrupt);assert.equal(app.pending().damaged,true);
    assert.throws(()=>app.savePending(operation),/could not read/);assert.equal(app.values.get(key),corrupt);
  }
});
test('QR rendering failure shows an explicit visible error immediately',()=>{
  const app=fixture();login(app);app.state.page='home';app.state.qr={qrText:'WVQR1.fixture.signature',expiresAt:Date.now()/1000+120};
  let removed=false;app.elements['#student-qr']={remove(){removed=true;}};
  app.elements['#qr-box']={innerHTML:''};app.elements['#qr-countdown']={textContent:''};
  app.render();assert.equal(removed,true);assert.equal(app.state.qr,null);
  assert.match(app.elements['#qr-box'].innerHTML,/could not be displayed/);
  assert.match(app.elements['#qr-countdown'].textContent,/QR unavailable/);
});
test('backend configuration accepts only the pinned HTTPS origin and fails closed before login',()=>{
  for(const configOrigin of ['http://waste-vision-student-qr.icy-lamp-1597.chatgpt.site','https://another.example','https://user:password@waste-vision-student-qr.icy-lamp-1597.chatgpt.site','https://waste-vision-student-qr.icy-lamp-1597.chatgpt.site/path','https://waste-vision-student-qr.icy-lamp-1597.chatgpt.site/?backend=evil']){
    const app=fixture(undefined,{configOrigin});assert.match(app.root.textContent,/configuration is invalid/);assert.equal(app.state,undefined);
  }
});
test('pending requests are isolated between Pages projects sharing one GitHub hostname',()=>{
  const first=fixture(undefined,{baseURI:'https://fixture.github.io/first-project/'});
  const second=fixture(undefined,{baseURI:'https://fixture.github.io/another-project/'});login(first);login(second);
  assert.notEqual(first.capture().identity,second.capture().identity);
  const owner=first.capture().identity;
  first.savePending({owner,kind:'transfer',summary:'fixture',payload:{recipientId:'002',points:7,expectedRecipientName:'Fixture 002',expectedRecipientAccountVersion:0,requestId:'project-fixture-uuid'}});
  for(const [key,value] of first.values)second.values.set(key,value);
  assert.equal(second.pending(),null);assert.equal(first.pending().payload.requestId,'project-fixture-uuid');
});
