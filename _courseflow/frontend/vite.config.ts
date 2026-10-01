import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'');
  const base=env.VITE_BASE_PATH||'/';
  if(!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) {
    throw new Error('VITE_BASE_PATH must be an absolute path ending in /, such as /portfolio/courseflow/.');
  }
  return {base,plugins:[react()],server:{proxy:{'/api':'http://localhost:8080'}}};
});
