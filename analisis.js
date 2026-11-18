// Biblioteca de análisis: lee analisis.json (lo actualiza Clarify Studio al publicar)
// y pinta el análisis destacado y el historial. Si el archivo no carga, se queda
// el contenido que ya viene escrito en analisis.html.
(() => {
  const library = document.querySelector("#analysis-library");
  if (!library) return;

  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const TIPOS = { diario: "Diario", semanal: "Semanal" };
  let items = [];
  let filtro = "todos";
  let destacadoId = null;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const fecha = (iso) => {
    const [y, m, d] = String(iso || "").split("-").map(Number);
    return y && m && d ? `${d} ${MESES[m - 1]} ${y}` : "";
  };

  const thumb = (a) =>
    a.youtube ? `https://i.ytimg.com/vi/${a.youtube}/hqdefault.jpg` : a.poster || "";

  const track = (name, a, extra = {}) => {
    if (typeof sendCrzEvent === "function") {
      sendCrzEvent(name, { videoId: a.id, videoTitle: a.titulo, ...extra });
    }
  };

  // Reproductor: vídeo de YouTube (se carga al pulsar) o archivo propio.
  const media = (a) => {
    const box = el("div", "featured-video-media");
    if (a.youtube) {
      const play = el("button", "yt-lite");
      play.type = "button";
      play.setAttribute("aria-label", `Reproducir: ${a.titulo}`);
      play.style.backgroundImage = `url("${thumb(a)}")`;
      play.append(el("span", "yt-lite-icon"));
      play.onclick = () => {
        const frame = document.createElement("iframe");
        frame.src = `https://www.youtube-nocookie.com/embed/${a.youtube}?autoplay=1&rel=0&modestbranding=1`;
        frame.title = a.titulo;
        frame.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen";
        frame.allowFullscreen = true;
        frame.className = "yt-frame";
        play.replaceWith(frame);
        track("video_play", a, { source: "youtube" });
      };
      box.append(play);
    } else if (a.video) {
      const v = document.createElement("video");
      v.controls = true;
      v.preload = "metadata";
      if (a.poster) v.poster = a.poster;
      v.dataset.videoId = a.id;
      v.dataset.videoTitle = a.titulo;
      const s = document.createElement("source");
      s.src = a.video;
      s.type = "video/mp4";
      v.append(s);
      box.append(v);
    }
    return box;
  };

  const meta = (a) => {
    const row = el("div", "analysis-tags");
    row.append(el("span", "tag-tipo", TIPOS[a.tipo] || "Análisis"));
    if (a.fecha) row.append(el("span", "tag-fecha", fecha(a.fecha)));
    (a.activos || []).forEach((x) => row.append(el("span", "", x)));
    return row;
  };

  const feedback = (a) => {
    const pill = el("div", "feedback-pill");
    pill.setAttribute("aria-label", "Valorar el análisis");
    const btn = (kind, label, path) => {
      const b = el("button", "feedback-icon-button");
      b.type = "button";
      b.dataset.feedback = kind;
      b.dataset.videoId = a.id;
      b.setAttribute("aria-label", label);
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
      return b;
    };
    const count = el("span", "feedback-count", "0");
    count.dataset.count = "0";
    const div = el("span", "feedback-divider");
    div.setAttribute("aria-hidden", "true");
    pill.append(
      btn("like", "Me ha servido", '<path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /><path d="M7 11l4-8a3 3 0 0 1 3 3v4h5.2a2 2 0 0 1 2 2.3l-1.1 7a2 2 0 0 1-2 1.7H7z" />'),
      count,
      div,
      btn("dislike", "No me ha servido", '<path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" /><path d="M17 13l-4 8a3 3 0 0 1-3-3v-4H4.8a2 2 0 0 1-2-2.3l1.1-7a2 2 0 0 1 2-1.7H17z" />'),
    );
    return pill;
  };

  const featured = (a) => {
    const card = el("article", "analysis-card video-stage");
    card.dataset.videoId = a.id;
    card.dataset.videoTitle = a.titulo;
    const content = el("div", "analysis-content");
    const copy = el("div", "featured-video-copy");
    copy.append(el("p", "eyebrow", a.id === items[0]?.id ? "Último análisis" : "Análisis"), el("h3", "", a.titulo));
    if (a.resumen) copy.append(el("p", "", a.resumen));
    copy.append(meta(a), feedback(a));
    content.append(copy);
    card.append(media(a), content);
    return card;
  };

  const historyItem = (a) => {
    const b = el("button", "history-item");
    b.type = "button";
    const img = el("span", "history-thumb");
    const src = thumb(a);
    if (src) img.style.backgroundImage = `url("${src}")`;
    const txt = el("span", "history-text");
    txt.append(el("strong", "", a.titulo), el("small", "", `${TIPOS[a.tipo] || "Análisis"} · ${fecha(a.fecha)}`));
    b.append(img, txt);
    b.onclick = () => {
      destacadoId = a.id;
      render();
      library.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    return b;
  };

  const emptyCard = () => {
    const c = el("div", "previous-empty-card");
    c.innerHTML =
      '<span class="previous-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" /><path d="M9 8l6 4-6 4z" /></svg></span>' +
      '<strong>Nuevos análisis en camino</strong>' +
      '<p>Mientras tanto, cada semana comparto mi lectura del mercado en Instagram: <a href="https://www.instagram.com/cztr4der/" target="_blank" rel="noopener">@cztr4der</a>.</p>';
    return c;
  };

  const filters = () => {
    const row = el("div", "history-filters");
    [["todos", "Todos"], ["diario", "Diarios"], ["semanal", "Semanales"]].forEach(([k, label]) => {
      const b = el("button", k === filtro ? "is-active" : "", label);
      b.type = "button";
      b.onclick = () => { filtro = k; render(); };
      row.append(b);
    });
    return row;
  };

  function render() {
    const visibles = items.filter((a) => filtro === "todos" || a.tipo === filtro);
    const top = visibles.find((a) => a.id === destacadoId) || visibles[0] || items[0];
    const rest = visibles.filter((a) => a !== top);

    library.className = "video-library single-video";
    library.replaceChildren();
    if (top) library.append(featured(top));

    const aside = el("aside", "previous-videos");
    aside.setAttribute("aria-label", "Publicaciones anteriores");
    const head = el("div", "previous-head");
    head.append(el("p", "eyebrow", "Historial"), el("h3", "", "Publicaciones anteriores"));
    aside.append(head);
    if (items.some((a) => a.tipo === "diario") && items.some((a) => a.tipo === "semanal")) aside.append(filters());
    if (rest.length) {
      const list = el("div", "history-list");
      rest.forEach((a) => list.append(historyItem(a)));
      aside.append(list);
    } else if (filtro !== "todos") {
      aside.append(el("p", "history-none", `No hay más análisis ${filtro === "diario" ? "diarios" : "semanales"} por ahora.`));
    } else {
      aside.classList.add("previous-videos-empty");
      aside.append(emptyCard());
    }
    library.append(aside);

    if (typeof setupVideoTracking === "function") setupVideoTracking();
    if (typeof setupFeedbackTracking === "function") setupFeedbackTracking();
  }

  const valid = (a) =>
    a && typeof a.id === "string" && typeof a.titulo === "string" &&
    ((typeof a.youtube === "string" && /^[\w-]{11}$/.test(a.youtube)) || typeof a.video === "string");

  fetch(`analisis.json?t=${Date.now()}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((data) => {
      items = (Array.isArray(data.analisis) ? data.analisis : [])
        .filter(valid)
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
      if (items.length) render();
    })
    .catch(() => {});
})();
