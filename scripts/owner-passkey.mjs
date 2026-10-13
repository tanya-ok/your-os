import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { issueEnrollmentCode } from '../lib/owner-approval.js';

if (process.argv[2] !== 'enroll') throw new Error('Usage: node scripts/owner-passkey.mjs enroll');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'private');
const code = await issueEnrollmentCode(root);
process.stdout.write(`One-use owner enrollment code (expires in 10 minutes):\n${code}\n`);
process.stdout.write(
  'Enter it in Setup / Local confirmation on the localhost origin. Do not share or save this code.\n'
);
