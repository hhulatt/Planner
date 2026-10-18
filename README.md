# Planner

A content planner for short-form video, built as an installable web app for iPhone.

- **Ideas**: jot down ideas fast and track each one from Idea → Planned → Filmed → Posted.
- **Idea details**: hook, script, shot-list checklist, caption, hashtags, sound and notes.
- **Inspo**: save TikTok, Instagram and YouTube links with notes and tags, then turn any of them into an idea.
- **Calendar**: see what's going out on which day.
- **Backup**: export and restore your data as a file.

Everything is stored on your phone. There's no account and no server.

## Install on iPhone

1. Open the app's link in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Always open Planner from the home-screen icon. Data saved there is separate from data saved in Safari.

## Development

Plain HTML, CSS and JavaScript with no build step. To run it locally:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
