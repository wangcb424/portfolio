// Node 24 can load these TypeScript tests natively. Avoid the older Playwright
// ESM loader, which can hang with this Node release.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync(process.execPath,[path.join(__dirname,'node_modules/@playwright/test/cli.js'),'test',...process.argv.slice(2)],{
  // Playwright 1.52 otherwise applies offline mode to pages but leaves the
  // service worker's network online, which is not a real offline condition.
  stdio:'inherit',env:{...process.env,PW_DISABLE_TS_ESM:'1',PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS:'1'}
});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
