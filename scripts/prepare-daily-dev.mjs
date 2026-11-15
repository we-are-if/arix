import { copyFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
const root = new URL('../', import.meta.url);
for (const [source, target] of [
  ['importedData.example.ts', 'importedData.ts'],
  ['sparexpertDefaults.example.ts', 'sparexpertDefaults.ts'],
  ['investorOpening.example.ts', 'investorOpening.local.ts'],
  ['productCatalog.example.ts', 'productCatalog.ts'],
]) {
  const dest = new URL(`daily-app/src/${target}`, root);
  await mkdir(new URL('daily-app/src/', root), { recursive: true });
  try {
    await copyFile(new URL(`daily-app/examples/${source}`, root), dest, constants.COPYFILE_EXCL);
    console.log(`Created empty development data: ${target}`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log(`Preserved existing data: ${target}`);
  }
}
