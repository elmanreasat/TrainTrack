// Data layer using expo-sqlite legacy API
import * as SQLite from "expo-sqlite/legacy";

// Simple console logs (always on)
const log = (...args) => console.log("[DB]", ...args);
const warn = (...args) => console.warn("[DB]", ...args);

const db = SQLite.openDatabase("workouts.db");

// A promise that resolves when the DB schema is initialized and migrations are applied
let dbReadyPromise = null;

// Small helpers to reduce boilerplate
const queryAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.readTransaction((tx) => {
      tx.executeSql(
        sql,
        params,
        (_, { rows }) => resolve(rows._array),
        (_, err) => {
          reject(err);
          return true;
        }
      );
    });
  });

const queryFirst = (sql, params = []) =>
  queryAll(sql, params).then((a) => a[0] || null);

const exec = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        sql,
        params,
        (_, res) => resolve(res),
        (_, err) => {
          reject(err);
          return true;
        }
      );
    });
  });

// Execute a list of statements in a single transaction
const execBatch = (stmts) =>
  new Promise((resolve, reject) => {
    db.transaction(
      (tx) => {
        for (const [sql, params = []] of stmts) tx.executeSql(sql, params);
      },
      (err) => reject(err),
      () => resolve()
    );
  });

export function initDb() {
  if (!dbReadyPromise) {
    dbReadyPromise = new Promise((resolve, reject) => {
      log("initDb: start");
      // 1) Ensure base tables exist
      db.transaction(
        (tx) => {
          // Ensure cascading deletes are honored
          tx.executeSql(
            "PRAGMA foreign_keys = ON;",
            [],
            () => log("initDb: PRAGMA foreign_keys=ON applied"),
            (t, e) => {
              warn("initDb: failed to enable foreign_keys", e);
              return true;
            }
          );
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
          ];
          tables.forEach(({ name, sql }) => {
            tx.executeSql(
              sql,
              [],
              () => log(`initDb: ensured table ${name}`),
              (t, e) => {
                warn(`initDb: create ${name} failed`, e);
                return false;
              }
            );
          });
        },
        // If the base schema creation fails, reject and clear the cached promise
        (err) => {
          dbReadyPromise = null;
          warn("initDb: base schema creation failed", err);
          reject(err);
        },
        () => {
          // 2) Lightweight migrations: add any missing required columns and indexes
          log("initDb: starting migrations");
          db.transaction(
            (tx) => {
              // templates must have name (unique) and weeks
              tx.executeSql(
                "PRAGMA table_info(templates);",
                [],
                (_, { rows }) => {
                  const cols = rows._array.map((r) => r.name);
                  log("initDb: templates columns:", cols);
                  if (!cols.includes("name")) {
                    tx.executeSql(
                      "ALTER TABLE templates ADD COLUMN name TEXT;",
                      [],
                      () => log("initDb: added templates.name column"),
                      (t, e) => {
                        warn("initDb: failed to add templates.name", e);
                        return true;
                      }
                    );
                  }
                  if (!cols.includes("weeks")) {
                    tx.executeSql(
                      "ALTER TABLE templates ADD COLUMN weeks INTEGER;",
                      [],
                      () => log("initDb: added templates.weeks column"),
                      (t, e) => {
                        warn("initDb: failed to add templates.weeks", e);
                        return true;
                      }
                    );
                  }
                  // enforce uniqueness via index (works even if column added later)
                  tx.executeSql(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_name ON templates(name);",
                    [],
                    () =>
                      log("initDb: ensured idx_templates_name unique index"),
                    (t, e) => {
                      warn("initDb: failed to ensure idx_templates_name", e);
                      return true; // continue
                    }
                  );
                  // Backfill missing/invalid weeks from existing weeks table
                  tx.executeSql(
                    `UPDATE templates
                       SET weeks = (
                         SELECT COALESCE(MAX(week), 0)
                           FROM weeks w
                          WHERE w.template_id = templates.id
                       )
                     WHERE weeks IS NULL OR weeks < 0;`,
                    [],
                    () =>
                      log(
                        "initDb: backfilled templates.weeks where null/invalid"
                      ),
                    (t, e) => {
                      warn("initDb: backfill weeks failed", e);
                      return true;
                    }
                  );
                }
              );

              // weeks table may need to be created if older DB
              tx.executeSql(
                `CREATE TABLE IF NOT EXISTS weeks (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  template_id INTEGER NOT NULL,
                  week INTEGER NOT NULL,
                  completed INTEGER NOT NULL DEFAULT 0,
                  UNIQUE(template_id, week),
                  FOREIGN KEY(template_id) REFERENCES templates(id) ON DELETE CASCADE
                );`,
                [],
                () => log("initDb: ensured weeks (migration)"),
                (t, e) => {
                  warn("initDb: ensure weeks (migration) failed", e);
                  return true;
                }
              );

              // exercises must have name, sets, reps, weight, notes
              tx.executeSql(
                "PRAGMA table_info(exercises);",
                [],
                (_, { rows }) => {
                  const cols = rows._array.map((r) => r.name);
                  log("initDb: exercises columns:", cols);
                  if (!cols.includes("name"))
                    tx.executeSql(
                      "ALTER TABLE exercises ADD COLUMN name TEXT;",
                      [],
                      () => log("initDb: added exercises.name"),
                      (t, e) => {
                        warn("initDb: failed to add exercises.name", e);
                        return true;
                      }
                    );
                  if (!cols.includes("sets"))
                    tx.executeSql(
                      "ALTER TABLE exercises ADD COLUMN sets INTEGER;",
                      [],
                      () => log("initDb: added exercises.sets"),
                      (t, e) => {
                        warn("initDb: failed to add exercises.sets", e);
                        return true;
                      }
                    );
                  if (!cols.includes("reps"))
                    tx.executeSql(
                      "ALTER TABLE exercises ADD COLUMN reps INTEGER;",
                      [],
                      () => log("initDb: added exercises.reps"),
                      (t, e) => {
                        warn("initDb: failed to add exercises.reps", e);
                        return true;
                      }
                    );
                  if (!cols.includes("weight"))
                    tx.executeSql(
                      "ALTER TABLE exercises ADD COLUMN weight REAL;",
                      [],
                      () => log("initDb: added exercises.weight"),
                      (t, e) => {
                        warn("initDb: failed to add exercises.weight", e);
                        return true;
                      }
                    );
                  if (!cols.includes("notes"))
                    tx.executeSql(
                      "ALTER TABLE exercises ADD COLUMN notes TEXT;",
                      [],
                      () => log("initDb: added exercises.notes"),
                      (t, e) => {
                        warn("initDb: failed to add exercises.notes", e);
                        return true;
                      }
                    );
                }
              );

              // days may need a completed column
              tx.executeSql("PRAGMA table_info(days);", [], (_, { rows }) => {
                const cols = rows._array.map((r) => r.name);
                log("initDb: days columns:", cols);
                if (!cols.includes("completed"))
                  tx.executeSql(
                    "ALTER TABLE days ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;",
                    [],
                    () => log("initDb: added days.completed"),
                    (t, e) => {
                      warn("initDb: failed to add days.completed", e);
                      return true;
                    }
                  );
              });
            },
            // If a migration step fails, still resolve because base schema exists
            (err) => {
              warn("initDb: migration phase had errors", err);
              resolve();
            },
            () => {
              log("initDb: ready");
              resolve();
            }
          );
        }
      );
    });
  }
  return dbReadyPromise;
}

export function waitForDbReady() {
  return initDb();
}

// Kick off initialization early on module load (best-effort, errors handled by callers awaiting initDb)
// This helps avoid races when a caller forgets to await initDb explicitly.
initDb();

// Template CRUD
export function createTemplate(name, weeks) {
  return initDb().then(async () => {
    const trimmed = name.trim();
    log("createTemplate: attempting", { name: trimmed, weeks });
    // Pre-check for uniqueness without throwing on query errors
    const existing = await queryFirst(
      "SELECT id FROM templates WHERE name = ? LIMIT 1;",
      [trimmed]
    ).catch((e) => {
      // If the pre-check query fails (older DB), continue and let the DB enforce uniqueness
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
      log("createTemplate: inserted", res?.insertId);
      return res?.insertId;
    } catch (err) {
      warn("createTemplate: insert failed", err);
      throw new Error("Template name must be unique.");
    }
  });
}

export function getTemplates() {
  return initDb().then(() =>
    queryAll("SELECT id, name, weeks FROM templates ORDER BY id DESC;")
  );
}

export function deleteTemplate(id) {
  return initDb().then(() =>
    exec("DELETE FROM templates WHERE id = ?;", [id]).then(() => {})
  );
}

// Ensure all 7 days rows exist for a week when viewing it
export function ensureWeekDays(templateId, weekNumber) {
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
  return initDb().then(() => {
    log("ensureWeekDays: seeding", { templateId, weekNumber });
    return execBatch(stmts).then(() => {
      log("ensureWeekDays: done", { templateId, weekNumber });
    });
  });
}

export function listWeeks(templateId) {
  // Return progress per week: week number, daysCompleted, weekCompleted
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
  return initDb().then(() => {
    log("listWeeks: start", { templateId });
    return queryAll(sql, [templateId, templateId, templateId, templateId]).then(
      (rows) => {
        log("listWeeks: rows", rows.length);
        return rows;
      }
    );
  });
}

export function getExercises(templateId, week, day) {
  const sql = `SELECT id, template_id, week, day, name, sets, reps, weight, notes,
                      (COALESCE(sets,0) * COALESCE(reps,0) * COALESCE(weight,0)) AS volume
                 FROM exercises
                WHERE template_id = ? AND week = ? AND day = ?
                ORDER BY id ASC;`;
  return initDb().then(() => {
    log("getExercises: start", { templateId, week, day });
    return queryAll(sql, [templateId, week, day]).then((rows) => {
      log("getExercises: rows", rows.length);
      return rows;
    });
  });
}

export function addExercise({
  templateId,
  week,
  day,
  name,
  sets,
  reps,
  weight,
  notes,
}) {
  return initDb().then(async () => {
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
    log("addExercise: inserted", res?.insertId);
    return res?.insertId;
  });
}

export function deleteExercise(id) {
  return initDb().then(() => {
    log("deleteExercise: deleting", { id });
    return exec("DELETE FROM exercises WHERE id = ?;", [id]).then(() => {
      log("deleteExercise: done", { id });
    });
  });
}

// Day completion helpers
export function getDayCompleted(templateId, week, day) {
  return initDb().then(() =>
    queryFirst(
      "SELECT completed FROM days WHERE template_id = ? AND week = ? AND day = ?;",
      [templateId, week, day]
    ).then((row) => {
      const completed = !!row?.completed;
      log("getDayCompleted: result", { templateId, week, day, completed });
      return completed;
    })
  );
}

export function setDayCompleted(templateId, week, day, completed) {
  return initDb().then(
    () =>
      new Promise((resolve, reject) => {
        log("setDayCompleted: updating", { templateId, week, day, completed });
        db.transaction(
          (tx) => {
            tx.executeSql(
              "UPDATE days SET completed = ? WHERE template_id = ? AND week = ? AND day = ?;",
              [completed ? 1 : 0, templateId, week, day]
            );
            // If all 7 days completed, auto-mark the week complete
            tx.executeSql(
              `SELECT COUNT(1) AS done FROM days WHERE template_id = ? AND week = ? AND completed = 1;`,
              [templateId, week],
              (_, { rows }) => {
                const done = rows._array[0]?.done || 0;
                if (done === 7) {
                  log("setDayCompleted: all 7 days complete, marking week", {
                    templateId,
                    week,
                  });
                  tx.executeSql(
                    "INSERT OR IGNORE INTO weeks (template_id, week, completed) VALUES (?, ?, 0);",
                    [templateId, week]
                  );
                  tx.executeSql(
                    "UPDATE weeks SET completed = 1 WHERE template_id = ? AND week = ?;",
                    [templateId, week]
                  );
                }
              }
            );
          },
          (err) => {
            reject(err);
          },
          () => {
            log("setDayCompleted: done", { templateId, week, day, completed });
            resolve();
          }
        );
      })
  );
}

// Week completion helpers
export function getWeekStatus(templateId, week) {
  const sql = `SELECT COALESCE(w.completed, 0) AS completed,
                (SELECT COUNT(1) FROM days d WHERE d.template_id = ? AND d.week = ? AND d.completed = 1) AS daysCompleted
           FROM (SELECT 1) x
      LEFT JOIN weeks w ON w.template_id = ? AND w.week = ?;`;
  return initDb().then(() =>
    queryFirst(sql, [templateId, week, templateId, week]).then((r) => {
      const result = {
        completed: !!(r?.completed || 0),
        daysCompleted: r?.daysCompleted || 0,
      };
      log("getWeekStatus: result", { templateId, week, ...result });
      return result;
    })
  );
}

export function setWeekStatus(templateId, week, completed) {
  return initDb().then(() => {
    log("setWeekStatus: updating", { templateId, week, completed });
    return execBatch([
      [
        "INSERT OR IGNORE INTO weeks (template_id, week, completed) VALUES (?, ?, 0);",
        [templateId, week],
      ],
      [
        "UPDATE weeks SET completed = ? WHERE template_id = ? AND week = ?;",
        [completed ? 1 : 0, templateId, week],
      ],
    ]).then(() => log("setWeekStatus: done", { templateId, week, completed }));
  });
}

export function updateExercise({ id, name, sets, reps, weight, notes }) {
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
  return initDb().then(() => {
    log("updateExercise: updating", { id, name });
    return exec(sql, params).then((r) => {
      log("updateExercise: rowsAffected", r.rowsAffected ?? 0);
      return r.rowsAffected;
    });
  });
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

    // Drop objects individually; ignore failures to keep progress moving
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
// - Runs in a single transaction to avoid race conditions
// - Seeds destination weeks/days
// - Clears existing exercises in destination weeks before copying
export function copyWeekExercises(templateId, sourceWeek, destWeeks = []) {
  if (!Array.isArray(destWeeks) || destWeeks.length === 0)
    return Promise.resolve();
  return initDb().then(
    () =>
      new Promise((resolve, reject) => {
        log("copyWeekExercises: begin", { templateId, sourceWeek, destWeeks });
        db.transaction(
          (tx) => {
            for (const dw of destWeeks) {
              if (dw === sourceWeek) continue;
              // Ensure week row and 7 day rows
              tx.executeSql(
                "INSERT OR IGNORE INTO weeks (template_id, week, completed) VALUES (?, ?, 0);",
                [templateId, dw]
              );
              for (let d = 1; d <= 7; d++) {
                tx.executeSql(
                  "INSERT OR IGNORE INTO days (template_id, week, day, completed) VALUES (?, ?, ?, 0);",
                  [templateId, dw, d]
                );
              }
              // Clear any existing exercises in destination week
              tx.executeSql(
                "DELETE FROM exercises WHERE template_id = ? AND week = ?;",
                [templateId, dw]
              );
              // Copy names only for all days from source week to destination week
              tx.executeSql(
                `INSERT INTO exercises (template_id, week, day, name, sets, reps, weight, notes)
                   SELECT ?, ?, day, name, NULL, NULL, NULL, NULL
                     FROM exercises
                    WHERE template_id = ? AND week = ?;`,
                [templateId, dw, templateId, sourceWeek]
              );
            }
          },
          (err) => {
            warn("copyWeekExercises: failed", err);
            reject(err);
          },
          () => {
            log("copyWeekExercises: done", {
              templateId,
              sourceWeek,
              destWeeks,
            });
            resolve();
          }
        );
      })
  );
}
