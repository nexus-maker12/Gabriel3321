require('dotenv').config({quiet:true});
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const mongoose=require('mongoose');
const models=require('../models');
const EJSON=mongoose.mongo.BSON.EJSON;
const root=path.resolve(__dirname,'..');
const dataPath=process.env.AUREA_DATA_FILE?path.resolve(process.env.AUREA_DATA_FILE):path.join(root,'data/database.json');
const plain=document=>{const value={...document};delete value._id;delete value.__v;return value;};
const zeroRates={oro24k_fino_benchmark:0,oro18k_nacional_base:0,oro18k_italiano_base:0,retal_oro18k_compra:0,plata925_venta:0,override_promedioPuro24k:null,override_promedioNacional:null,override_promedioItaliano:null,last_updated:new Date()};
function emptyState(admin,ownerRole) {
  return {rates:zeroRates,puro24k:{stockGrams:0,purchases:[],deliveries:[]},items:[],clients:[],suppliers:[],orders:[],payments:[],categories:[],paymentMethods:[],cashMovements:[],sessions:[],roles:ownerRole?{superadmin:plain(ownerRole)}:{},users:[plain(admin)]};
}
async function resetDB() {
  if(!process.argv.includes('--confirm-empty')) throw Error('Usa --confirm-empty únicamente cuando se haya autorizado vaciar esta base.');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const backup=path.resolve(root,'..','respaldos-aurea',stamp);
  fs.mkdirSync(backup,{recursive:true});
  if(fs.existsSync(dataPath)) fs.copyFileSync(dataPath,path.join(backup,'database.local.antes.json'));
  let state,counts={};
  if(process.env.AUREA_STORAGE==='local' || !process.env.MONGODB_URI?.trim()) {
    const original=JSON.parse(fs.readFileSync(dataPath,'utf8'));
    const admin=(original.users||[]).find(user=>user.role==='superadmin'&&user.username==='superadmin')||(original.users||[]).find(user=>user.role==='superadmin');
    if(!admin?.passwordHash||!admin.salt) throw Error('No existe un superadministrador válido que conservar.');
    state=emptyState(admin,original.roles?.superadmin);
  } else {
    await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:15000});
    if(mongoose.connection.name!=='nexus_por_mayor') throw Error('La base conectada no es nexus_por_mayor. Operación cancelada.');
    await Promise.all(Object.values(models).map(model=>model.init()));
    const names=(await mongoose.connection.db.listCollections({}, {nameOnly:true}).toArray()).map(c=>c.name).filter(name=>!name.startsWith('system.'));
    let attempt=0,committedBackup;
    const session=await mongoose.startSession();
    try {
      await session.withTransaction(async()=>{
        attempt++;
        const snapshot={};
        for(const name of names) snapshot[name]=await mongoose.connection.db.collection(name).find({}, {session}).toArray();
        const users=snapshot[models.User.collection.name]||[];
        const admin=users.find(user=>user.role==='superadmin'&&user.username==='superadmin')||users.find(user=>user.role==='superadmin');
        if(!admin?.passwordHash||!admin.salt) throw Error('No existe un superadministrador válido en MongoDB. No se borrará nada.');
        const ownerRole=(snapshot[models.Role.collection.name]||[]).find(role=>role.id==='superadmin');
        committedBackup=`mongodb.antes.${attempt}.ejson`;
        const content=EJSON.stringify({database:mongoose.connection.name,capturedAt:new Date(),collections:snapshot},null,2,{relaxed:false});
        fs.writeFileSync(path.join(backup,committedBackup),content,'utf8');
        if(!fs.statSync(path.join(backup,committedBackup)).size) throw Error('El respaldo no se creó correctamente.');
        for(const name of names) await mongoose.connection.db.collection(name).deleteMany({}, {session});
        await models.User.collection.insertOne(admin,{session});
        if(ownerRole) await models.Role.collection.insertOne(ownerRole,{session});
        await models.Rates.collection.insertOne({...zeroRates},{session});
        await models.Puro24k.collection.insertOne({stockGrams:0,purchases:[],deliveries:[]},{session});
        state=emptyState(admin,ownerRole);
      },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
    } finally {await session.endSession();}
    for(const name of names) counts[name]=await mongoose.connection.db.collection(name).countDocuments();
    if(await models.User.countDocuments()!==1 || await models.Session.countDocuments()!==0) throw Error('La comprobación de usuarios/sesiones falló.');
    for(const model of [models.Item,models.Client,models.Supplier,models.Order,models.Payment,models.CashMovement,models.Category,models.PaymentMethod]) if(await model.countDocuments()!==0) throw Error('Quedan registros en '+model.collection.name);
    const saved=await models.User.findOne({role:'superadmin'}).lean();
    if(saved.passwordHash!==state.users[0].passwordHash || saved.salt!==state.users[0].salt) throw Error('La contraseña del administrador no coincide.');
    fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify({database:mongoose.connection.name,committedBackup,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(backup,committedBackup))).digest('hex'),counts},null,2));
  }
  const temporary=dataPath+'.reset-'+crypto.randomUUID()+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(state,null,2));
  fs.renameSync(temporary,dataPath);
  const local=JSON.parse(fs.readFileSync(dataPath,'utf8'));
  if(local.users.length!==1||local.users[0].role!=='superadmin') throw Error('La comprobación local falló.');
  console.log(JSON.stringify({success:true,database:process.env.AUREA_STORAGE==='local'?'local':mongoose.connection.name||'local',backup,counts,onlyUser:local.users[0].username,passwordPreserved:true},null,2));
}
resetDB().catch(error=>{console.error('No se completó el vaciado:',error.message);process.exitCode=1;}).finally(()=>mongoose.disconnect());
