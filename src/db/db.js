// Data layer using expo-sqlite modern async API (SDK 53+)
import * as SQLite from "expo-sqlite";

// Simple console logs (always on)
const log = (...args) => console.log("[DB]", ...args);
const warn = (...args) => console.warn("[DB]", ...args);

let _db = null;
async function getDb() {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync("workouts.db");
  }
  return _db;
}

// A promise that resolves when the DB schema is initialized and migrations are applied
let dbReadyPromise = null;

// Small helpers (async/await wrappers)
async function queryAll(sql, params = []) {
  const db = await getDb();
  return db.getAllAsync(sql, params);
}

async function queryFirst(sql, params = []) {
  const db = await getDb();
  if (typeof db.getFirstAsync === "function") {
    return db.getFirstAsync(sql, params);
  }
  const arr = await db.getAllAsync(sql, params);
  return arr[0] || null;
}

async function exec(sql, params = []) {
  const db = await getDb();
  // Returns { changes, lastInsertRowId }
  return db.runAsync(sql, params);
}

async function execBatch(stmts) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const [sql, params = []] of stmts) {
      await db.runAsync(sql, params);
    }
  });
}

export function initDb() {
  if (!dbReadyPromise) {
    dbReadyPromise = (async () => {
      log("initDb: start");
      const db = await getDb();

      // 1) Ensure base tables exist and PRAGMA
      await db.withTransactionAsync(async () => {
        try {
          await db.runAsync("PRAGMA foreign_keys = ON;");
          log("initDb: PRAGMA foreign_keys=ON applied");
        } catch (e) {
          warn("initDb: failed to enable foreign_keys", e);
        }
        const tables = [
          {
            name: "templates",
            sql: `CREATE TABLE IF NOT EXISTS templates (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              weeks INTEGER
            );`,
          },
          {
            name: "weeks",
            sql: `CREATE TABLE IF NOT EXISTS weeks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              template_id INTEGER NOT NULL,
              week INTEGER NOT NULL,
              completed INTEGER NOT NULL DEFAULT 0,
              UNIQUE(template_id, week),
              FOREIGN KEY(template_id) REFERENCES templates(id) ON DELETE CASCADE
            );`,
          },
          {
            name: "days",
            sql: `CREATE TABLE IF NOT EXISTS days (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              template_id INTEGER NOT NULL,
              week INTEGER NOT NULL,
              day INTEGER NOT NULL,
              completed INTEGER NOT NULL DEFAULT 0,
              UNIQUE(template_id, week, day),
              FOREIGN KEY(template_id) REFERENCES templates(id) ON DELETE CASCADE
            );`,
          },
          {
            name: "exercises",
            sql: `CREATE TABLE IF NOT EXISTS exercises (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              template_id INTEGER NOT NULL,
              week INTEGER NOT NULL,
              day INTEGER NOT NULL,
              name TEXT,
              sets INTEGER,
              reps INTEGER,
              weight REAL,
              notes TEXT,
              FOREIGN KEY(template_id) REFERENCES templates(id) ON DELETE CASCADE
            );`,
          },
          {
            name: "exercise_sets",
            sql: `CREATE TABLE IF NOT EXISTS exercise_sets (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              exercise_id INTEGER NOT NULL,
              set_number INTEGER NOT NULL,
              reps INTEGER,
              weight REAL,
              FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
              UNIQUE(exercise_id, set_number)
            );`,
          },
        ];
        for (const { name, sql } of tables) {
          try {
            await db.runAsync(sql);
            log(`initDb: ensured table ${name}`);
          } catch (e) {
            warn(`initDb: create ${name} failed`, e);
          }
        }
      });

      // 2) Lightweight migrations
      log("initDb: starting migrations");
      try {
        // templates: ensure columns and index
        const tcolsRows = await db.getAllAsync("PRAGMA table_info(templates);");
        const tcols = tcolsRows.map((r) => r.name);
        log("initDb: templates columns:", tcols);
        if (!tcols.includes("name")) {
          try {
            await db.runAsync("ALTER TABLE templates ADD COLUMN name TEXT;");
          } catch (e) {
            warn("initDb: failed to add templates.name", e);
          }
        }
        if (!tcols.includes("weeks")) {
          try {
            await db.runAsync(
              "ALTER TABLE templates ADD COLUMN weeks INTEGER;"
            );
          } catch (e) {
            warn("initDb: failed to add templates.weeks", e);
          }
        }
        try {
          await db.runAsync(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_name ON templates(name);"
          );
        } catch (e) {
          warn("initDb: failed to ensure idx_templates_name", e);
        }
        try {
          await db.runAsync(`UPDATE templates
                       SET weeks = (
                         SELECT COALESCE(MAX(week), 0)
                           FROM weeks w
                          WHERE w.template_id = templates.id
                       )
                     WHERE weeks IS NULL OR weeks < 0;`);
        } catch (e) {
          warn("initDb: backfill weeks failed", e);
        }

        // weeks table existence
        try {
          await db.runAsync(`CREATE TABLE IF NOT EXISTS weeks (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  template_id INTEGER NOT NULL,
                  week INTEGER NOT NULL,
                  completed INTEGER NOT NULL DEFAULT 0,
                  UNIQUE(template_id, week),
                  FOREIGN KEY(template_id) REFERENCES templates(id) ON DELETE CASCADE
                );`);
          log("initDb: ensured weeks (migration)");
        } catch (e) {
          warn("initDb: ensure weeks (migration) failed", e);
        }

        // exercises columns
        const ecolsRows = await db.getAllAsync("PRAGMA table_info(exercises);");
        const ecols = ecolsRows.map((r) => r.name);
        log("initDb: exercises columns:", ecols);
        if (!ecols.includes("name")) {
          try {
            await db.runAsync("ALTER TABLE exercises ADD COLUMN name TEXT;");
          } catch (e) {
            warn("initDb: failed to add exercises.name", e);
          }
        }
        if (!ecols.includes("sets")) {
          try {
            await db.runAsync("ALTER TABLE exercises ADD COLUMN sets INTEGER;");
          } catch (e) {
            warn("initDb: failed to add exercises.sets", e);
          }
        }
        if (!ecols.includes("reps")) {
          try {
            await db.runAsync("ALTER TABLE exercises ADD COLUMN reps INTEGER;");
          } catch (e) {
            warn("initDb: failed to add exercises.reps", e);
          }
        }
        if (!ecols.includes("weight")) {
          try {
            await db.runAsync("ALTER TABLE exercises ADD COLUMN weight REAL;");
          } catch (e) {
            warn("initDb: failed to add exercises.weight", e);
          }
        }
        if (!ecols.includes("notes")) {
          try {
            await db.runAsync("ALTER TABLE exercises ADD COLUMN notes TEXT;");
          } catch (e) {
            warn("initDb: failed to add exercises.notes", e);
          }
        }

        // days column
        const dcolsRows = await db.getAllAsync("PRAGMA table_info(days);");
        const dcols = dcolsRows.map((r) => r.name);
        log("initDb: days columns:", dcols);
        if (!dcols.includes("completed")) {
          try {
            await db.runAsync(
              "ALTER TABLE days ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;"
            );
          } catch (e) {
            warn("initDb: failed to add days.completed", e);
          }
        }

        // exercise_sets table migration (ensure exists)
        try {
          await db.runAsync(`CREATE TABLE IF NOT EXISTS exercise_sets (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              exercise_id INTEGER NOT NULL,
              set_number INTEGER NOT NULL,
              reps INTEGER,
              weight REAL,
              FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
              UNIQUE(exercise_id, set_number)
            );`);
          log("initDb: ensured exercise_sets (migration)");
        } catch (e) {
          warn("initDb: ensure exercise_sets failed", e);
        }
      } catch (err) {
        warn("initDb: migration phase had errors", err);
      }

      log("initDb: ready");
    })();
  }
  return dbReadyPromise;
}

export function waitForDbReady() {
  return initDb();
}

// Kick off initialization early on module load
initDb();

// Template CRUD
export async function createTemplate(name, weeks) {
  await initDb();
  const trimmed = name.trim();
  log("createTemplate: attempting", { name: trimmed, weeks });
  const existing = await queryFirst(
    "SELECT id FROM templates WHERE name = ? LIMIT 1;",
    [trimmed]
  ).catch((e) => {
    warn("createTemplate: pre-check query error (continuing)", e);
    return null;
  });
  if (existing) {
    warn("createTemplate: duplicate name blocked", { name: trimmed });
    throw new Error("Template name must be unique.");
  }
  try {
    const res = await exec(
      "INSERT INTO templates (name, weeks) VALUES (?, ?);",
      [trimmed, weeks]
    );
    log("createTemplate: inserted", res?.lastInsertRowId);
    return res?.lastInsertRowId;
  } catch (err) {
    warn("createTemplate: insert failed", err);
    throw new Error("Template name must be unique.");
  }
}

export async function getTemplates() {
  await initDb();
  return queryAll("SELECT id, name, weeks FROM templates ORDER BY id DESC;");
}

export async function deleteTemplate(id) {
  await initDb();
  await exec("DELETE FROM templates WHERE id = ?;", [id]);
}

// Ensure all 7 days rows exist for a week when viewing it
export async function ensureWeekDays(templateId, weekNumber) {
  await initDb();
  log("ensureWeekDays: seeding", { templateId, weekNumber });
  const stmts = [
    [
      "INSERT OR IGNORE INTO weeks (template_id, week, completed) VALUES (?, ?, 0);",
      [templateId, weekNumber],
    ],
    ...Array.from({ length: 7 }, (_, i) => [
      "INSERT OR IGNORE INTO days (template_id, week, day) VALUES (?, ?, ?);",
      [templateId, weekNumber, i + 1],
    ]),
  ];
  await execBatch(stmts);
  log("ensureWeekDays: done", { templateId, weekNumber });
}

export async function listWeeks(templateId) {
  await initDb();
  const sql = `WITH t AS (
                 SELECT COALESCE(weeks, 0) AS weeks FROM templates WHERE id = ?
               ),
               maxw AS (
                 SELECT COALESCE(MAX(week), 0) AS mw FROM weeks WHERE template_id = ?
               ),
               w AS (
                 SELECT CASE WHEN t.weeks IS NULL OR t.weeks < 1 THEN maxw.mw ELSE t.weeks END AS total_weeks
                   FROM t LEFT JOIN maxw
               ),
               seq(week) AS (
                 SELECT 1 WHERE (SELECT total_weeks FROM w) > 0
                 UNION ALL
                 SELECT week + 1 FROM seq WHERE week < (SELECT total_weeks FROM w)
               )
             SELECT s.week AS week,
                    COALESCE(wk.completed, 0) AS weekCompleted,
                    COALESCE((SELECT COUNT(1) FROM days d WHERE d.template_id = ? AND d.week = s.week AND d.completed = 1), 0) AS daysCompleted
               FROM seq s
               LEFT JOIN weeks wk ON wk.template_id = ? AND wk.week = s.week
               ORDER BY s.week ASC;`;
  log("listWeeks: start", { templateId });
  const rows = await queryAll(sql, [
    templateId,
    templateId,
    templateId,
    templateId,
  ]);
  log("listWeeks: rows", rows.length);
  return rows;
}

export async function getExercises(templateId, week, day) {
  await initDb();
  const sql = `SELECT e.id, e.template_id, e.week, e.day, e.name, e.sets, e.reps, e.weight, e.notes,
                      COALESCE((SELECT SUM(COALESCE(es.reps,0)*COALESCE(es.weight,0)) FROM exercise_sets es WHERE es.exercise_id = e.id),
                               (COALESCE(e.sets,0) * COALESCE(e.reps,0) * COALESCE(e.weight,0))) AS volume
                 FROM exercises e
                WHERE e.template_id = ? AND e.week = ? AND e.day = ?
                ORDER BY e.id ASC;`;
  log("getExercises: start", { templateId, week, day });
  const exercises = await queryAll(sql, [templateId, week, day]);
  if (!exercises.length) return [];
  // Fetch set rows for all exercises in one query
  const ids = exercises.map((e) => e.id);
  const placeholders = ids.map(() => "?").join(",");
  let setRows = [];
  try {
    setRows = await queryAll(
      `SELECT exercise_id, set_number, reps, weight FROM exercise_sets WHERE exercise_id IN (${placeholders}) ORDER BY exercise_id, set_number ASC;`,
      ids
    );
  } catch (e) {
    // table might not exist yet (very early), ignore
    setRows = [];
  }
  const byExercise = new Map();
  for (const r of setRows) {
    if (!byExercise.has(r.exercise_id)) byExercise.set(r.exercise_id, []);
    byExercise.get(r.exercise_id).push({
      setNumber: r.set_number,
      reps: r.reps,
      weight: r.weight,
    });
  }
  for (const ex of exercises) {
    const rows = byExercise.get(ex.id) || [];
    if (rows.length) {
      ex.setRows = rows;
      continue;
    }
    // Backfill synthetic rows from legacy aggregate columns if present
    if ((ex.sets || 0) > 0 && (ex.reps || ex.weight)) {
      const count = ex.sets || 0;
      const syn = [];
      for (let i = 1; i <= count; i++) {
        syn.push({
          setNumber: i,
          reps: ex.reps ?? null,
          weight: ex.weight ?? null,
        });
      }
      ex.setRows = syn;
    } else {
      ex.setRows = [];
    }
  }
  log("getExercises: rows", exercises.length);
  return exercises;
}

export async function addExercise({
  templateId,
  week,
  day,
  name,
  sets,
  reps,
  weight,
  notes,
  initialSetRows, // optional array [{reps, weight}] inserted as rows overriding aggregate
}) {
  await initDb();
  log("addExercise: inserting", { templateId, week, day, name });
  const res = await exec(
    "INSERT INTO exercises (template_id, week, day, name, sets, reps, weight, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
    [
      templateId,
      week,
      day,
      name.trim(),
      sets ?? null,
      reps ?? null,
      weight ?? null,
      notes ?? null,
    ]
  );
  log("addExercise: inserted", res?.lastInsertRowId);
  const exerciseId = res?.lastInsertRowId;
  if (exerciseId && Array.isArray(initialSetRows) && initialSetRows.length) {
    const stmts = [];
    initialSetRows.forEach((row, idx) => {
      stmts.push([
        "INSERT INTO exercise_sets (exercise_id, set_number, reps, weight) VALUES (?, ?, ?, ?);",
        [
          exerciseId,
          idx + 1,
          row.reps !== "" && row.reps != null ? Number(row.reps) : null,
          row.weight !== "" && row.weight != null ? Number(row.weight) : null,
        ],
      ]);
    });
    try {
      await execBatch(stmts);
    } catch (e) {
      warn("addExercise: failed to insert initial set rows", e);
    }
  }
  return res?.lastInsertRowId;
}

export async function deleteExercise(id) {
  await initDb();
  log("deleteExercise: deleting", { id });
  await exec("DELETE FROM exercises WHERE id = ?;", [id]);
  log("deleteExercise: done", { id });
}

// Day completion helpers
export async function getDayCompleted(templateId, week, day) {
  await initDb();
  const row = await queryFirst(
    "SELECT completed FROM days WHERE template_id = ? AND week = ? AND day = ?;",
    [templateId, week, day]
  );
  const completed = !!row?.completed;
  log("getDayCompleted: result", { templateId, week, day, completed });
  return completed;
}

export async function setDayCompleted(templateId, week, day, completed) {
  await initDb();
  const db = await getDb();
  log("setDayCompleted: updating", { templateId, week, day, completed });
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE days SET completed = ? WHERE template_id = ? AND week = ? AND day = ?;",
      [completed ? 1 : 0, templateId, week, day]
    );
    const rows = await db.getAllAsync(
      `SELECT COUNT(1) AS done FROM days WHERE template_id = ? AND week = ? AND completed = 1;`,
      [templateId, week]
    );
    const done = rows?.[0]?.done || 0;
    if (done === 7) {
      log("setDayCompleted: all 7 days complete, marking week", {
        templateId,
        week,
      });
      await db.runAsync(
        "INSERT OR IGNORE INTO weeks (template_id, week, completed) VALUES (?, ?, 0);",
        [templateId, week]
      );
      await db.runAsync(
        "UPDATE weeks SET completed = 1 WHERE template_id = ? AND week = ?;",
        [templateId, week]
      );
    }
  });
  log("setDayCompleted: done", { templateId, week, day, completed });
}

// Week completion helpers
export async function getWeekStatus(templateId, week) {
  await initDb();
  const sql = `SELECT COALESCE(w.completed, 0) AS completed,
                (SELECT COUNT(1) FROM days d WHERE d.template_id = ? AND d.week = ? AND d.completed = 1) AS daysCompleted
           FROM (SELECT 1) x
      LEFT JOIN weeks w ON w.template_id = ? AND w.week = ?;`;
  const r = await queryFirst(sql, [templateId, week, templateId, week]);
  const result = {
    completed: !!(r?.completed || 0),
    daysCompleted: r?.daysCompleted || 0,
  };
  log("getWeekStatus: result", { templateId, week, ...result });
  return result;
}

export async function setWeekStatus(templateId, week, completed) {
  await initDb();
  log("setWeekStatus: updating", { templateId, week, completed });
  await execBatch([
    [
      "INSERT OR IGNORE INTO weeks (template_id, week, completed) VALUES (?, ?, 0);",
      [templateId, week],
    ],
    [
      "UPDATE weeks SET completed = ? WHERE template_id = ? AND week = ?;",
      [completed ? 1 : 0, templateId, week],
    ],
  ]);
  log("setWeekStatus: done", { templateId, week, completed });
}

export async function updateExercise({ id, name, sets, reps, weight, notes }) {
  await initDb();
  const sql = `UPDATE exercises
            SET name = ?,
                sets = ?,
                reps = ?,
                weight = ?,
                notes = ?
          WHERE id = ?;`;
  const params = [
    name?.trim() || null,
    sets ?? null,
    reps ?? null,
    weight ?? null,
    notes ?? null,
    id,
  ];
  log("updateExercise: updating", { id, name });
  const r = await exec(sql, params);
  log("updateExercise: changes", r?.changes ?? 0);
  return r?.changes ?? 0;
}

// New helper to update exercise along with its dynamic set rows
export async function updateExerciseWithSets({ id, name, notes, setRows }) {
  await initDb();
  const db = await getDb();
  const cleaned = Array.isArray(setRows)
    ? setRows
        .map((r, idx) => ({
          setNumber: idx + 1,
          reps: r.reps === "" || r.reps == null ? null : Number(r.reps),
          weight: r.weight === "" || r.weight == null ? null : Number(r.weight),
        }))
        .filter((r) => r.reps != null || r.weight != null)
    : [];
  const aggSets = cleaned.length || null;
  const aggReps = cleaned.length ? cleaned[0].reps ?? null : null;
  const aggWeight = cleaned.length ? cleaned[0].weight ?? null : null;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE exercises SET name = ?, notes = ?, sets = ?, reps = ?, weight = ? WHERE id = ?;`,
      [name?.trim() || null, notes ?? null, aggSets, aggReps, aggWeight, id]
    );
    await db.runAsync("DELETE FROM exercise_sets WHERE exercise_id = ?;", [id]);
    for (const r of cleaned) {
      await db.runAsync(
        "INSERT INTO exercise_sets (exercise_id, set_number, reps, weight) VALUES (?, ?, ?, ?);",
        [id, r.setNumber, r.reps, r.weight]
      );
    }
  });
  log("updateExerciseWithSets: updated", { id, rows: cleaned.length });
  return cleaned.length;
}

// Danger: Reset DB by dropping all tables and re-initializing schema
export function resetDb() {
  return (async () => {
    log("resetDb: begin");
    try {
      await exec("PRAGMA foreign_keys = OFF;");
      log("resetDb: foreign_keys OFF");
    } catch (e) {
      warn("resetDb: could not disable foreign_keys (continuing)", e);
    }

    // Drop objects individually; ignore failures
    const drop = async (sql) => {
      try {
        await exec(sql);
        log(`resetDb: executed -> ${sql}`);
      } catch (e) {
        warn("resetDb: drop failed (continuing)", { sql, e });
      }
    };

    await drop("DROP INDEX IF EXISTS idx_templates_name;");
    await drop("DROP TABLE IF EXISTS exercises;");
    await drop("DROP TABLE IF EXISTS days;");
    await drop("DROP TABLE IF EXISTS weeks;");
    await drop("DROP TABLE IF EXISTS templates;");

    try {
      await exec(
        "DELETE FROM sqlite_sequence WHERE name IN ('exercises','days','weeks','templates');"
      );
      log("resetDb: cleared sqlite_sequence");
    } catch (e) {
      // sqlite_sequence may not exist; ignore
    }

    try {
      await exec("PRAGMA foreign_keys = ON;");
      log("resetDb: foreign_keys ON");
    } catch (e) {
      warn("resetDb: could not enable foreign_keys", e);
    }

    // Re-init schema fresh
    dbReadyPromise = null;
    log("resetDb: re-initializing schema");
    await initDb();
    log("resetDb: done");

    // Optional verification
    try {
      const tables = await queryAll(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('templates','weeks','days','exercises');"
      );
      log("resetDb: tables present:", tables);
    } catch {}

    return;
  })();
}

// Copy all exercises (names only) from a source week to one or more destination weeks
export async function copyWeekExercises(
  templateId,
  sourceWeek,
  destWeeks = []
) {
  if (!Array.isArray(destWeeks) || destWeeks.length === 0) return;
  await initDb();
  const db = await getDb();
  log("copyWeekExercises: begin", { templateId, sourceWeek, destWeeks });
  await db.withTransactionAsync(async () => {
    for (const dw of destWeeks) {
      if (dw === sourceWeek) continue;
      await db.runAsync(
        "INSERT OR IGNORE INTO weeks (template_id, week, completed) VALUES (?, ?, 0);",
        [templateId, dw]
      );
      for (let d = 1; d <= 7; d++) {
        await db.runAsync(
          "INSERT OR IGNORE INTO days (template_id, week, day, completed) VALUES (?, ?, ?, 0);",
          [templateId, dw, d]
        );
      }
      // remove existing dest exercises
      const existing = await db.getAllAsync(
        "SELECT id FROM exercises WHERE template_id = ? AND week = ?;",
        [templateId, dw]
      );
      for (const ex of existing) {
        await db.runAsync("DELETE FROM exercises WHERE id = ?;", [ex.id]);
      }
      // fetch source exercises with sets
      const srcExercises = await db.getAllAsync(
        "SELECT id, day, name, notes FROM exercises WHERE template_id = ? AND week = ? ORDER BY id ASC;",
        [templateId, sourceWeek]
      );
      for (const se of srcExercises) {
        const ins = await db.runAsync(
          "INSERT INTO exercises (template_id, week, day, name, sets, reps, weight, notes) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?);",
          [templateId, dw, se.day, se.name, se.notes]
        );
        const newId = ins?.lastInsertRowId;
        if (newId) {
          const setRows = await db.getAllAsync(
            "SELECT set_number, reps, weight FROM exercise_sets WHERE exercise_id = ? ORDER BY set_number ASC;",
            [se.id]
          );
          for (const r of setRows) {
            await db.runAsync(
              "INSERT INTO exercise_sets (exercise_id, set_number, reps, weight) VALUES (?, ?, ?, ?);",
              [newId, r.set_number, r.reps, r.weight]
            );
          }
        }
      }
    }
  });
  log("copyWeekExercises: done", { templateId, sourceWeek, destWeeks });
}

// -------- Import/Export (JSON) --------
const EXPORT_FORMAT = "traintrack.v1";

async function getTemplateDeep(templateId) {
  await initDb();
  const t = await queryFirst(
    "SELECT id, name, weeks FROM templates WHERE id = ?;",
    [templateId]
  );
  if (!t) return null;
  const weeks = await queryAll(
    "SELECT week, completed FROM weeks WHERE template_id = ? ORDER BY week ASC;",
    [templateId]
  );
  const days = await queryAll(
    "SELECT week, day, completed FROM days WHERE template_id = ? ORDER BY week ASC, day ASC;",
    [templateId]
  );
  const exercises = await queryAll(
    `SELECT week, day, name, sets, reps, weight, notes
       FROM exercises
      WHERE template_id = ?
      ORDER BY week ASC, day ASC, id ASC;`,
    [templateId]
  );
  let exerciseSetRows = [];
  try {
    const ids = exercises.map((e, idx) => idx); // placeholder if needed
    exerciseSetRows = await queryAll(
      `SELECT e.week, e.day, e.name, es.exercise_id, es.set_number, es.reps, es.weight
         FROM exercise_sets es
         JOIN exercises e ON e.id = es.exercise_id
        WHERE e.template_id = ?
        ORDER BY e.week ASC, e.day ASC, e.id ASC, es.set_number ASC;`,
      [templateId]
    );
  } catch (e) {
    exerciseSetRows = [];
  }
  const byExerciseId = new Map();
  for (const row of exerciseSetRows) {
    if (!byExerciseId.has(row.exercise_id))
      byExerciseId.set(row.exercise_id, []);
    byExerciseId.get(row.exercise_id).push({
      n: row.set_number,
      reps: row.reps,
      weight: row.weight,
    });
  }
  // We cannot directly correlate without including exercise id in exported base row; adjust below.
  // Re-query including id for mapping
  const exercisesFull = await queryAll(
    `SELECT id, week, day, name, sets, reps, weight, notes FROM exercises WHERE template_id = ? ORDER BY week ASC, day ASC, id ASC;`,
    [templateId]
  );
  const exportExercises = exercisesFull.map((e) => ({
    week: e.week,
    day: e.day,
    name: e.name,
    sets: e.sets,
    reps: e.reps,
    weight: e.weight,
    notes: e.notes,
    setRows: byExerciseId.get(e.id) || [],
  }));
  return {
    id: t.id,
    name: t.name,
    weeks: t.weeks,
    weeksTable: weeks,
    days,
    exercises: exportExercises,
  };
}

export async function exportTemplatesJson(templateIds = null) {
  await initDb();
  let ids = templateIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    const all = await getTemplates();
    ids = all.map((t) => t.id);
  }
  const templates = [];
  for (const id of ids) {
    const obj = await getTemplateDeep(id);
    if (!obj) continue;
    templates.push({
      name: obj.name,
      weeks: obj.weeks,
      weeksTable: obj.weeksTable || [],
      days: obj.days || [],
      exercises: obj.exercises || [],
    });
  }
  return {
    type: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    templates,
  };
}

// Import a single template object (from export) under a specific unique name
export async function importTemplateObjectWithName(tpl, newName) {
  await initDb();
  const db = await getDb();
  const name = (newName || "").trim();
  if (!name) throw new Error("Template name required");

  // Check uniqueness
  const exists = await queryFirst(
    "SELECT id FROM templates WHERE name = ? LIMIT 1;",
    [name]
  );
  if (exists) throw new Error("Template name must be unique.");

  const toNullableNumber = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const arrMax = (arr, key) => {
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    return arr.reduce((m, it) => {
      const v = Number(it?.[key] ?? 0);
      return Number.isFinite(v) ? Math.max(m, v) : m;
    }, 0);
  };

  const sourceWeeks = Number.isFinite(Number(tpl?.weeks))
    ? Number(tpl.weeks)
    : 0;
  const maxWeek = Math.max(
    sourceWeeks,
    arrMax(tpl?.weeksTable, "week"),
    arrMax(tpl?.days, "week"),
    arrMax(tpl?.exercises, "week")
  );
  const weeksCount = maxWeek > 0 ? maxWeek : sourceWeeks || 0;

  let info = null;
  await db.withTransactionAsync(async () => {
    // Create template
    const ins = await db.runAsync(
      "INSERT INTO templates (name, weeks) VALUES (?, ?);",
      [name, weeksCount || null]
    );
    const templateId = ins?.lastInsertRowId;

    // Seed weeks + days
    const weekCompletedMap = new Map();
    if (Array.isArray(tpl?.weeksTable)) {
      for (const w of tpl.weeksTable) {
        const wk = Number(w?.week);
        if (Number.isFinite(wk)) {
          weekCompletedMap.set(wk, w?.completed ? 1 : 0);
        }
      }
    }

    const totalWeeks = weeksCount > 0 ? weeksCount : 0;
    for (let w = 1; w <= totalWeeks; w++) {
      const completed = weekCompletedMap.has(w) ? weekCompletedMap.get(w) : 0;
      await db.runAsync(
        "INSERT OR IGNORE INTO weeks (template_id, week, completed) VALUES (?, ?, ?);",
        [templateId, w, completed]
      );
      if (weekCompletedMap.has(w)) {
        await db.runAsync(
          "UPDATE weeks SET completed = ? WHERE template_id = ? AND week = ?;",
          [completed, templateId, w]
        );
      }
      // Seed days 1..7
      for (let d = 1; d <= 7; d++) {
        await db.runAsync(
          "INSERT OR IGNORE INTO days (template_id, week, day, completed) VALUES (?, ?, ?, 0);",
          [templateId, w, d]
        );
      }
    }

    // Apply day completion states from source
    if (Array.isArray(tpl?.days)) {
      for (const d of tpl.days) {
        const wk = Number(d?.week);
        const dy = Number(d?.day);
        if (!Number.isFinite(wk) || !Number.isFinite(dy)) continue;
        const completed = d?.completed ? 1 : 0;
        await db.runAsync(
          "UPDATE days SET completed = ? WHERE template_id = ? AND week = ? AND day = ?;",
          [completed, templateId, wk, dy]
        );
      }
    }

    // Insert exercises
    if (Array.isArray(tpl?.exercises)) {
      for (const ex of tpl.exercises) {
        const wk = Number(ex?.week);
        const dy = Number(ex?.day);
        if (!Number.isFinite(wk) || !Number.isFinite(dy)) continue;
        const ins = await db.runAsync(
          "INSERT INTO exercises (template_id, week, day, name, sets, reps, weight, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
          [
            templateId,
            wk,
            dy,
            (ex?.name || "").trim(),
            toNullableNumber(ex?.sets),
            toNullableNumber(ex?.reps),
            toNullableNumber(ex?.weight),
            ex?.notes ?? null,
          ]
        );
        const exId = ins?.lastInsertRowId;
        if (exId && Array.isArray(ex?.setRows) && ex.setRows.length) {
          for (let i = 0; i < ex.setRows.length; i++) {
            const row = ex.setRows[i];
            const sn = Number(row?.n || row?.setNumber || i + 1);
            const reps = toNullableNumber(row?.reps);
            const weight = toNullableNumber(row?.weight);
            await db.runAsync(
              "INSERT OR IGNORE INTO exercise_sets (exercise_id, set_number, reps, weight) VALUES (?, ?, ?, ?);",
              [exId, sn, reps, weight]
            );
          }
        }
      }
    }

    info = { id: templateId, name, weeks: weeksCount };
  });

  return info;
}
