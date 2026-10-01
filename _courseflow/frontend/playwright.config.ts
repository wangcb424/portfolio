import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./tests',fullyParallel:false,workers:1,timeout:60000,
  use:{baseURL:'http://127.0.0.1:4187',screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'java -jar ../backend/target/courseflow-0.2.0.jar --spring.profiles.active=demo --server.port=4187',
    url:'http://127.0.0.1:4187/actuator/health',timeout:120000,reuseExistingServer:false,
    env:{SPRING_DATASOURCE_URL:'jdbc:h2:mem:e2e;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1;INIT=CREATE DOMAIN IF NOT EXISTS TIMESTAMPTZ AS TIMESTAMP WITH TIME ZONE'}},
  projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}]
});
