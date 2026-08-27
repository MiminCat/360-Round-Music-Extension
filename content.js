(function () {
  let audioCtx = null;
  let sourceNode = null;
  let analyserNode = null;
  let leftAnalyser = null;
  let rightAnalyser = null;
  let bassFilter = null;
  let bassGain = null;
  let cinemaBassFilter = null;
  let cinemaBassGain = null;
  let cinemaWarmth = null;
  let cinemaWarmthGain = null;
  let cinemaEffectFilter = null;
  let cinemaComfortCompressor = null;
  let enhancementFilter = null;
  let movementToneFilter = null;
  let movementSparkleFilter = null;
  let vocalFilter = null;
  let vocalCompressor = null;
  let vocalPresence = null;
  let vocalCenter = null;
  let vocalPlateDelay = null;
  let vocalPlateFeedback = null;
  let vocalPlateFilter = null;
  let vocalPlateGain = null;
  let widthDelay = null;
  let widthGain = null;
  let movementPanner = null;
  let movementGain = null;
  let nativeGain = null;
  let reverbSend = null;
  let reverbPreDelay = null;
  let reverbFilter = null;
  let reverbGain = null;
  let cinemaReverb = null;
  let masterLimiter = null;
  let animationFrameId = null;
  let movementTimer = null;
  let angle = 0;
  let baseSpeed = 0.008;
  let enabled = true;
  let movementMode = "sweep";
  let spatialMaterial = false;
  let spectrumData = null;
  let leftData = null;
  let rightData = null;
  let bassProfile = 0;
  let vocalProfile = 0;
  let trebleProfile = 0;
  let motionPhase = 0;
  let targetMotionPhase = 0;
  let lastEnergy = 0;
  let targetX = 0;
  let targetY = 0;
  let targetZ = -1;
  let currentX = 0;
  let currentY = 0;
  let currentZ = -1;
  let velocityX = 0;
  let velocityY = 0;
  let velocityZ = 0;
  let nextTargetTime = 0;
  let lastTargetIndex = -1;

  function loadSettings(callback) {
    chrome.storage.local.get(["speed", "enabled", "movementMode"], (data) => {
      if (typeof data.speed === "number") baseSpeed = data.speed;
      if (typeof data.enabled === "boolean") enabled = data.enabled;
      movementMode = ["sweep", "orbit", "cinema"].includes(data.movementMode)
        ? data.movementMode
        : "sweep";
      callback();
    });
  }

  function createCinemaImpulseResponse() {
    const length = Math.floor(audioCtx.sampleRate * 2.4);
    const impulse = audioCtx.createBuffer(2, length, audioCtx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, 3.2) * 0.28;
      }
      data[Math.floor(audioCtx.sampleRate * (channel ? 0.041 : 0.029))] += 0.58;
      data[Math.floor(audioCtx.sampleRate * (channel ? 0.073 : 0.061))] += 0.34;
      data[Math.floor(audioCtx.sampleRate * (channel ? 0.119 : 0.103))] += 0.22;
    }
    return impulse;
  }

  function buildAudioGraph(videoElement) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(videoElement);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.8;
    spectrumData = new Uint8Array(analyserNode.frequencyBinCount);

    const splitter = audioCtx.createChannelSplitter(2);
    leftAnalyser = audioCtx.createAnalyser();
    rightAnalyser = audioCtx.createAnalyser();
    leftAnalyser.fftSize = 256;
    rightAnalyser.fftSize = 256;
    leftData = new Uint8Array(leftAnalyser.fftSize);
    rightData = new Uint8Array(rightAnalyser.fftSize);

    bassFilter = audioCtx.createBiquadFilter();
    bassFilter.type = "lowpass";
    bassFilter.frequency.value = 180;
    bassGain = audioCtx.createGain();
    bassGain.gain.value = 0.58;
    cinemaBassFilter = audioCtx.createBiquadFilter();
    cinemaBassFilter.type = "lowpass";
    cinemaBassFilter.frequency.value = 95;
    cinemaBassGain = audioCtx.createGain();
    cinemaBassGain.gain.value = 0;
    cinemaWarmth = audioCtx.createBiquadFilter();
    cinemaWarmth.type = "lowshelf";
    cinemaWarmth.frequency.value = 260;
    cinemaWarmth.gain.value = 0;
    cinemaWarmthGain = audioCtx.createGain();
    cinemaWarmthGain.gain.value = 0;
    cinemaEffectFilter = audioCtx.createBiquadFilter();
    cinemaEffectFilter.type = "highpass";
    cinemaEffectFilter.frequency.value = 850;
    cinemaComfortCompressor = audioCtx.createDynamicsCompressor();
    cinemaComfortCompressor.threshold.value = -18;
    cinemaComfortCompressor.knee.value = 12;
    cinemaComfortCompressor.ratio.value = 2.2;
    cinemaComfortCompressor.attack.value = 0.012;
    cinemaComfortCompressor.release.value = 0.18;
    enhancementFilter = audioCtx.createBiquadFilter();
    enhancementFilter.type = "highpass";
    enhancementFilter.frequency.value = 180;
    movementToneFilter = audioCtx.createBiquadFilter();
    movementToneFilter.type = "lowpass";
    movementToneFilter.frequency.value = 20000;
    movementSparkleFilter = audioCtx.createBiquadFilter();
    movementSparkleFilter.type = "highshelf";
    movementSparkleFilter.frequency.value = 6500;
    movementSparkleFilter.gain.value = 1.4;
    vocalFilter = audioCtx.createBiquadFilter();
    vocalFilter.type = "peaking";
    vocalFilter.frequency.value = 2200;
    vocalFilter.Q.value = 0.65;
    vocalFilter.gain.value = 1.4;
    vocalCompressor = audioCtx.createDynamicsCompressor();
    vocalCompressor.threshold.value = -20;
    vocalCompressor.knee.value = 12;
    vocalCompressor.ratio.value = 2.4;
    vocalCompressor.attack.value = 0.006;
    vocalCompressor.release.value = 0.12;
    vocalPresence = audioCtx.createGain();
    vocalPresence.gain.value = 0.12;
    vocalCenter = audioCtx.createStereoPanner();
    vocalCenter.pan.value = 0;
    vocalPlateDelay = audioCtx.createDelay(0.12);
    vocalPlateDelay.delayTime.value = 0.018;
    vocalPlateFeedback = audioCtx.createGain();
    vocalPlateFeedback.gain.value = 0.22;
    vocalPlateFilter = audioCtx.createBiquadFilter();
    vocalPlateFilter.type = "highpass";
    vocalPlateFilter.frequency.value = 420;
    vocalPlateGain = audioCtx.createGain();
    vocalPlateGain.gain.value = 0.11;
    widthDelay = audioCtx.createDelay(0.02);
    widthDelay.delayTime.value = 0.0012;
    widthGain = audioCtx.createGain();
    widthGain.gain.value = 0.14;
    movementPanner = audioCtx.createPanner();
    movementPanner.panningModel = "HRTF";
    movementPanner.distanceModel = "inverse";
    movementPanner.refDistance = 1;
    movementPanner.maxDistance = 10;
    movementPanner.rolloffFactor = 0.35;
    movementPanner.positionX.value = 0;
    movementPanner.positionY.value = 0;
    movementPanner.positionZ.value = -1;
    movementGain = audioCtx.createGain();
    nativeGain = audioCtx.createGain();
    nativeGain.gain.value = 0;
    reverbSend = audioCtx.createGain();
    reverbSend.gain.value = 0.24;
    reverbPreDelay = audioCtx.createDelay(0.12);
    reverbPreDelay.delayTime.value = 0.024;
    reverbFilter = audioCtx.createBiquadFilter();
    reverbFilter.type = "lowpass";
    reverbFilter.frequency.value = 7200;
    reverbGain = audioCtx.createGain();
    reverbGain.gain.value = 0;
    cinemaReverb = audioCtx.createConvolver();
    cinemaReverb.buffer = createCinemaImpulseResponse();
    masterLimiter = audioCtx.createDynamicsCompressor();
    masterLimiter.threshold.value = -3;
    masterLimiter.knee.value = 6;
    masterLimiter.ratio.value = 12;
    masterLimiter.attack.value = 0.003;
    masterLimiter.release.value = 0.12;

    sourceNode.connect(analyserNode);
    sourceNode.connect(splitter);
    splitter.connect(leftAnalyser, 0);
    splitter.connect(rightAnalyser, 1);

    sourceNode.connect(nativeGain).connect(cinemaComfortCompressor).connect(masterLimiter);
    sourceNode.connect(vocalFilter).connect(vocalCompressor).connect(vocalPresence).connect(vocalCenter).connect(masterLimiter);
    vocalFilter.connect(vocalPlateDelay);
    vocalPlateDelay.connect(vocalPlateFeedback).connect(vocalPlateFilter).connect(vocalPlateDelay);
    vocalPlateDelay.connect(vocalPlateGain).connect(masterLimiter);
    analyserNode.connect(bassFilter).connect(bassGain).connect(masterLimiter);
    sourceNode.connect(cinemaBassFilter).connect(cinemaBassGain).connect(movementPanner);
    sourceNode.connect(cinemaWarmth).connect(cinemaWarmthGain).connect(movementPanner);
    analyserNode.connect(enhancementFilter).connect(widthDelay).connect(widthGain).connect(masterLimiter);
    enhancementFilter.connect(cinemaEffectFilter).connect(movementToneFilter).connect(movementSparkleFilter).connect(movementPanner).connect(movementGain).connect(masterLimiter);
    movementPanner.connect(reverbSend);
    reverbSend.connect(reverbPreDelay).connect(reverbFilter).connect(cinemaReverb).connect(reverbGain).connect(masterLimiter);
    masterLimiter.connect(audioCtx.destination);

    startAdaptiveProcessing();
    startMovementTimer();
    if (!enabled) stopProcessing();
    else applyProfileLevels();
  }

  function applyProfileLevels() {
    if (!audioCtx || !cinemaBassGain || !cinemaWarmth) return;
    const now = audioCtx.currentTime;
    const cinema = movementMode === "cinema";
    cinemaBassGain.gain.setTargetAtTime(cinema && enabled ? 0.3 : 0, now, 0.18);
    cinemaWarmth.gain.setTargetAtTime(cinema && enabled ? 1.5 : 0, now, 0.18);
    cinemaWarmthGain.gain.setTargetAtTime(cinema && enabled ? 0.16 : 0, now, 0.18);
  }

  function detectSpatialMaterial() {
    leftAnalyser.getByteTimeDomainData(leftData);
    rightAnalyser.getByteTimeDomainData(rightData);
    let difference = 0;
    let energy = 0;
    for (let index = 0; index < leftData.length; index += 1) {
      difference += Math.abs(leftData[index] - rightData[index]);
      energy += Math.abs(leftData[index] - 128) + Math.abs(rightData[index] - 128);
    }
    return energy / (leftData.length * 255 * 2) > 0.015 &&
      difference / (leftData.length * 255) > 0.055;
  }

  function chooseSpatialTarget() {
    if (!audioCtx || movementMode !== "orbit") return;
    const targets = [
      [-2.6, 0.02, -0.7],
      [2.6, -0.02, -0.7],
      [-1.7, 0.2, -2.0],
      [1.7, -0.2, -2.0],
      [-0.35, 0.15, 2.4],
      [0.35, -0.15, 2.4],
      [-2.0, 0.8, 0.45],
      [2.0, 0.7, 0.45],
      [0, 1.4, -1.4],
      [0, -0.6, 1.8]
    ];
    let index = Math.floor(Math.random() * targets.length);
    if (index === lastTargetIndex) index = (index + 3) % targets.length;
    lastTargetIndex = index;
    [targetX, targetY, targetZ] = targets[index];
    nextTargetTime = performance.now() + 1800 + Math.random() * 1800;
  }

  function startAdaptiveProcessing() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    function process() {
      if (!audioCtx) return;
      analyserNode.getByteFrequencyData(spectrumData);
      let bassEnergy = 0;
      let vocalEnergy = 0;
      let trebleEnergy = 0;
      const bassLimit = Math.max(1, Math.floor(spectrumData.length * 0.08));
      const vocalLimit = Math.floor(spectrumData.length * 0.42);
      for (let index = 0; index < spectrumData.length; index += 1) {
        const energy = spectrumData[index] / 255;
        if (index < bassLimit) bassEnergy += energy;
        else if (index < vocalLimit) vocalEnergy += energy;
        else trebleEnergy += energy;
      }
      bassEnergy /= bassLimit;
      vocalEnergy /= Math.max(1, vocalLimit - bassLimit);
      trebleEnergy /= Math.max(1, spectrumData.length - vocalLimit);
      const energyChange = Math.abs((bassEnergy + trebleEnergy) - lastEnergy);
      if (energyChange > 0.12) {
        targetMotionPhase += (trebleEnergy - bassEnergy) * 0.5;
        targetMotionPhase = Math.max(-0.8, Math.min(0.8, targetMotionPhase));
        if (movementMode === "orbit" && performance.now() >= nextTargetTime) chooseSpatialTarget();
      }
      lastEnergy = bassEnergy + trebleEnergy;
      bassProfile += (bassEnergy - bassProfile) * 0.12;
      vocalProfile += (vocalEnergy - vocalProfile) * 0.1;
      trebleProfile += (trebleEnergy - trebleProfile) * 0.1;
      spatialMaterial = detectSpatialMaterial();
      const now = audioCtx.currentTime;
      if (enabled) {
        bassGain.gain.setTargetAtTime(Math.min(0.7, 0.48 + bassEnergy * 0.2), now, 0.08);
        nativeGain.gain.setTargetAtTime(
          movementMode === "cinema" ? 0.92 : spatialMaterial ? 0.18 : 0,
          now,
          0.18
        );
        widthGain.gain.setTargetAtTime(movementMode === "cinema" ? 0.08 : spatialMaterial ? 0.08 : 0.14, now, 0.12);
        vocalPresence.gain.setTargetAtTime(movementMode === "cinema" ? 0.1 : spatialMaterial ? 0.16 : 0.14, now, 0.12);
        vocalPlateGain.gain.setTargetAtTime(movementMode === "cinema" ? 0.08 : spatialMaterial ? 0.13 : 0.11, now, 0.16);
      }
      animationFrameId = requestAnimationFrame(process);
    }
    process();
  }

  function startMovementTimer() {
    if (movementTimer) clearInterval(movementTimer);
    movementTimer = setInterval(() => {
      if (!audioCtx || !enabled) return;
      const now = audioCtx.currentTime;
      if (movementMode === "cinema") {
        movementPanner.positionX.setTargetAtTime(0, now, 0.2);
        movementPanner.positionY.setTargetAtTime(0, now, 0.2);
        movementPanner.positionZ.setTargetAtTime(-1, now, 0.2);
        movementGain.gain.setTargetAtTime(0.22, now, 0.2);
        movementToneFilter.frequency.setTargetAtTime(20000, now, 0.2);
        movementSparkleFilter.gain.setTargetAtTime(1.6, now, 0.2);
        reverbGain.gain.setTargetAtTime(0.34, now, 0.25);
        return;
      }
      if (movementMode === "orbit" && performance.now() >= nextTargetTime) chooseSpatialTarget();
      if (movementMode === "cinema" && performance.now() >= nextTargetTime) {
        nextTargetTime = performance.now() + 5000 + Math.random() * 3000;
      }
        if (movementMode === "cinema") {
          angle += baseSpeed * 0.18;
          targetX = Math.sin(angle) * 1.8;
          targetY = Math.sin(angle * 0.43) * 0.16;
          targetZ = -Math.cos(angle) * 1.8;
        } else if (movementMode === "sweep") {
        angle += baseSpeed * 0.6;
        targetX = Math.sin(angle) * 0.9;
        targetY = 0;
        targetZ = -1;
      }
      const focusMode = baseSpeed <= 0.008;
      const smoothing = movementMode === "orbit" ? (focusMode ? 0.018 : 0.026) : movementMode === "cinema" ? 0.012 : 0.12;
      const damping = movementMode === "orbit" ? 0.72 : movementMode === "cinema" ? 0.84 : 0.7;
      const maxVelocity = movementMode === "orbit"
        ? (focusMode ? 0.045 : 0.075)
        : movementMode === "cinema" ? 0.025 : 0.08;
      velocityX = (velocityX + (targetX - currentX) * smoothing) * damping;
      velocityY = (velocityY + (targetY - currentY) * smoothing) * damping;
      velocityZ = (velocityZ + (targetZ - currentZ) * smoothing) * damping;
      velocityX = Math.max(-maxVelocity, Math.min(maxVelocity, velocityX));
      velocityY = Math.max(-maxVelocity, Math.min(maxVelocity, velocityY));
      velocityZ = Math.max(-maxVelocity, Math.min(maxVelocity, velocityZ));
      currentX += velocityX;
      currentY += velocityY;
      currentZ += velocityZ;
      const x = currentX;
      const z = currentZ;
      const frontIntensity = movementMode === "orbit" || movementMode === "cinema" ? Math.min(1, Math.max(0, -z) / 2.4) : 0;
      const backIntensity = movementMode === "orbit" || movementMode === "cinema" ? Math.min(1, Math.max(0, z) / 2.4) : 0;
      const distance = Math.sqrt(x * x + currentY * currentY + z * z);
      const distanceFactor = Math.min(1, Math.max(0, (distance - 0.8) / 3.4));
      const targetGain = movementMode === "cinema"
        ? 0.78 + frontIntensity * 0.12
        : movementMode === "orbit"
        ? 0.92 - distanceFactor * 0.4 + frontIntensity * 0.08
        : 0.92;
      const targetTone = movementMode === "orbit"
        ? 20000 - backIntensity * 8200 - Math.abs(x) * 1400
        : 20000 - Math.abs(x) * 4500;
      const targetRoom = movementMode === "cinema"
        ? 0.42 + distanceFactor * 0.22 - frontIntensity * 0.08
        : movementMode === "orbit"
        ? 0.3 + distanceFactor * (0.22 + Math.min(0.05, trebleProfile * 0.08)) - frontIntensity * 0.06
        : 0.35 + Math.abs(x) * 0.15;
      const targetSparkle = 1.2 + distanceFactor * 1.1 + trebleProfile * 0.8;
      movementPanner.positionX.setTargetAtTime(x, now, 0.16);
      movementPanner.positionY.setTargetAtTime(
        currentY,
        now,
        0.16
      );
      movementPanner.positionZ.setTargetAtTime(z, now, 0.16);
      movementGain.gain.setTargetAtTime(targetGain, now, 0.16);
      movementToneFilter.frequency.setTargetAtTime(Math.max(11800, targetTone), now, 0.16);
      movementSparkleFilter.gain.setTargetAtTime(Math.min(3.2, targetSparkle), now, 0.16);
      reverbGain.gain.setTargetAtTime(Math.max(0.22, targetRoom), now, 0.18);
      widthDelay.delayTime.setTargetAtTime(
        movementMode === "cinema" ? 0.002 + Math.abs(z) * 0.001 : movementMode === "orbit" ? 0.0012 + Math.abs(z) * 0.0012 : 0.0012,
        now,
        0.08
      );
    }, 100);
  }

  function stopProcessing() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    nativeGain.gain.setTargetAtTime(1, now, 0.08);
    movementGain.gain.setTargetAtTime(0, now, 0.08);
    reverbGain.gain.setTargetAtTime(0, now, 0.08);
    bassGain.gain.setTargetAtTime(0, now, 0.08);
    widthGain.gain.setTargetAtTime(0, now, 0.08);
    movementSparkleFilter.gain.setTargetAtTime(0, now, 0.08);
    cinemaBassGain.gain.setTargetAtTime(0, now, 0.08);
    cinemaWarmth.gain.setTargetAtTime(0, now, 0.08);
    cinemaWarmthGain.gain.setTargetAtTime(0, now, 0.08);
    vocalPresence.gain.setTargetAtTime(0, now, 0.08);
    vocalPlateGain.gain.setTargetAtTime(0, now, 0.08);
  }

  function resumeProcessing() {
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function applySettings(settings) {
    if (typeof settings.speed === "number") baseSpeed = settings.speed;
    if (["sweep", "orbit", "cinema"].includes(settings.movementMode)) movementMode = settings.movementMode;
    if (typeof settings.enabled === "boolean") enabled = settings.enabled;
    applyProfileLevels();
    if (enabled) resumeProcessing();
    else stopProcessing();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const settings = {};
    if (changes.speed) settings.speed = changes.speed.newValue;
    if (changes.enabled) settings.enabled = changes.enabled.newValue;
    if (changes.movementMode) settings.movementMode = changes.movementMode.newValue;
    applySettings(settings);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "UPDATE_SETTINGS") applySettings(message.settings || {});
  });

  function injectAudio() {
    const videoElement = document.querySelector("video");
    if (!videoElement || videoElement.dataset.advancedAudioConnected) return;
    try {
      videoElement.dataset.advancedAudioConnected = "true";
      buildAudioGraph(videoElement);
      resumeProcessing();
      console.log("16D adaptive audio aktif:", movementMode);
    } catch (error) {
      delete videoElement.dataset.advancedAudioConnected;
      console.warn("Gagal menginisialisasi audio spasial:", error);
    }
  }

  const observer = new MutationObserver(injectAudio);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  loadSettings(() => {
    setInterval(injectAudio, 2000);
    injectAudio();
  });
})();
