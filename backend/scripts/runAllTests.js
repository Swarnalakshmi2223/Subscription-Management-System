import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const deterministicTests = [
  'testInvoiceMath.js',
  'testDiscountService.js',
];
const databaseTests = [
  'testBilling.js',
  'testPayments.js',
  'testReports.js',
  'testOwnership.js',
];
const tests = [...deterministicTests, ...databaseTests, 'testRoleMatrix.js'];
const skipped = [];
const failures = [];

for (const file of tests) {
  const isDatabaseTest = databaseTests.includes(file);
  if (isDatabaseTest && !process.env.MONGODB_URI) {
    skipped.push(`${file} (MONGODB_URI is not configured)`);
    console.log(`SKIPPED ${file}: MONGODB_URI is not configured`);
    continue;
  }

  console.log(`RUN ${file}`);
  const result = spawnSync(process.execPath, [`scripts/${file}`], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) failures.push(file);
}

console.log(JSON.stringify({ tests, skipped, failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;
else console.log('All configured test scripts completed successfully.');
