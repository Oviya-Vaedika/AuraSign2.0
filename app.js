
(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  const app = {
    $,
    $$,

    state: {
      sourceLanguage: "English",
      targetLanguage: "ISL",
      speed: 1,
      phrase: "",
      tokens: [],
      currentToken: 0,
      playing: false
    },

    toastTimer: null,

    toast(message) {
      const toast = $("#toast");
      if (!toast) return;

      toast.textContent = message;
      toast.classList.add("show");

      clearTimeout(this.toastTimer);

      this.toastTimer = setTimeout(() => {
        toast.classList.remove("show");
      }, 2600);
    },

    showPage(name) {
      $$(".nav-link").forEach(button => {
        const active = button.dataset.page === name;
        button.classList.toggle("active", active);

        if (active) {
          button.setAttribute("aria-current", "page");
        } else {
          button.removeAttribute("aria-current");
        }
      });

      $$(".page").forEach(page => page.classList.remove("active"));

      const page = $(`#${name}Page`);
      if (page) page.classList.add("active");

      if (name === "home") {
        requestAnimationFrame(() => {
          window.AuraAvatar?.resize();
        });
      }
    }
  };

  window.AuraApp = app;

  // Main navigation
  $$(".nav-link").forEach(button => {
    button.addEventListener("click", () => {
      app.showPage(button.dataset.page);
    });
  });

  // Return-home buttons
  $$("[data-return-home]").forEach(button => {
    button.addEventListener("click", () => app.showPage("home"));
  });

  // Text / camera mode tabs
  $$(".mode-tab").forEach(button => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;

      $$(".mode-tab").forEach(tab => {
        const active = tab === button;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });

      $("#textMode").classList.toggle("active", mode === "text");
      $("#cameraMode").classList.toggle("active", mode === "camera");

      if (mode === "text") {
        requestAnimationFrame(() => window.AuraAvatar?.resize());
      }
    });
  });

  // Source-language selector.
  // The current dictionary only contains English keys, so other languages
  // are disabled rather than pretending that they are translated.
  const sourceLanguageButtons = $$("#sourceLanguages [data-language]");

  sourceLanguageButtons.forEach(button => {
    const supported = button.dataset.language === "English";

    button.hidden = !supported;
    button.classList.toggle("selected", supported);
    button.setAttribute("aria-pressed", String(supported));

    button.addEventListener("click", () => {
      if (button.dataset.language !== "English") {
        app.toast("Only English input is currently supported.");
        return;
      }

      sourceLanguageButtons.forEach(item => {
        item.classList.toggle("selected", item === button);
        item.setAttribute("aria-pressed", String(item === button));
      });

      app.state.sourceLanguage = "English";
    });
  });

  // Target sign system.
  // ISL means Indian Sign Language, not International Sign.
  const targetButtons = $$(".target-options [data-target]");

  targetButtons.forEach(button => {
    const isISL = button.dataset.target === "ISL";

    if (isISL) {
      button.textContent = "Indian Sign Language";
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
    } else {
      button.classList.remove("selected");
      button.setAttribute("aria-pressed", "false");
      button.hidden = true;
    }

    button.addEventListener("click", () => {
      if (button.dataset.target !== "ISL") {
        app.toast("This prototype is currently configured for ISL learning.");
        return;
      }

      targetButtons.forEach(item => {
        const active = item === button;
        item.classList.toggle("selected", active);
        item.setAttribute("aria-pressed", String(active));
      });

      app.state.targetLanguage = "ISL";

      app.toast(
        "Indian Sign Language learning mode selected. Sign animations remain illustrative."
      );
    });
  });

  // High-contrast toggle
  const themeButton = $("#themeButton");

  themeButton?.addEventListener("click", () => {
    const enabled = document.body.classList.toggle("high-contrast");

    themeButton.setAttribute("aria-pressed", String(enabled));

    app.toast(
      enabled ? "Higher contrast enabled." : "Standard contrast restored."
    );
  });

  // Character counter
  const sourceText = $("#sourceText");

  function updateCharacterCount() {
    $("#charCount").textContent = `${sourceText.value.length} / 300`;
  }

  sourceText.addEventListener("input", updateCharacterCount);
  updateCharacterCount();

  // Quick phrase buttons
  $$("[data-phrase]").forEach(button => {
    button.addEventListener("click", () => {
      sourceText.value = button.dataset.phrase;
      sourceText.dispatchEvent(new Event("input"));
      sourceText.focus();
    });
  });

  // Stop camera safely when leaving or refreshing the page.
  window.addEventListener("beforeunload", () => {
    window.AuraCamera?.stop();
  });
})();
