// Runs exclusively against disposable fixtures; never targets localhost:3500.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync(process.execPath,['--test','test/regression.test.cjs','test/client.test.cjs','test/persistence.test.cjs'],{cwd:path.join(__dirname,'..'),stdio:'inherit'});
process.exit(result.status ?? 1);
