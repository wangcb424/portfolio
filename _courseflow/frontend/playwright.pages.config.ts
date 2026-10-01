import {defineConfig,devices} from '@playwright/test';

// Builds the real UI at a nested path, while explicitly mocking the public API.
// This suite validates static hosting/PWA paths, not a live backend deployment.
export default defineConfig({
  testDir:'./tests-pages',workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:4189',screenshot:'only-on-failure'},
  webServer:{
    command:'npm run build && node tests-pages/static-server.mjs',
    env:{VITE_BASE_PATH:'/portfolio/courseflow/'},
    url:'http://127.0.0.1:4189/portfolio/courseflow/',reuseExistingServer:false,
  },
  projects:[
    {name:'desktop',use:{viewport:{width:1440,height:1000}}},
    {name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}},
  ],
});
