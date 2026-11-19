import fs from "fs";

async function findUniAndKapital() {
  // Query Wikimedia Commons API for Kapital Bank logo
  try {
    const res = await fetch("https://commons.wikimedia.org/w/api.php?action=query&titles=File:Kapital_Bank_logo.svg&prop=imageinfo&iiprop=url&format=json", {
      headers: { "User-Agent": "Antigravity/1.0" }
    });
    const data = await res.json();
    const pages = data.query.pages;
    const page = Object.values(pages)[0];
    const url = page.imageinfo?.[0]?.url;
    console.log("Wikimedia Kapital URL:", url);
    if (url) {
      const svgRes = await fetch(url, { headers: { "User-Agent": "Antigravity/1.0" } });
      const svgText = await svgRes.text();
      fs.writeFileSync("daily-app/scripts/kapital-logo.svg", svgText, "utf8");
      console.log("Saved kapital-logo.svg, length:", svgText.length);
    }
  } catch (e) {
    console.error("Wikimedia error:", e.message);
  }

  // Check Unibank stylesheets on unibank.az
  try {
    const res = await fetch("https://unibank.az/en", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const html = await res.text();
    const cssLinks = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map(m => m[1]);
    console.log("Unibank CSS links:", cssLinks);
    for (const link of cssLinks.slice(0, 3)) {
      const fullUrl = link.startsWith("http") ? link : `https://unibank.az${link}`;
      const cssRes = await fetch(fullUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const css = await cssRes.text();
      const spriteMatch = css.match(/\.sprite--logo[^{]*\{[^}]*\}/gi);
      if (spriteMatch) {
        console.log("Found sprite match in", fullUrl, spriteMatch);
      }
      const bgMatch = [...css.matchAll(/background(?:-image)?:\s*url\(([^)]+)\)/gi)]
        .map(m => m[1].replace(/['"]/g, ""))
        .filter(u => /logo|sprite/i.test(u));
      console.log("Logo/sprite backgrounds in", fullUrl, bgMatch.slice(0, 5));
    }
  } catch (e) {
    console.error("Unibank css error:", e.message);
  }
}

await findUniAndKapital();
