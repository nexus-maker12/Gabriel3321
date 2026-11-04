if(process.env.AUREA_TEST_FAIL_WRITE==='1') require('node:fs').renameSync=()=>{throw Object.assign(new Error('Simulación de error de escritura'),{code:'EACCES'});};
const app = require('../server');
const server = app.listen(0,'127.0.0.1',() => process.send({port:server.address().port}));
process.on('message',message=>{if(message==='stop') server.close(()=>process.exit(0));});
