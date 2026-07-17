import express from "express";
import cors from "cors";
import pg from "pg";

const { Pool } = pg;

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://crztrader.com,https://www.crztrader.com")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
let dbReady = false;
let dbError = "";

if (!DATABASE_URL) {
  console.warn("DATABASE_URL no configurado. La API arrancara, pero no podra guardar eventos.");
}

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
    })
  : null;

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origen no permitido por CRZ Analytics"));
    },
  }),
);

app.use(express.json({ limit: "64kb" }));
app.use(express.text({ type: "text/plain", limit: "64kb" }));

const parseBody = (body) => {
  if (typeof body === "string") {
    if (!body.trim()) {
      return {};
    }

    try {
      return JSON.parse(body);
    } catch (_error) {
      return { raw: body };
    }
  }

  return body || {};
};

const normalizeEvent = (raw) => ({
  event: String(raw.event || "unknown").slice(0, 80),
  visitorId: String(raw.visitorId || "anonymous").slice(0, 160),
  page: String(raw.page || "").slice(0, 240),
  url: String(raw.url || "").slice(0, 1000),
  referrer: String(raw.referrer || "").slice(0, 1000),
  userAgent: String(raw.userAgent || "").slice(0, 1000),
  language: String(raw.language || "").slice(0, 60),
  screen: String(raw.screen || "").slice(0, 60),
  videoId: raw.videoId ? String(raw.videoId).slice(0, 160) : null,
  videoTitle: raw.videoTitle ? String(raw.videoTitle).slice(0, 240) : null,
  feedback: raw.feedback ? String(raw.feedback).slice(0, 30) : null,
  progress: Number.isFinite(Number(raw.progress)) ? Number(raw.progress) : null,
  currentTime: Number.isFinite(Number(raw.currentTime)) ? Number(raw.currentTime) : null,
  duration: Number.isFinite(Number(raw.duration)) ? Number(raw.duration) : null,
  details: raw,
});

const runDbSetup = async () => {
  if (!pool) {
    return;
  }

  await pool.query(`
    create table if not exists analytics_events (
      id bigserial primary key,
      event text not null,
      visitor_id text not null,
      page text,
      url text,
      referrer text,
      user_agent text,
      language text,
      screen text,
      video_id text,
      video_title text,
      feedback text,
      progress integer,
      current_time integer,
      duration integer,
      details jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `);

  await pool.query("create index if not exists analytics_events_event_idx on analytics_events(event)");
  await pool.query("create index if not exists analytics_events_video_idx on analytics_events(video_id)");
  await pool.query("create index if not exists analytics_events_created_idx on analytics_events(created_at desc)");
  await pool.query("create index if not exists analytics_events_visitor_idx on analytics_events(visitor_id)");
};

const initDb = async () => {
  await runDbSetup();
  dbReady = Boolean(pool);
  dbError = "";
};

const ensureDbReady = async () => {
  if (dbReady) {
    return;
  }

  try {
    await initDb();
  } catch (error) {
    dbReady = false;
    dbError = error.message || "Error conectando con Postgres";
    console.error("No se pudo preparar la base de datos", error);
  }
};

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    db: dbReady,
    dbError,
    service: "crz-analytics-api",
  });
});

app.get("/", (_req, res) => {
  res.type("html").send(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>CRZ Analytics API</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #050b12;
            color: #eef7fb;
            font-family: Arial, sans-serif;
          }
          main {
            width: min(680px, calc(100vw - 32px));
            padding: 34px;
            border: 1px solid rgba(64, 210, 196, 0.35);
            border-radius: 24px;
            background: rgba(255, 255, 255, 0.035);
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
          }
          span {
            color: #40d2c4;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-size: 0.78rem;
          }
          h1 {
            margin: 12px 0;
            font-size: clamp(2rem, 5vw, 3.5rem);
          }
          p {
            color: #a8bdcc;
            line-height: 1.6;
          }
          code {
            color: #40d2c4;
          }
        </style>
      </head>
      <body>
        <main>
          <span>Online</span>
          <h1>CRZ Analytics API</h1>
          <p>El servicio esta activo. Usa <code>/health</code> para comprobar la base de datos y <code>/events</code> para recibir eventos de la landing.</p>
          <p>DB: <strong>${dbReady ? "conectada" : "pendiente"}</strong>${dbError ? ` · ${dbError}` : ""}</p>
        </main>
      </body>
    </html>
  `);
});

app.post("/events", async (req, res) => {
  try {
    console.log("Evento recibido", {
      contentType: req.headers["content-type"],
      bodyType: typeof req.body,
      hasDatabaseUrl: Boolean(DATABASE_URL),
      dbReady,
    });

    if (!pool) {
      res.status(503).json({ ok: false, error: "DATABASE_URL no configurado" });
      return;
    }

    await ensureDbReady();

    if (!dbReady) {
      res.status(500).json({ ok: false, error: dbError || "Base de datos no preparada" });
      return;
    }

    const event = normalizeEvent(parseBody(req.body));

    await pool.query(
      `
        insert into analytics_events (
          event, visitor_id, page, url, referrer, user_agent, language, screen,
          video_id, video_title, feedback, progress, current_time, duration, details
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `,
      [
        event.event,
        event.visitorId,
        event.page,
        event.url,
        event.referrer,
        event.userAgent,
        event.language,
        event.screen,
        event.videoId,
        event.videoTitle,
        event.feedback,
        event.progress,
        event.currentTime,
        event.duration,
        event.details,
      ],
    );

    res.status(204).end();
  } catch (error) {
    console.error("Error guardando evento", error);
    res.status(500).json({ ok: false, error: error.message || "No se pudo guardar el evento" });
  }
});

app.get("/debug/db", async (req, res) => {
  const token = req.query.token || "";

  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: "No autorizado" });
    return;
  }

  try {
    if (!pool) {
      res.status(503).json({ ok: false, error: "DATABASE_URL no configurado" });
      return;
    }

    const result = await pool.query("select current_database() as database, current_user as user, now() as now");
    res.json({
      ok: true,
      dbReady,
      dbError,
      databaseUrlPresent: Boolean(DATABASE_URL),
      databaseUrlHost: (() => {
        try {
          return new URL(DATABASE_URL).host;
        } catch (_error) {
          return "DATABASE_URL no parseable";
        }
      })(),
      result: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      dbReady,
      dbError,
      error: error.message || "Error comprobando Postgres",
    });
  }
});

app.get("/admin/init", async (req, res) => {
  const token = req.query.token || "";

  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: "No autorizado" });
    return;
  }

  await ensureDbReady();

  res.json({
    ok: dbReady,
    db: dbReady,
    dbError,
  });
});

app.get("/stats/videos/:videoId", async (req, res) => {
  if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) {
    res.status(401).json({ ok: false, error: "No autorizado" });
    return;
  }

  if (!pool) {
    res.status(503).json({ ok: false, error: "DATABASE_URL no configurado" });
    return;
  }

  const { videoId } = req.params;
  const result = await pool.query(
    `
      select
        count(*) filter (where event = 'video_play')::int as plays,
        count(*) filter (where event = 'video_ended')::int as completions,
        count(*) filter (where event = 'analysis_like' and feedback = 'like')::int as likes,
        count(*) filter (where event = 'analysis_like' and feedback = 'dislike')::int as dislikes,
        count(distinct visitor_id)::int as unique_visitors
      from analytics_events
      where video_id = $1
    `,
    [videoId],
  );

  res.json({
    ok: true,
    videoId,
    stats: result.rows[0],
  });
});

try {
  await initDb();
} catch (error) {
  dbReady = false;
  dbError = error.message || "Error conectando con Postgres";
  console.error("No se pudo inicializar la base de datos", error);
}

app.listen(PORT, () => {
  console.log(`CRZ Analytics API escuchando en puerto ${PORT}`);
});
