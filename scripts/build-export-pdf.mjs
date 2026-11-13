import { build } from 'esbuild';

// Bundle the trusted template and its CSS together so old browsers cannot supply a template.
await build({
  entryPoints: ['server/exportDocumentTemplate.tsx'],
  outfile: 'server/exportDocumentTemplate.cjs',
  platform: 'node', format: 'cjs', bundle: true, jsx: 'automatic',
  loader: { '.css': 'text' },
  define: { 'process.env.NODE_ENV': '"production"' },
});
