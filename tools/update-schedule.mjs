import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesPath = join(root, "data", "fixtures.json");
const venuesPath = join(root, "data", "venues.json");
const SOURCE = "https://www.football.org.il/team-details/team-games?team_id=1896&season_id=28";
const TEAM_TOKEN = "ירמיהו";
const DRY = process.argv.includes("--dry-run");

async function scrape() {
  const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
  try {
    const ctx = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      locale: "he-IL",
      viewport: { width: 1400, height: 1600 }
    });
    const page = await ctx.newPage();
    await page.goto(SOURCE, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".table_row", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const rows = await page.evaluate(() => {
      const cellText = el => {
        const c = el.cloneNode(true);
        c.querySelectorAll(".sr-only").forEach(n => n.remove());
        return c.textContent.replace(/\s+/g, " ").trim();
      };
      const out = [];
      document.querySelectorAll(".table_row").forEach(row => {
        const cells = [...row.querySelectorAll(".table_col")].map(cellText);
        if (cells.length >= 4 && /^\d{2}\/\d{2}\/\d{4}$/.test(cells[0])) {
          out.push({ date: cells[0], match: cells[1], stadium: cells[2], time: cells[3] });
        }
      });
      return out;
    });
    if (rows.length < 20) {
      const dbg = join(root, "debug");
      mkdirSync(dbg, { recursive: true });
      await page.screenshot({ path: join(dbg, "ifa.png"), fullPage: false });
      writeFileSync(join(dbg, "ifa.html"), await page.content(), "utf8");
    }
    return rows;
  } finally {
    await browser.close();
  }
}

function normTime(t) {
  if (!/^\d{1,2}:\d{2}$/.test(t || "")) return null;
  return t === "00:00" ? null : t;
}

function merge(rows, current, venues) {
  const games = [];
  rows.forEach((row, i) => {
    const r = i + 1;
    const prev = current.find(g => g.r === r) || {};
    const parts = row.match.split(" - ");
    const team1 = (parts[0] || "").trim();
    const rest = parts.slice(1).join(" - ").trim();
    const home = team1.includes(TEAM_TOKEN);
    const oppFromIla = home ? rest : team1;
    const stadium = row.stadium || "";
    const vmap = stadium && venues[stadium] ? venues[stadium] : null;
    const time = normTime(row.time) || prev.time || null;
    const game = {
      r,
      d: row.date,
      home,
      opp: prev.opp || oppFromIla,
      venue: stadium ? (vmap && vmap.label ? vmap.label : stadium) : prev.venue || null,
      time,
      logo: prev.logo || null
    };
    const source = vmap || prev;
    if (source.address) game.address = source.address;
    if (source.maps) game.maps = source.maps;
    if (source.waze) game.waze = source.waze;
    games.push(game);
  });
  current.forEach(g => { if (!games.find(x => x.r === g.r)) games.push(g); });
  games.sort((a, b) => a.r - b.r);
  return games;
}

function diff(before, after) {
  const changes = [];
  after.forEach(g => {
    const b = before.find(x => x.r === g.r);
    if (!b) { changes.push(`round ${g.r}: added`); return; }
    ["d", "home", "venue", "time"].forEach(k => {
      if (JSON.stringify(b[k] ?? null) !== JSON.stringify(g[k] ?? null)) {
        changes.push(`round ${g.r}: ${k} ${JSON.stringify(b[k] ?? null)} -> ${JSON.stringify(g[k] ?? null)}`);
      }
    });
  });
  return changes;
}

const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8"));
const venues = JSON.parse(readFileSync(venuesPath, "utf8"));
const rows = await scrape();
console.log(`scraped ${rows.length} games from IFA`);
if (rows.length < 20) {
  console.error("Too few games scraped (likely Cloudflare blocked the runner). No changes written.");
  process.exit(1);
}

const games = merge(rows, fixtures.games, venues);
const changes = diff(fixtures.games, games);
if (changes.length === 0) {
  console.log("No schedule changes detected.");
} else {
  console.log("changes:\n  " + changes.join("\n  "));
}

if (DRY) {
  console.log("dry-run: not writing files");
  process.exit(0);
}

const updated = new Date().toISOString().slice(0, 10);
const out = { meta: { ...fixtures.meta, updated }, games };
writeFileSync(fixturesPath, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`wrote data/fixtures.json (updated ${fixtures.meta.updated} -> ${updated})`);
