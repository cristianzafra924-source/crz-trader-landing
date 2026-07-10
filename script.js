const CRZ_ANALYTICS_ENDPOINT = "";

const getVisitorId = () => {
  const key = "crz_visitor_id";
  const existing = localStorage.getItem(key);

  if (existing) {
    return existing;
  }

  const id = `visitor_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(key, id);
  return id;
};

const sendCrzEvent = (eventName, details = {}) => {
  const payload = {
    event: eventName,
    visitorId: getVisitorId(),
    page: window.location.pathname,
    url: window.location.href,
    referrer: document.referrer || "Directo",
    userAgent: navigator.userAgent,
    language: navigator.language,
    screen: `${window.screen.width}x${window.screen.height}`,
    createdAt: new Date().toISOString(),
    ...details,
  };

  if (!CRZ_ANALYTICS_ENDPOINT) {
    console.info("CRZ analytics pendiente de conectar", payload);
    return;
  }

  try {
    fetch(CRZ_ANALYTICS_ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (error) {
    console.warn("No se pudo enviar el evento CRZ", error);
  }
};

const getVideoPayload = (video) => ({
  videoId: video.dataset.videoId || "video-sin-id",
  videoTitle: video.dataset.videoTitle || "Video sin titulo",
  currentTime: Math.round(video.currentTime || 0),
  duration: Math.round(video.duration || 0),
});

const setupVideoTracking = () => {
  const videos = document.querySelectorAll("video[data-video-id]");

  videos.forEach((video) => {
    const milestones = new Set();
    let playTracked = false;

    video.addEventListener("play", () => {
      if (playTracked) {
        return;
      }

      playTracked = true;
      sendCrzEvent("video_play", getVideoPayload(video));
    });

    video.addEventListener("timeupdate", () => {
      if (!video.duration) {
        return;
      }

      const progress = Math.round((video.currentTime / video.duration) * 100);
      [25, 50, 90].forEach((milestone) => {
        if (progress >= milestone && !milestones.has(milestone)) {
          milestones.add(milestone);
          sendCrzEvent("video_progress", {
            ...getVideoPayload(video),
            progress: milestone,
          });
        }
      });
    });

    video.addEventListener("ended", () => {
      sendCrzEvent("video_ended", {
        ...getVideoPayload(video),
        progress: 100,
      });
    });
  });
};

const setupFeedbackTracking = () => {
  const buttons = document.querySelectorAll("[data-feedback]");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest("[data-video-id]");
      const videoId = button.dataset.videoId || card?.dataset.videoId || "video-sin-id";
      const videoTitle = card?.dataset.videoTitle || button.textContent.trim();
      const group = button.closest(".feedback-pill") || button.closest(".analysis-feedback");

      group?.querySelectorAll("[data-feedback]").forEach((item) => {
        item.classList.remove("is-selected");
        item.removeAttribute("aria-pressed");
      });

      button.classList.add("is-selected");
      button.setAttribute("aria-pressed", "true");

      sendCrzEvent("analysis_like", {
        videoId,
        videoTitle,
        feedback: button.dataset.feedback,
      });
    });
  });
};

const setupReservationTracking = () => {
  const reservationLinks = document.querySelectorAll('a[href*="#contacto"]');

  reservationLinks.forEach((link) => {
    link.addEventListener("click", () => {
      sendCrzEvent("reserve_click", {
        label: link.textContent.trim(),
      });
    });
  });
};

document.addEventListener("DOMContentLoaded", () => {
  sendCrzEvent("page_view");
  setupVideoTracking();
  setupFeedbackTracking();
  setupReservationTracking();
});
