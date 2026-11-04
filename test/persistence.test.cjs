const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {fork}=require('node:child_process');
const {once}=require('node:events');
async function isolated(data,failWrite,run){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aurea-persistence-')),file=path.join(dir,'database.json');fs.writeFileSync(file,data);
  const child=fork(path.join(__dirname,'fixture-server.cjs'),[],{env:{...process.env,AUREA_STORAGE:'local',AUREA_DATA_FILE:file,AUREA_TEST_FAIL_WRITE:failWrite?'1':'0'},stdio:['ignore','ignore','ignore','ipc']});
  try{const [message]=await once(child,'message');await run(`http://127.0.0.1:${message.port}`,file,dir);}
  finally{child.send('stop');await once(child,'exit');}
}
test('Un JSON corrupto produce error y se conserva sin sobrescribirlo',async()=>{
  await isolated('{datos-corruptos',false,async(base,file)=>{
    const res=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'owner',password:'Password2026!'})});assert.equal(res.status,503);assert.equal(fs.readFileSync(file,'utf8'),'{datos-corruptos');
  });
});
test('Una escritura fallida no devuelve éxito ni deja una base parcialmente escrita',async()=>{
  const salt='test-salt',password='Password2026!';const original=JSON.stringify({users:[{id:'owner',username:'owner',role:'superadmin',status:'activo',salt,passwordHash:crypto.pbkdf2Sync(password,salt,1000,64,'sha512').toString('hex')}]});
  await isolated(original,true,async(base,file,dir)=>{
    const res=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'owner',password})});assert.equal(res.status,500);assert.equal(fs.readFileSync(file,'utf8'),original);assert.equal(fs.readdirSync(dir).filter(name=>name.endsWith('.tmp')).length,0);
  });
});
