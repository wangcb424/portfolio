import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests-free',workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:4190',screenshot:'only-on-failure'},
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4190',env:{VITE_FREE_MODE:'true',VITE_PUBLIC_API_URL:'https://api.courseflow.test',VITE_BASE_PATH:'/portfolio/courseflow/'},url:'http://127.0.0.1:4190/portfolio/courseflow/',reuseExistingServer:false},
  projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],
});
