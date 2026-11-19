import fs from "fs";

async function fetchRemaining() {
  // ATB official logo
  try {
    const res = await fetch("https://atb.az/wp-content/uploads/2023/01/logo.svg", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const text = await res.text();
    fs.writeFileSync("daily-app/scripts/atb-logo.svg", text, "utf8");
    console.log("Saved atb-logo.svg, length:", text.length);
  } catch (e) {
    console.error("ATB error:", e.message);
  }

  // Unibank sprite / svg
  try {
    const res = await fetch("https://unibank.az/assets/images/sprites/sprite.svg", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    console.log("Unibank sprite.svg status:", res.status);
    if (res.ok) {
      const text = await res.text();
      fs.writeFileSync("daily-app/scripts/unibank-sprite.svg", text, "utf8");
      console.log("Saved unibank-sprite.svg, length:", text.length);
    }
  } catch (e) {
    console.error("Unibank error:", e.message);
  }

  // Kapital Bank official SVG from Wikimedia (direct official brand file)
  try {
    const res = await fetch("https://upload.wikimedia.org/wikipedia/commons/e/ec/Kapital_Bank_logo.svg", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    console.log("Kapital Wikimedia SVG status:", res.status);
    if (res.ok) {
      const text = await res.text();
      fs.writeFileSync("daily-app/scripts/kapital-logo.svg", text, "utf8");
      console.log("Saved kapital-logo.svg, length:", text.length);
    }
  } catch (e) {
    console.error("Kapital error:", e.message);
  }
}

await fetchRemaining();
