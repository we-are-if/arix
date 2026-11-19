import fs from "fs";

async function getUni() {
  const res = await fetch("https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=Unibank%20Azerbaijan&gsrnamespace=6&prop=imageinfo&iiprop=url&format=json", {
    headers: { "User-Agent": "Antigravity/1.0" }
  });
  const data = await res.json();
  console.log("Wikimedia Unibank results:", Object.values(data.query?.pages || {}).map(p => ({ title: p.title, url: p.imageinfo?.[0]?.url })));

  // Also download the png from unibank.az
  const imgRes = await fetch("https://unibank.az/assets/images/logonew-orange1.png", {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  console.log("unibank.az png status:", imgRes.status);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  fs.writeFileSync("daily-app/scripts/unibank-official.png", buf);
  console.log("Saved unibank-official.png, bytes:", buf.length);
}

await getUni();
