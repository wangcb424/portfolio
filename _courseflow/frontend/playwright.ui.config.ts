import {defineConfig,devices} from '@playwright/test';
// UI-only contract fixtures. This suite does not start or validate the Java backend.
export default defineConfig({
  testDir:'./tests-ui',workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:4188',screenshot:'only-on-failure'},
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4188',url:'http://127.0.0.1:4188',reuseExistingServer:false},
  projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}]
});
