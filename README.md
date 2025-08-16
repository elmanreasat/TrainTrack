# Workout Tracker (Offline, Expo + SQLite Legacy)

A clean, offline-first workout template and logging app using Expo and expo-sqlite/legacy.

Features

- Templates with unique names and configurable number of weeks
- Week view and day tabs (7 days)
- Add/delete exercises per day (name, sets, reps, weight, notes)
- Fully offline using SQLite (legacy API)

Project structure

- App.js — Navigation setup
- src/db/db.js — SQLite schema and CRUD helpers
- src/screens/\* — Screens for templates, weeks, days, and the exercise form

Notes

- Uses expo-sqlite/legacy per Expo 53 docs.
- Exercises are keyed by template_id + week + day. Multiple same-name exercises allowed.

Try it

1. Install deps (first time).
2. Start the app.

Commands (PowerShell)

```powershell
npm install
npm run start
```

