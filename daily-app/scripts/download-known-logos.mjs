import fs from "fs";

async function download(url, dest) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    });
    console.log(`Fetch ${url} -> status ${res.status}`);
    const text = await res.text();
    fs.writeFileSync(dest, text, "utf8");
    console.log(`Saved ${dest} (${text.length} bytes)`);
  } catch (err) {
    console.error(`Failed ${url}:`, err.message);
  }
}

// m10
await download("https://cdn.prod.website-files.com/687df8fbf77109d01f751481/693162a61ef2191aca010caa_m10%20transaction%20logo.svg", "daily-app/scripts/m10-logo.svg");

// leobank
await download("https://leobank.az/-/icon.svg?icon.0n7l_jxkjrydj.svg", "daily-app/scripts/leobank-icon.svg");
await download("https://leobank.az/_next/static/media/logo.3dbnk71xkdbo1.svg", "daily-app/scripts/leobank-logo.svg");

// rabitabank
await download("https://www.rabitabank.com/images/logo_white.svg?v=4", "daily-app/scripts/rabitabank-logo.svg");
