# מ.כ ירמיהו חולון — לוח משחקים 2026/27

עמוד HTML סטטי עם לוח המשחקים של קבוצת ילדים א׳ (ליגת ילדים א׳ מחוז דן) והלוגו של כל יריבה.
מתארח ב־GitHub Pages: https://arrow0108.github.io/U13-Season-2026-2027/

## מה יש כאן

| קובץ | תפקיד |
|---|---|
| `index.html` | העמוד עצמו. נטען מהדפדפן ומציג את הלוח |
| `data/fixtures.json` | **מקור האמת** של לוח המשחקים (30 משחקים) |
| `data/venues.json` | מיפוי שם מגרש ← כתובת + קישורי ניווט (Google Maps / Waze) |
| `data/player.json` | נתוני השחקן (#29) — דקות, שערים, בישולים, הרכב/מחליף |
| `tools/update-schedule.mjs` | סקריפט שמושך את הלוח מאתר ההתאחדות ומעדכן את `fixtures.json` |
| `.github/workflows/update-schedule.yml` | הרצה ידנית של העדכון מ־GitHub Actions (הקובץ מוכן מקומית — יש להוסיף אותו לריפו כדי שהכפתור יופיע) |
| `assets/` | לוגואים |

## איך מעדכנים את הלוח כשההתאחדות מפרסמת שיבוץ

### אפשרות 1 — GitHub Actions (הכי נוח, בלי להתקין כלום)

> דרישה מקדימה: להוסיף לריפו את `.github/workflows/update-schedule.yml`
> (בממשק GitHub: **Add file → Create new file**, ולהדביק את תוכן הקובץ).
> ללא הקובץ הזה לא יופיע ה־workflow בלשונית Actions.

1. נכנסים לריפו → לשונית **Actions**.
2. בוחרים בגלילה **Update schedule** ואז **Run workflow** ← **Run workflow**.
3. הסקריפט מושך את הנתונים מאתר ההתאחדות. אם יש שינויים הוא מבצע commit אוטומטית,
   ו־GitHub Pages מתעדכן תוך כדקה.

אפשר להוסיף גם הרצה מתוזמנת (למשל פעם ביום) על־ידי הוספת `schedule` עם `cron` ל־workflow.

### אפשרות 2 — הרצה מהמחשב

```bash
npm install
npx playwright install chromium
npm run update
git add data/fixtures.json
git commit -m "update schedule"
git push
```

לבדיקה בלי לשנות קבצים:

```bash
npm run update:dry
```

### אפשרות 3 — עריכה ידנית

עורכים ישירות את `data/fixtures.json` (למשל משנים `"time": "14:00"` או מוסיפים `"venue": "..."`),
שומרים, ומבצעים commit + push. GitHub Pages מתעדכן אוטומטית.

## תוצאות משחקים וסטטיסטיקות שחקן

### תוצאה לכל מחזור

כל משחק ב־`data/fixtures.json` כולל שדה `score`:

```json
"score": { "us": 3, "them": 1 }
```

- `us` — שערי ירמיהו חולון, `them` — שערי היריבה.
- `null` — המשחק טרם שוחק (בעמוד יוצג "טרם נשוחק").
- כשההתאחדות מפרסמת תוצאה, סקריפט העדכון ממלא אותה אוטומטית (עמודת "תוצאה").

### סטטיסטיקות השחקן — `data/player.json`

```json
{
  "name": "שם השחקן",
  "number": 29,
  "position": "קשר",
  "games": [
    { "r": 1, "min": 60, "goals": 2, "assists": 1, "started": true }
  ]
}
```

- `r` — מספר המחזור, `min` — דקות משחק, `goals` — שערים, `assists` — בישולים.
- `started: true` — פתח בהרכב, `false` — נכנס כמחליף.
- בעמוד תוצג שורת נתונים לכל מחזור, וסה״כ עונתי מתחתיה, וכן תקציר בכל שורת משחק בלוח.

## הוספת מגרש חדש

כשההתאחדות מפרסמת משחק במגרש שעדיין לא מוכר, מוסיפים רשומה ל־`data/venues.json`:

```json
"שם המגרש בדיוק כפי שמופיע בהתאחדות": {
  "label": "שם לתצוגה",
  "address": "כתובת מלאה",
  "maps": "https://maps.app.goo.gl/xxxx",
  "waze": "https://www.waze.com/ul?ll=<lat>,<lng>&navigate=yes&zoom=17"
}
```

מרגע שהמגרש מופיע ב־`venues.json`, כל משחק (בית או חוץ) שנערך באותו מגרש יקבל אוטומטית
כתובת וכפתורי ניווט ל־Google Maps ול־Waze.

## הערות

- אתר ההתאחדות מוגן ב־Cloudflare ומחזיר `403` לבקשות רגילות, ולכן הסקריפט משתמש בדפדפן אמיתי
  (Playwright). אם הרצה ב־GitHub Actions נכשלת (למשל חסימת IP של הענן), מריצים מקומית (אפשרות 2).
- כשההרצה נכשלת, נשמרת צילום־מסך ב־`debug/` כדי להבין מה קרה.
- הריפו ציבורי, ולכן GitHub Pages פעיל ללא עלות.
