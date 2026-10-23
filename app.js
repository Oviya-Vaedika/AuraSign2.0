(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  window.AuraApp = {
    $,$$, state: {sourceLanguage:"English",targetLanguage:"ASL",speed:1,phrase:"",tokens:[],currentToken:0,playing:false},
    toast(message) {
      const toast = $("#toast"); if (!toast) return;
      toast.textContent = message; toast.classList.add("show");
      clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
    },
    showPage(name) {
      $$(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.page === name));
      $$(".page").forEach(p => p.classList.remove("active"));
      const page = $(`#${name}Page`); if (page) page.classList.add("active");
    }
  };
  const app = window.AuraApp;
  $$(".nav-link").forEach(button => button.addEventListener("click", () => app.showPage(button.dataset.page)));
  $$("[data-return-home]").forEach(button => button.addEventListener("click", () => app.showPage("home")));
  $$(".mode-tab").forEach(button => button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    $$(".mode-tab").forEach(b => { b.classList.toggle("active", b === button); b.setAttribute("aria-selected", String(b === button)); });
    $("#textMode").classList.toggle("active", mode === "text");
    $("#cameraMode").classList.toggle("active", mode === "camera");
    if (mode === "text" && window.AuraAvatar) window.AuraAvatar.resize();
  }));
  $$(".segmented button").forEach(button => button.addEventListener("click", () => {
    $$(".segmented button").forEach(b => b.classList.toggle("selected", b === button));
    app.state.sourceLanguage = button.dataset.language;
  }));
  $$(".target-options button").forEach(button => button.addEventListener("click", () => {
    $$(".target-options button").forEach(b => b.classList.toggle("selected", b === button));
    app.state.targetLanguage = button.dataset.target;
    app.toast(app.state.targetLanguage === "ASL" ? "Target set to American Sign Language." : "Target set to International Sign. Phrase animations remain illustrative.");
  }));
  $("#themeButton").addEventListener("click", () => {
    document.body.classList.toggle("high-contrast");
    app.toast(document.body.classList.contains("high-contrast") ? "Higher contrast enabled." : "Standard contrast restored.");
  });
  const sourceText = $("#sourceText");
  sourceText.addEventListener("input", () => $("#charCount").textContent = `${sourceText.value.length} / 300`);
  $$("[data-phrase]").forEach(button => button.addEventListener("click", () => {
    sourceText.value = button.dataset.phrase; sourceText.dispatchEvent(new Event("input")); sourceText.focus();
  }));
  window.addEventListener("beforeunload", () => { if (window.AuraCamera) window.AuraCamera.stop(); });
})();
