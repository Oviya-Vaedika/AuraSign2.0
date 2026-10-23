
(() => {
  "use strict";

  const app = window.AuraApp;
  const $ = (selector) => document.querySelector(selector);

  const video = $("#cameraVideo");
  const canvas = $("#cameraCanvas");
  const ctx = canvas.getContext("2d");

  const output = $("#recognizedText");
  const log = $("#detectionLog");
  const placeholder = $("#cameraPlaceholder");

  const status = $("#cameraMessage");
  const confidence = $("#confidencePill");
  const cameraState = $("#cameraState");

  let stream = null;
  let model = null;
  let active = false;
  let busy = false;
  let raf = 0;
  let lastFrame = 0;
  let lastLandmarkSignature = "";
  let signatureSince = 0;

  // Temporal data for training a future motion classifier.
  const WINDOW_SIZE = 30;
  let motionWindow = [];
  let trainingSamples = [];

  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17]
  ];

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function setConfidence(message) {
    if (confidence) confidence.textContent = message;
  }

  function setState(message) {
    if (cameraState) cameraState.textContent = message;
  }

  function resizeCanvas() {
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearOverlay() {
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  }

  function drawHands(hands) {
    clearOverlay();

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    hands.forEach((landmarks, handIndex) => {
      const points = landmarks.map((p) => ({
        x: p.x * width,
        y: p.y * height
      }));

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = handIndex === 0 ? "#22d3ee" : "#f0abfc";
      ctx.lineWidth = 3;

      connections.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(points[a].x, points[a].y);
        ctx.lineTo(points[b].x, points[b].y);
        ctx.stroke();
      });

      points.forEach((p, index) => {
        const fingertip = [4, 8, 12, 16, 20].includes(index);

        ctx.beginPath();
        ctx.arc(p.x, p.y, fingertip ? 5 : 2.8, 0, Math.PI * 2);
        ctx.fillStyle = fingertip ? "#ffffff" : "#a5f3fc";
        ctx.fill();
      });
    });
  }

  // Normalize coordinates around the wrist and divide by palm size.
  // This reduces variation caused by the hand being closer to the camera.
  // It does NOT remove every camera angle or handedness difference.
  function normalizeLandmarks(landmarks) {
    if (!landmarks || landmarks.length !== 21) return null;

    const wrist = landmarks[0];
    const middleBase = landmarks[9];

    const palmScale = Math.hypot(
      middleBase.x - wrist.x,
      middleBase.y - wrist.y,
      middleBase.z - wrist.z
    );

    if (!Number.isFinite(palmScale) || palmScale < 0.0001) {
      return null;
    }

    return landmarks.flatMap((point) => [
      (point.x - wrist.x) / palmScale,
      (point.y - wrist.y) / palmScale,
      (point.z - wrist.z) / palmScale
    ]);
  }

  function buildFrame(results) {
    const hands = results.multiHandLandmarks || [];
    const handedness = results.multiHandedness || [];

    const frame = {
      time: Math.round(performance.now()),
      hands: []
    };

    hands.forEach((landmarks, index) => {
      const normalized = normalizeLandmarks(landmarks);
      if (!normalized) return;

      const label =
        handedness[index]?.classification?.[0]?.label || "Unknown";

      frame.hands.push({
        handedness: label,
        landmarks: normalized
      });
    });

    return frame;
  }

  function signatureFor(frame) {
    // Rounded landmark signature is only for stability tracking.
    // It is not a sign classifier.
    return JSON.stringify(
      frame.hands.map((hand) =>
        hand.landmarks.map((value) => Math.round(value * 8) / 8)
      )
    );
  }

  function updateStatus(frame) {
    if (!frame.hands.length) {
      setState("SEARCHING");
      setConfidence("NO HAND");
      log.textContent =
        "No hand detected. Improve lighting and keep your hands in frame.";
      lastLandmarkSignature = "";
      signatureSince = 0;
      motionWindow = [];
      return;
    }

    motionWindow.push(frame);
    if (motionWindow.length > WINDOW_SIZE) {
      motionWindow.shift();
    }

    const signature = signatureFor(frame);
    const now = performance.now();

    if (signature !== lastLandmarkSignature) {
      lastLandmarkSignature = signature;
      signatureSince = now;
    }

    const stable = now - signatureSince >= 350;

    setState(stable ? "TRACKING · STABLE" : "TRACKING");
    setConfidence(`${frame.hands.length} HAND${frame.hands.length > 1 ? "S" : ""}`);

    log.textContent =
      `${frame.hands.length} hand(s) tracked · ` +
      `${motionWindow.length}/${WINDOW_SIZE} motion frames collected. ` +
      "No sign prediction has been made.";
  }

  function showTrackingNotice() {
    if (!output) return;

    if (!output.textContent.trim() ||
        /hold a hand pose|recognized gestures will appear/i.test(output.textContent)) {
      output.textContent =
        "Hand landmarks are tracked. ISL recognition model not connected yet.";
    }
  }

  async function loadHandsLibrary() {
    if (window.Hands) return true;

    const sources = [
      {
        script: "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js",
        base: "https://cdn.jsdelivr.net/npm/@mediapipe/hands/"
      },
      {
        script: "https://unpkg.com/@mediapipe/hands/hands.js",
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
          script.onerror = () => reject(
            new Error("Could not load MediaPipe Hands.")
          );
          document.head.appendChild(script);
        });

        if (window.Hands) {
          return source.base;
        }
      } catch (error) {
        console.warn(error);
      }
    }

    throw new Error(
      "Could not load the hand-tracking library. Check your internet connection."
    );
  }

  async function start() {
    if (active) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Use HTTPS or localhost and allow camera access.");
      return;
    }

    const startButton = $("#startCamera");
    const stopButton = $("#stopCamera");

    if (startButton) startButton.disabled = true;
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

      const base = await loadHandsLibrary();

      model = new window.Hands({
        locateFile: (file) => `${base}${file}`
      });

      model.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65
      });

      model.onResults((results) => {
        if (!active) return;

        const hands = results.multiHandLandmarks || [];
        drawHands(hands);

        const frame = buildFrame(results);
        updateStatus(frame);

        if (frame.hands.length) showTrackingNotice();
      });

      active = true;
      if (placeholder) placeholder.style.display = "none";
      if (stopButton) stopButton.disabled = false;

      resizeCanvas();
      setState("SEARCHING");
      setConfidence("LOOKING FOR HAND");
      setStatus(
        "Tracking ready. This version collects landmarks; it does not yet identify ISL signs."
      );

      loop();
    } catch (error) {
      console.error("Aura Sign camera error:", error);

      active = false;

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      stream = null;
      video.srcObject = null;
      video.style.display = "none";

      if (placeholder) placeholder.style.display = "flex";
      if (startButton) startButton.disabled = false;
      if (stopButton) stopButton.disabled = true;

      setState("CAMERA ERROR");
      setStatus(error.message || "Camera setup failed.");
      app?.toast?.("Camera setup failed. Read the camera message.");
    }
  }

  async function loop() {
    if (!active) return;

    if (
      model &&
      video.readyState >= 2 &&
      !busy &&
      performance.now() - lastFrame >= 33
    ) {
      lastFrame = performance.now();
      busy = true;

      try {
        await model.send({ image: video });
      } catch (error) {
        console.warn("Frame skipped:", error);
      } finally {
        busy = false;
      }
    }

    if (active) raf = requestAnimationFrame(loop);
  }

  function stop() {
    active = false;

    if (raf) cancelAnimationFrame(raf);
    raf = 0;

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    stream = null;

    if (video) {
      video.srcObject = null;
      video.style.display = "none";
    }

    if (model) {
      try {
        model.close();
      } catch (error) {
        console.warn(error);
      }
    }

    model = null;
    busy = false;
    motionWindow = [];
    lastLandmarkSignature = "";

    clearOverlay();

    if (placeholder) placeholder.style.display = "flex";

    setState("CAMERA OFF");
    setConfidence("CAMERA OFF");
    setStatus("Camera stopped.");

    const startButton = $("#startCamera");
    const stopButton = $("#stopCamera");

    if (startButton) startButton.disabled = false;
    if (stopButton) stopButton.disabled = true;
  }

  // Collect a labelled example for future model training.
  // This stores coordinates, not a claim that the label is correct.
  function captureExample(label, kind = "alphabet") {
    const cleanLabel = String(label || "").trim().toUpperCase();

    if (!cleanLabel) {
      app?.toast?.("Enter a label first.");
      return false;
    }

    if (!motionWindow.length) {
      app?.toast?.("Start the camera and show your hand first.");
      return false;
    }

    trainingSamples.push({
      schemaVersion: 1,
      language: "ISL",
      kind,
      label: cleanLabel,
      capturedAt: new Date().toISOString(),
      frameCount: motionWindow.length,
      frames: motionWindow.map((frame) => ({
        hands: frame.hands.map((hand) => ({
          handedness: hand.handedness,
          landmarks: [...hand.landmarks]
        }))
      }))
    });

    app?.toast?.(`Captured example ${trainingSamples.length}.`);
    return true;
  }

  function downloadDataset() {
    if (!trainingSamples.length) {
      app?.toast?.("Capture some labelled examples first.");
      return;
    }

    const dataset = {
      format: "aura-sign-landmarks-v1",
      note:
        "User-labelled examples. Verify every label against a reliable ISL reference before training.",
      samples: trainingSamples
    };

    const blob = new Blob(
      [JSON.stringify(dataset, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "aura-sign-training-data.json";
    link.click();

    URL.revokeObjectURL(url);
    app?.toast?.(`Exported ${trainingSamples.length} examples.`);
  }

  function clearDataset() {
    trainingSamples = [];
    app?.toast?.("Captured training examples cleared.");
  }

  $("#startCamera")?.addEventListener("click", start);
  $("#stopCamera")?.addEventListener("click", stop);

  $("#clearRecognized")?.addEventListener("click", () => {
    if (output) {
      output.textContent =
        "Hand landmarks are tracked. ISL recognition model not connected yet.";
    }

    if (log) log.textContent = "No detections yet.";
    app?.toast?.("Output cleared.");
  });

  $("#copyRecognized")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(output?.textContent || "");
      app?.toast?.("Text copied.");
    } catch {
      app?.toast?.("Clipboard unavailable. Select and copy the text manually.");
    }
  });

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("beforeunload", stop);

  window.AuraCamera = {
    start,
    stop,
    normalizeLandmarks,
    captureExample,
    downloadDataset,
    clearDataset,
    getSampleCount: () => trainingSamples.length,
    getMotionWindow: () => motionWindow.map((frame) => structuredClone(frame))
  };

  resizeCanvas();
})();
