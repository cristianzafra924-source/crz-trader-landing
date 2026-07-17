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

if (!DATABASE_URL) {
  console.warn("DATABASE_URL no configurado. La API arrancara, pero no podra guardar eventos.");
}

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
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
    return JSON.parse(body);
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

const initDb = async () => {
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
    );

    create index if not exists analytics_events_event_idx on analytics_events(event);
    create index if not exists analytics_events_video_idx on analytics_events(video_id);
    create index if not exists analytics_events_created_idx on analytics_events(created_at desc);
    create index if not exists analytics_events_visitor_idx on analytics_events(visitor_id);
  `);
};

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    db: Boolean(pool),
    service: "crz-analytics-api",
  });
});

app.post("/events", async (req, res) => {
  try {
    if (!pool) {
      res.status(503).json({ ok: false, error: "DATABASE_URL no configurado" });
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
    res.status(400).json({ ok: false, error: "Evento no valido" });
  }
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

await initDb();

app.listen(PORT, () => {
  console.log(`CRZ Analytics API escuchando en puerto ${PORT}`);
});
