import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesPath = join(root, "data", "fixtures.json");
const cupPath = join(root, "data", "cup.json");
const venuesPath = join(root, "data", "venues.json");
const SOURCE = "https://www.football.org.il/team-details/team-games?team_id=1896&season_id=28";
const CUP_SOURCE = "https://www.football.org.il/national-cup/?national_cup_id=590&season_id=28";
const TEAM_TOKEN = "ירמיהו";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const DRY = process.argv.includes("--dry-run");

async function readPage(page, url, min, tag) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
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
        out.push({ date: cells[0], match: cells[1], stadium: cells[2], time: cells[3], result: cells[4] || "" });
      }
    });
    return out;
  });
  if (rows.length < min) {
    const dbg = join(root, "debug");
    mkdirSync(dbg, { recursive: true });
    await page.screenshot({ path: join(dbg, tag + ".png"), fullPage: false });
    writeFileSync(join(dbg, tag + ".html"), await page.content(), "utf8");
  }
  return rows;
}

async function scrape() {
  const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
  try {
    const ctx = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      locale: "he-IL",
      viewport: { width: 1400, height: 1600 }
    });
    const page = await ctx.newPage();
    const league = await readPage(page, SOURCE, 20, "ifa");
    const cup = await readPage(page, CUP_SOURCE, 1, "ifa-cup");
    return { league, cup };
  } finally {
    await browser.close();
  }
}

function normTime(t) {
  if (!/^\d{1,2}:\d{2}$/.test(t || "")) return null;
  return t === "00:00" ? null : t;
}

function parseScore(result, home) {
  const m = (result || "").match(/(\d+)\s*[-–:]\s*(\d+)/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return home ? { us: a, them: b } : { us: b, them: a };
}

function splitMatch(match) {
  const parts = (match || "").split(" - ");
  const team1 = (parts[0] || "").trim();
  const rest = parts.slice(1).join(" - ").trim();
  const home = team1.includes(TEAM_TOKEN);
  return { home, opp: home ? rest : team1 };
}

function merge(rows, current, venues) {
  const games = [];
  rows.forEach((row, i) => {
    const r = i + 1;
    const prev = current.find(g => g.r === r) || {};
    const { home, opp } = splitMatch(row.match);
    const stadium = row.stadium || "";
    const vmap = stadium && venues[stadium] ? venues[stadium] : null;
    const time = normTime(row.time) || prev.time || null;
    const game = {
      r,
      d: row.date,
      home,
      opp: prev.opp || opp,
      venue: stadium ? (vmap && vmap.label ? vmap.label : stadium) : prev.venue || null,
      time,
      logo: prev.logo || null,
      score: parseScore(row.result, home) || prev.score || null
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

function mergeCup(rows, current) {
  const ours = rows.filter(row => (row.match || "").includes(TEAM_TOKEN));
  const games = [];
  ours.forEach((row, i) => {
    const r = i + 1;
    const prev = current.find(g => g.r === r) || {};
    const { home, opp } = splitMatch(row.match);
    games.push({
      r,
      d: row.date,
      home,
      opp: prev.opp || opp,
      venue: row.stadium || prev.venue || null,
      time: normTime(row.time) || prev.time || null,
      logo: prev.logo || null,
      score: prev.score || parseScore(row.result, home) || null
    });
  });
  current.forEach(g => { if (!games.find(x => x.r === g.r)) games.push(g); });
  games.sort((a, b) => a.r - b.r);
  return games;
}

function diff(before, after, label) {
  const changes = [];
  after.forEach(g => {
    const b = before.find(x => x.r === g.r);
    if (!b) { changes.push(`${label} ${g.r}: added`); return; }
    ["d", "home", "opp", "venue", "time", "score"].forEach(k => {
      if (JSON.stringify(b[k] ?? null) !== JSON.stringify(g[k] ?? null)) {
        changes.push(`${label} ${g.r}: ${k} ${JSON.stringify(b[k] ?? null)} -> ${JSON.stringify(g[k] ?? null)}`);
      }
    });
  });
  return changes;
}

const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8"));
const cupFile = JSON.parse(readFileSync(cupPath, "utf8"));
const venues = JSON.parse(readFileSync(venuesPath, "utf8"));

const { league, cup } = await scrape();
if (league.length < 20) {
  console.error(`only ${league.length} league rows scraped — aborting (Cloudflare block?)`);
  process.exit(1);
}

const result = { league: merge(league, fixtures.games, venues), cup: mergeCup(cup, cupFile.games || []) };

console.log(`league rows: ${league.length} | cup games (ours): ${result.cup.length}`);

const changes = diff(fixtures.games, result.league, "ליגה").concat(diff(cupFile.games || [], result.cup, "גביע"));
if (changes.length === 0) {
  console.log("No schedule changes detected");
} else {
  console.log(changes.map(c => "  " + c).join("\n"));
}
if (DRY) {
  console.log("dry run — nothing written");
  process.exit(0);
}

const stamp = new Date().toISOString().slice(0, 10);
fixtures.meta.updated = stamp;
fixtures.games = result.league;
cupFile.meta.updated = stamp;
cupFile.games = result.cup;
writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2) + "\n", "utf8");
writeFileSync(cupPath, JSON.stringify(cupFile, null, 2) + "\n", "utf8");
console.log(`wrote data/fixtures.json + data/cup.json (${stamp})`);
