import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import fs from 'node:fs';

async function test() {
  let parserCode = fs.readFileSync('daily-app/src/qaimeParser.ts', 'utf-8');

  // Let's check parseProductIdentity codePattern
  const oldCodePattern = `  const codePattern = /(?:G\\d+(?:_\\d+)?\\s+)?(?:ES\\s*(?:(?:HG|HC|SM|FL)\\s*)?\\d+(?:\\s*-\\s*\\d+)?|SFL\\s*\\d+(?:\\s*-\\s*\\d+)?|ERSA\\s*\\d+(?:\\s*-\\s*\\d+)?|C\\s*[1I8HB]\\d{3}|[A-Z]{1,4}\\s*\\d{3,6}(?:\\s*-\\s*\\d+)?)/gi;`;

  const newCodePattern = `  const codePattern = /(?:G\\d+(?:_\\d+)?\\s+)?(?:ES\\s*(?:(?:HG|HC|SM|FL|EC|M)\\s*)?\\d+(?:\\s*-\\s*\\d+)?|SFL\\s*\\d+(?:\\s*-\\s*\\d+)?|ER(?:SA)?\\s*\\d+(?:\\s*-\\s*\\d+)?|C\\s*[1I8HB\\d]\\d{1,4}(?:-[A-Z0-9]+)?|[A-Z]{1,4}\\s*\\d{2,6}(?:\\s*-\\s*\\d+)?|\\b\\d{3,4}\\.\\d\\b|\\b(?:7021|7031|8013)\\b)/gi;`;

  assert(parserCode.includes(oldCodePattern), 'oldCodePattern found');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log('Assertion passed:', msg);
}

test();
