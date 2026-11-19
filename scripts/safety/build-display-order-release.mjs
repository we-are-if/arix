import { parse } from "acorn";
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const root = "tmp/display-order-release/";
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
const helper = fs.readFileSync("shared/dailyDisplayOrder.js", "utf8").replaceAll("export function", "function") + `
function dailyGroupedRow(runtime,row,entry,index,rows,company) {
  if (!isTrailingDailyEntry(entry,company) || (index > 0 && isTrailingDailyEntry(rows[index-1],company))) return row;
  return runtime.jsxs(runtime.Fragment,{children:[runtime.jsx("div",{
    className:"operation-group-divider",role:"heading","aria-level":3,
    style:{flex:"0 0 auto",gridColumn:"1 / -1",padding:"8px 12px",marginTop:6,borderTop:"1px solid var(--border, #dfe3ec)",color:"var(--muted, #738096)",fontSize:12,fontWeight:600,lineHeight:1.4},
    children:company==="sparexpert"?"Daxili köçürmələr":"Təchizatçıya ödənişlər"
  }),row]},entry.id);
}
`;
const manifest = [];
for (const [company, chunk, loader] of [["azartmembran","DailyWorkspace-C9GhAEbY.js","index-DA5y_TCJ.js"],["sparexpert","DailyWorkspace-DOCOs3aV.js","index-zjdRfMb8.js"]]) {
  const source = fs.readFileSync(root+chunk,"utf8");
  const tree = parse(source,{ecmaVersion:"latest",sourceType:"module"});
  const matches=[];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type==="CallExpression" && node.callee?.property?.name==="map" && node.arguments[0]?.type==="ArrowFunctionExpression" && source.slice(node.arguments[0].start,node.arguments[0].end).includes('"operation-row"')) matches.push(node);
    for (const v of Object.values(node)) { if(Array.isArray(v)) v.forEach(walk); else if(v?.type) walk(v); }
  }
  walk(tree); assert.equal(matches.length,1);
  const call=matches[0],arrow=call.arguments[0],ret=arrow.body.body.find(n=>n.type==="ReturnStatement");
  assert.equal(arrow.params.length,2); assert.equal(ret.argument.type,"CallExpression");
  const runtime=source.slice(ret.argument.callee.object.start,ret.argument.callee.object.end);
  const [entry,index]=arrow.params.map(n=>source.slice(n.start,n.end));
  const edits=[
    [call.callee.object.start,call.callee.object.end,`orderDailyDisplayEntries(${source.slice(call.callee.object.start,call.callee.object.end)},${JSON.stringify(company)})`],
    [arrow.params[1].end,arrow.params[1].end,",dailyOrderedRows"],
    [ret.argument.start,ret.argument.end,`dailyGroupedRow(${runtime},${source.slice(ret.argument.start,ret.argument.end)},${entry},${index},dailyOrderedRows,${JSON.stringify(company)})`],
  ];
  let next=source;for(const [a,b,value] of edits.sort((a,b)=>b[0]-a[0]))next=next.slice(0,a)+value+next.slice(b);
  next+='\n'+helper;
  parse(next,{ecmaVersion:"latest",sourceType:"module"});
  const chunkNext='DailyWorkspace-'+hash(next).slice(0,12)+'.js';fs.writeFileSync(root+chunkNext,next);
  const loaderSource=fs.readFileSync(root+loader,'utf8');assert.ok(loaderSource.includes(chunk));
  const loaderNextSource=loaderSource.replaceAll(chunk,chunkNext);
  const loaderNext='index-'+hash(loaderNextSource).slice(0,12)+'.js';fs.writeFileSync(root+loaderNext,loaderNextSource);
  manifest.push({company,chunk,chunkNext,loader,loaderNext,chunkHash:hash(source),loaderHash:hash(loaderSource)});
}
fs.writeFileSync(root+'manifest.json',JSON.stringify(manifest,null,2));
console.log(manifest);
