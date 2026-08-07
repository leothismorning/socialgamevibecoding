import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(serverDirectory, '..');

// Load local secrets before modules such as studyDb resolve configuration at
// import time. Railway-provided process variables keep precedence by default.
dotenv.config({
  path: [
    path.join(projectRoot, '.env.pool.local'),
    path.join(projectRoot, '.env.local'),
    path.join(projectRoot, '.env'),
  ],
});
