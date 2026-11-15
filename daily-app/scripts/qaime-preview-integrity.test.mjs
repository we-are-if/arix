import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const cssPath = path.resolve("daily-app/src/panel-shell.css");
const viewPath = path.resolve("daily-app/src/InvoiceAttachmentView.tsx");
const stagePath = path.resolve("daily-app/src/QaimePreviewStage.tsx");

test("qaime document preserves canonical 794px desktop width in CSS", () => {
  const css = fs.readFileSync(cssPath, "utf-8");
  assert.ok(css.includes("width:794px; min-width:794px; max-width:794px;"), "Base approval-paper must be 794px");
  assert.ok(css.includes(".approval-pdf-viewer .approval-paper"), "PDF viewer paper rule must exist");
  assert.ok(!css.includes(".approval-paper table { width: calc(100% - 16px); margin: 7px 8px 0; font-size: 6px; }"), "Destructive 6px table media query must be removed");
});

test("invoice attachment view embeds responsive preview stage in viewer and editor", () => {
  const code = fs.readFileSync(viewPath, "utf-8");
  assert.ok(code.includes("<QaimePreviewStage"), "InvoiceAttachmentView must use QaimePreviewStage");
  assert.ok(code.includes('mode="editor"'), "Editor must use QaimePreviewStage");
  assert.ok(code.includes('mode="viewer"'), "Viewer must use QaimePreviewStage");
  assert.ok(code.includes("generateHighResCanvas"), "Must have high-resolution canvas generator");
  assert.ok(code.includes("scale: 2"), "Must capture at scale 2 for retina fidelity");
});

test("preview stage computes scale cleanly without squishing internal elements", () => {
  const stage = fs.readFileSync(stagePath, "utf-8");
  assert.ok(stage.includes("A4_WIDTH = 794"), "Canonical A4 width must be 794px");
  assert.ok(stage.includes("transform: `scale(${scale})`"), "Must scale via CSS transform");
  assert.ok(stage.includes("transformOrigin: \"top left\""), "Must scale from top left");
  assert.ok(stage.includes("QaimeDocument"), "Must render untouched QaimeDocument inside");
});

test("svg icons in qaime document use explicit hex colors to avoid disappearing in html2canvas", () => {
  const docPath = path.resolve("daily-app/src/QaimeDocument.tsx");
  const docCode = fs.readFileSync(docPath, "utf-8");
  assert.ok(docCode.includes("ICON_CONFIG"), "Must configure explicit icon colors");
  assert.ok(docCode.includes("stroke={color}"), "Must pass explicit stroke color to Lucide icon");
  assert.ok(docCode.includes("color={status.color}"), "Status icon must have explicit color");

  const viewCode = fs.readFileSync(viewPath, "utf-8");
  assert.ok(viewCode.includes("currentColor"), "generateHighResCanvas must resolve currentColor in SVGs");
});
