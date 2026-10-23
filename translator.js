
(() => {
  "use strict";

  const app = window.AuraApp;
  const $ = app.$;

  let sequence = [];
  let index = 0;
  let playing = false;
  let timer = null;
  let delay = 800;

  const gloss = $("#glossList");
  const status = $("#avatarStatus");
  const caption = $("#stageCaption");
  const loading = $("#loadingOverlay");
  const known = window.AuraDictionary || {};

  // Match the longest available dictionary phrase first.
  // Example: "I LOVE YOU" stays together if it exists as one entry.
  function tokensFor(text) {
    const cleaned = text
      .trim()
      .replace(/[.,!?;:]+/g, " ")
      .replace(/\s+/g, " ")
      .toUpperCase();

    if (!cleaned) return [];

    const words = cleaned.split(" ");
    const keys = Object.keys(known).sort(
      (a, b) => b.split(" ").length - a.split(" ").length
    );

    const result = [];
    let i = 0;

    while (i < words.length) {
      let matched = null;

      for (const key of keys) {
        const parts = key.split(" ");
        const candidate = words.slice(i, i + parts.length).join(" ");

        if (candidate === key) {
          matched = key;
          break;
        }
      }

      if (matched) {
        result.push(matched);
        i += matched.split(" ").length;
      } else {
        result.push(words[i]);
        i++;
      }
    }

    return result;
  }

  function isKnown(token) {
    return Boolean(known[token]);
  }

  function renderGloss() {
    gloss.replaceChildren();

    if (!sequence.length) {
      const empty = document.createElement("span");
      empty.className = "empty-gloss";
      empty.textContent = "Your text tokens will appear here.";
      gloss.append(empty);
      return;
    }

    sequence.forEach((token, i) => {
      const el = document.createElement("span");
      el.className =
        "gloss-token" +
        (i === index ? " active" : "") +
        (isKnown(token) ? "" : " unsupported-token");

      el.textContent = token;
      el.title = isKnown(token)
        ? "Dictionary entry — animation is illustrative, not a verified ISL sign."
        : "No matching dictionary entry. This word has not been translated.";

      gloss.append(el);
    });
  }

  function markToken(i) {
    index = i;

    [...gloss.children].forEach((el, j) => {
      el.classList.toggle("active", j === i);
    });

    const token = sequence[i] || "";

    if (!token) {
      caption.textContent = "Animation complete";
      return;
    }

    if (isKnown(token)) {
      caption.textContent =
        `Illustrative motion · ${known[token].label} · not verified ISL`;
    } else {
      caption.textContent =
        `Text only · "${token}" has no verified sign entry`;
    }
  }

  function stopTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function setPlaybackUI(isPlaying) {
    $("#playButton").textContent = isPlaying ? "▶ Playing" : "▶ Play";
  }

  function finish() {
    stopTimer();
    playing = false;
    app.state.playing = false;
    status.textContent = "READY";
    window.AuraAvatar?.setActive(false);
    setPlaybackUI(false);
  }

  function next() {
    if (!playing) return;

    if (index >= sequence.length - 1) {
      finish();
      return;
    }

    markToken(index + 1);

    // Only dictionary entries receive the illustrative avatar motion.
    window.AuraAvatar?.setActive(isKnown(sequence[index]));
    if (isKnown(sequence[index])) {
      window.AuraAvatar?.setPose(index);
    }

    timer = setTimeout(next, delay / (app.state.speed || 1));
  }

  function start() {
    if (!sequence.length) {
      app.toast("Enter a word or choose a phrase first.");
      return;
    }

    stopTimer();
    playing = true;
    app.state.playing = true;

    status.textContent = "PLAYING";
    setPlaybackUI(true);

    markToken(index);

    const supported = isKnown(sequence[index]);
    window.AuraAvatar?.setActive(supported);

    if (supported) {
      window.AuraAvatar?.setPose(index);
    }

    timer = setTimeout(next, delay / (app.state.speed || 1));
  }

  async function translate() {
    const button = $("#translateButton");
    const text = $("#sourceText").value.trim();

    if (!text) {
      app.toast("Type a word or choose a quick phrase first.");
      $("#sourceText").focus();
      return;
    }

    if (text.length > 300) {
      app.toast("Please keep the text within 300 characters.");
      return;
    }

    finish();

    loading.classList.remove("hidden");
    status.textContent = "CHECKING";
    caption.textContent = "Matching text against the learning dictionary…";
    button.disabled = true;

    try {
      sequence = tokensFor(text);
      index = 0;

      app.state.phrase = text;
      app.state.tokens = sequence;

      renderGloss();

      await new Promise(resolve => setTimeout(resolve, 250));

      const matchedCount = sequence.filter(isKnown).length;
      const unsupportedCount = sequence.length - matchedCount;

      if (unsupportedCount > 0) {
        caption.textContent =
          `${matchedCount} dictionary match(es), ` +
          `${unsupportedCount} unsupported token(s). Not a full translation.`;
      } else {
        caption.textContent =
          `${matchedCount} dictionary match(es). ` +
          "Animations are illustrative, not verified ISL.";
      }

      status.textContent = "READY";

      if (sequence.length) {
        markToken(0);
        start();
      }
    } catch (error) {
      console.error("Aura Sign text processing error:", error);
      status.textContent = "ERROR";
      caption.textContent = "Could not process the text. Please try again.";
      app.toast("Something went wrong while processing the text.");
    } finally {
      loading.classList.add("hidden");
      button.disabled = false;
    }
  }

  $("#translateButton").addEventListener("click", translate);
  $("#playButton").addEventListener("click", start);

  $("#pauseButton").addEventListener("click", () => {
    finish();
    status.textContent = "PAUSED";
    caption.textContent = "Animation paused.";
  });

  $("#restartButton").addEventListener("click", () => {
    if (!sequence.length) {
      app.toast("Process some text first.");
      return;
    }

    index = 0;
    renderGloss();
    start();
  });

  document.querySelectorAll("[data-speed]").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-speed]").forEach(item => {
        item.classList.toggle("selected", item === button);
      });

      app.state.speed = Number(button.dataset.speed) || 1;
      app.toast(`Playback speed set to ${app.state.speed}×.`);
    });
  });

  // Dictionary page
  const grid = $("#dictionaryGrid");
  const search = $("#dictionarySearch");

  function drawDictionary(query = "") {
    grid.replaceChildren();

    let count = 0;
    const normalizedQuery = query.trim().toLowerCase();

    Object.entries(known)
      .filter(([key, item]) => {
        const searchable = [
          key,
          item.label,
          item.description,
          item.category || "",
          item.entryType || ""
        ].join(" ").toLowerCase();

        return searchable.includes(normalizedQuery);
      })
      .forEach(([key, item]) => {
        count++;

        const button = document.createElement("button");
        button.className = "dictionary-card";

        const symbol = document.createElement("span");
        symbol.className = "card-symbol";
        symbol.textContent = item.symbol || "✋";

        const title = document.createElement("strong");
        title.textContent = item.label || key;

        const description = document.createElement("small");
        description.textContent = item.description || "Learning entry.";

        const note = document.createElement("small");
        note.textContent = "Illustrative only · ISL reference not verified";

        button.append(symbol, title, description, note);

        button.addEventListener("click", () => {
          app.showPage("home");

          const textMode = document.querySelector('[data-mode="text"]');
          textMode?.click();

          $("#sourceText").value = item.label || key;
          $("#sourceText").dispatchEvent(new Event("input"));
          $("#translateButton").click();
        });

        grid.append(button);
      });

    $("#dictionaryCount").textContent =
      `${count} entr${count === 1 ? "y" : "ies"}`;

    if (!count) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No matching entries. Try another search.";
      grid.append(empty);
    }
  }

  search.addEventListener("input", () => drawDictionary(search.value));
  drawDictionary();
})();
