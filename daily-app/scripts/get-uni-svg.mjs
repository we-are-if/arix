import fs from "fs";

async function getUniSvg() {
  const urls = [
    "https://seeklogo.com/images/U/unibank-logo-023E2A349A-seeklogo.com.png",
    "https://vectorseek.com/wp-content/uploads/2023/09/Unibank-Logo-Vector.svg-.png",
    "https://upload.wikimedia.org/wikipedia/commons/5/5a/Unibank_Logo.png"
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
      console.log(u, "->", r.status);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        fs.writeFileSync("daily-app/scripts/unibank-logo.png", buf);
        console.log("Saved unibank-logo.png, size:", buf.length);
        break;
      }
    } catch (e) {
      console.error(e.message);
    }
  }
}

await getUniSvg();
