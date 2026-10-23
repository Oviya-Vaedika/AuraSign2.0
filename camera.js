(() => {
  "use strict";

  const app = window.AuraApp;
  const $ = app.$;

  const video = $("#cameraVideo");
  const canvas = $("#cameraCanvas");
  const ctx = canvas.getContext("2d");

  const recognized = $("#recognizedText");
  const log = $("#detectionLog");
  const placeholder = $("#cameraPlaceholder");

  let stream = null;
  let handModel = null;
  let raf = 0;
  let active = false;
  let detectBusy = false;
  let lastDetect = 0;
  let mediapipeBase = "https://cdn.jsdelivr.net/npm/@mediapipe/hands/";

  // Recognition stability state for each visible hand.
  const handStates = new Map();
  let sessionEntries = 0;

  const MAX_HISTORY = 30;
  const DETECTION_INTERVAL = 40;
  const STABILITY_MS = 450;
  const REPEAT_COOLDOWN_MS = 1400;

  const fingerPaths = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [0, 9, 10, 11, 12],
    [0, 13, 14, 15, 16],
    [0, 17, 18, 19, 20],
    [5, 9, 13, 17]
  ];

  function setStatus(message) {
    $("#cameraMessage").textContent = message;
  }

  function setPill(message) {
    $("#confidencePill").textContent = message;
  }

  function setCameraState(message) {
    $("#cameraState").textContent = message;
  }

  function sizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (!rect.width || !rect.height) return;

    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearOverlay() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  }

  function drawHand(landmarks, handIndex) {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const points = landmarks.map(point => ({
      x: point.x * width,
      y: point.y * height
    }));

    // Draw the palm and fingers.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    fingerPaths.forEach((path, index) => {
      ctx.beginPath();

      path.forEach((pointIndex, position) => {
        const point = points[pointIndex];

        if (position === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });

      ctx.strokeStyle =
        index === 0
          ? "#f0abfc"
          : index === 5
            ? "rgba(224,251,255,0.8)"
            : "#22d3ee";

      ctx.lineWidth = index === 5 ? 2.5 : 3.5;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 5;
      ctx.stroke();
    });

    ctx.shadowBlur = 0;

    // Draw joints and fingertips.
    points.forEach((point, index) => {
      const isTip = [4, 8, 12, 16, 20].includes(index);

      ctx.beginPath();
      ctx.arc(point.x, point.y, isTip ? 5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isTip ? "#f0abfc" : "#ffffff";
      ctx.fill();

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "#07506a";
      ctx.stroke();
    });

    // Label each hand without treating it as a translated sign.
    const wrist = points[0];
    ctx.font = "600 12px sans-serif";
    ctx.fillStyle = "#f0abfc";
    ctx.fillText(`Hand ${handIndex + 1}`, wrist.x + 8, wrist.y + 18);
  }

  const distance = (a, b) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  /*
   * Stage 1: estimate a basic hand shape.
   *
   * These labels are NOT ISL words or signs.
   * This is a geometric heuristic, not a trained sign classifier.
   */
  function estimateHandShape(points) {
    if (!points || points.length < 21) {
      return {
        label: "Landmarks unavailable",
        detail: "Waiting for valid hand landmarks."
      };
    }

    const wrist = points[0];
    const palmSize = Math.max(distance(points[0], points[9]), 0.001);

    /*
     * Estimate finger extension using relative distances.
     * This is less dependent on image scale than fixed pixel thresholds,
     * but can still fail with rotated hands and unusual camera angles.
     */
    function isFingerExtended(tipIndex, pipIndex, mcpIndex) {
      const tipFromWrist = distance(points[tipIndex], wrist);
      const pipFromWrist = distance(points[pipIndex], wrist);
      const mcpFromWrist = distance(points[mcpIndex], wrist);

      return (
        tipFromWrist > pipFromWrist + palmSize * 0.12 &&
        tipFromWrist > mcpFromWrist + palmSize * 0.25
      );
    }

    const thumbExtended =
      distance(points[4], points[5]) >
      distance(points[3], points[5]) * 1.12;

    const fingers = [
      isFingerExtended(8, 6, 5),
      isFingerExtended(12, 10, 9),
      isFingerExtended(16, 14, 13),
      isFingerExtended(20, 18, 17)
    ];

    const [index, middle, ring, pinky] = fingers;
    const count = fingers.filter(Boolean).length;

    let label = "Unclassified hand shape";

    if (count === 4) {
      label = "Open-palm shape";
    } else if (count === 0 && !thumbExtended) {
      label = "Closed-fist shape";
    } else if (index && !middle && !ring && !pinky) {
      label = "One-finger-extended shape";
    } else if (index && middle && !ring && !pinky) {
      label = "Two-fingers-extended shape";
    } else if (!index && middle && !ring && !pinky) {
      label = "Middle-finger-extended shape";
    } else if (pinky && !index && !middle && !ring) {
      label = "Pinky-extended shape";
    } else if (thumbExtended && count === 0) {
      label = "Thumb-extended shape";
    } else if (count === 3) {
      label = "Three-fingers-extended shape";
    }

    return {
      label,
      detail: `${count} of 4 fingers estimated extended; thumb ${
        thumbExtended ? "extended" : "folded or uncertain"
      }.`
    };
  }

  function getHandConfidence(results, index) {
    const classification = results.multiHandedness?.[index]?.[0];
    const score = classification?.score;

    if (typeof score !== "number") return null;

    return Math.round(score * 100);
  }

  function renderHistoryMessage() {
    if (sessionEntries === 0) {
      recognized.textContent =
        "No stable hand shapes detected yet. Hold your hand steady in the frame.";
    }
  }

  function addHistoryEntry(text) {
    if (sessionEntries === 0) {
      recognized.replaceChildren();
    }

    const entry = document.createElement("span");
    entry.className = "recognized-entry";
    entry.textContent = text;

    recognized.append(entry, document.createTextNode("  "));
    sessionEntries++;

    // Keep the session output from growing indefinitely.
    while (recognized.children.length > MAX_HISTORY) {
      recognized.removeChild(recognized.firstElementChild);
    }
  }

  function updateRecognition(points, handIndex, detectorConfidence) {
    const result = estimateHandShape(points);
    const now = performance.now();

    let state = handStates.get(handIndex);

    if (!state) {
      state = {
        candidate: "",
        candidateSince: now,
        committedLabel: "",
        committedAt: 0
      };

      handStates.set(handIndex, state);
    }

    const confidenceText =
      detectorConfidence === null
        ? "Detector score unavailable"
        : `Hand detector score: ${detectorConfidence}%`;

    const labelText = `Hand ${handIndex + 1}: ${result.label}`;

    if (result.label !== state.candidate) {
      state.candidate = result.label;
      state.candidateSince = now;
    }

    const stableLongEnough =
      now - state.candidateSince >= STABILITY_MS;

    const changedLabel = result.label !== state.committedLabel;

    const cooldownPassed =
      now - state.committedAt >= REPEAT_COOLDOWN_MS;

    if (
      stableLongEnough &&
      changedLabel &&
      (cooldownPassed || state.committedLabel === "")
    ) {
      state.committedLabel = result.label;
      state.committedAt = now;

      addHistoryEntry(
        `${new Date().toLocaleTimeString()} — ${labelText}`
      );
    }

    const stabilityText = stableLongEnough
      ? "Shape estimate stable"
      : "Stabilizing shape estimate…";

    return {
      label: result.label,
      detail: `${labelText}. ${result.detail} ${confidenceText}. ${stabilityText}`
    };
  }

  async function loadHandsLibrary() {
    if (window.Hands) return true;

    const sources = [
      {
        script:
          "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js",
        base: "https://cdn.jsdelivr.net/npm/@mediapipe/hands/"
      },
      {
        script:
          "https://unpkg.com/@mediapipe/hands/hands.js",
        base: "https://unpkg.com/@mediapipe/hands/"
      }
    ];

    for (const source of sources) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");

          script.src = source.script;
          script.async = true;
          script.onload = resolve;
          script.onerror = () => {
            script.remove();
            reject(new Error("Hand-tracking library failed to load."));
          };

          document.head.appendChild(script);
        });

        if (window.Hands) {
          mediapipeBase = source.base;
          return true;
        }
      } catch (error) {
        console.warn("Aura Sign model loader:", error);
      }
    }

    return false;
  }

  function resetHandStates() {
    handStates.clear();
  }

  function handleResults(results) {
    if (!active) return;

    const hands = results.multiHandLandmarks || [];
    const handedness = results.multiHandedness || [];

    clearOverlay();

    if (hands.length === 0) {
      resetHandStates();

      setPill("NO HAND DETECTED");
      setCameraState("SEARCHING");

      log.textContent =
        "No hand detected. Try better lighting and keep your hands inside the camera frame.";

      return;
    }

    let logLines = [];

    hands.forEach((landmarks, index) => {
      drawHand(landmarks, index);

      const confidence = getHandConfidence(results, index);
      const result = updateRecognition(landmarks, index, confidence);

      logLines.push(result.detail);
    });

    setCameraState("HAND TRACKING");
    setPill(`${hands.length} HAND${hands.length === 1 ? "" : "S"} FOUND`);

    log.textContent = logLines.join("\n");
  }

  async function start() {
    if (active) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus(
        "Camera access requires HTTPS or localhost. Open the deployed site securely and allow camera access."
      );
      app.toast("Camera access is unavailable in this context.");
      return;
    }

    $("#startCamera").disabled = true;
    setStatus("Requesting camera permission…");

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      video.srcObject = stream;
      video.style.display = "block";

      await video.play();

      sizeCanvas();
      placeholder.style.display = "none";

      setStatus("Loading the hand-tracking model…");

      const loaded = await loadHandsLibrary();

      if (!loaded) {
        throw new Error(
          "The hand-tracking library could not load. Check your internet connection or CDN access."
        );
      }

      handModel = new window.Hands({
        locateFile: file => `${mediapipeBase}${file}`
      });

      handModel.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.6
      });

      handModel.onResults(handleResults);

      active = true;
      detectBusy = false;
      lastDetect = 0;
      resetHandStates();

      $("#stopCamera").disabled = false;

      setStatus(
        "Camera ready. Show one or both hands clearly. Hold a pose briefly for a stable shape estimate."
      );

      setCameraState("SEARCHING");
      setPill("LOOKING FOR HAND");
      log.textContent = "Waiting for hand landmarks…";

      loop();
    } catch (error) {
      console.error("Aura Sign camera error:", error);

      active = false;

      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      stream = null;
      video.srcObject = null;
      video.style.display = "none";
      placeholder.style.display = "flex";

      $("#startCamera").disabled = false;
      $("#stopCamera").disabled = true;

      setCameraState("CAMERA ERROR");
      setPill("CAMERA ERROR");

      if (error.name === "NotAllowedError") {
        setStatus(
          "Camera permission denied. Allow camera access in your browser settings, then try again."
        );
      } else if (error.name === "NotFoundError") {
        setStatus(
          "No camera was found. Connect a camera or try another device."
        );
      } else if (error.name === "NotReadableError") {
        setStatus(
          "The camera may be in use by another application. Close that application and try again."
        );
      } else {
        setStatus(
          `${error.message || "Camera setup failed"} Check HTTPS, internet access, and browser permissions.`
        );
      }

      app.toast("Camera setup failed. See the message below the preview.");
    }
  }

  async function loop() {
    if (!active) return;

    if (
      handModel &&
      video.readyState >= 2 &&
      !detectBusy &&
      performance.now() - lastDetect >= DETECTION_INTERVAL
    ) {
      lastDetect = performance.now();
      detectBusy = true;

      try {
        await handModel.send({ image: video });
      } catch (error) {
        console.warn("Aura Sign skipped a camera frame:", error);
      } finally {
        detectBusy = false;
      }
    }

    if (active) {
      raf = requestAnimationFrame(loop);
    }
  }

  async function stop() {
    active = false;

    if (raf) {
      cancelAnimationFrame(raf);
    }

    raf = 0;

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    stream = null;
    video.srcObject = null;
    video.style.display = "none";

    const modelToClose = handModel;
    handModel = null;

    if (modelToClose) {
      try {
        await modelToClose.close();
      } catch (error) {
        console.warn("Could not close the hand model cleanly:", error);
      }
    }

    resetHandStates();
    clearOverlay();

    placeholder.style.display = "flex";

    setCameraState("CAMERA OFF");
    setPill("CAMERA OFF");
    setStatus(
      "Camera stopped. Restart it when you are ready to continue."
    );

    $("#startCamera").disabled = false;
    $("#stopCamera").disabled = true;
  }

  $("#startCamera").addEventListener("click", start);
  $("#stopCamera").addEventListener("click", stop);

  $("#clearRecognized").addEventListener("click", () => {
    recognized.replaceChildren();
    sessionEntries = 0;
    resetHandStates();

    renderHistoryMessage();
    log.textContent = "Session output cleared.";

    app.toast("Recognition history cleared.");
  });

  $("#copyRecognized").addEventListener("click", async () => {
    const text = recognized.textContent.trim();

    if (!text || sessionEntries === 0) {
      app.toast("There is no recognition history to copy yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      app.toast("Recognition history copied.");
    } catch (error) {
      app.toast(
        "Clipboard access unavailable. Select and copy the text manually."
      );
    }
  });

  window.addEventListener("resize", sizeCanvas);

  window.addEventListener("beforeunload", () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  });

  sizeCanvas();

  window.AuraCamera = { start, stop };
})();
