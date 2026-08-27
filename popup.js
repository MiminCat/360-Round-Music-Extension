const MODE_SPEEDS = {
  sleep: 0.003,
  focus: 0.008,
  normal: 0.015
};

const speedSlider = document.getElementById("speedSlider");
const speedValue = document.getElementById("speedValue");
const enabledToggle = document.getElementById("enabledToggle");
const movementMode = document.getElementById("movementMode");
const modeButtons = document.querySelectorAll(".mode-btn");

function saveAndBroadcast(settings) {
  chrome.storage.local.set(settings);
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (typeof tab.id !== "number" || !/^https?:\/\//i.test(tab.url || "")) {
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: "UPDATE_SETTINGS", settings }, () => {
        void chrome.runtime.lastError;
      });
    });
  });
}

// Muat pengaturan tersimpan saat popup dibuka
chrome.storage.local.get(["speed", "enabled", "movementMode"], (data) => {
  const speed = typeof data.speed === "number" ? data.speed : MODE_SPEEDS.focus;
  speedSlider.value = speed;
  speedValue.textContent = speed.toFixed(3);
  enabledToggle.checked = data.enabled !== false;
  movementMode.value = ["sweep", "orbit", "cinema"].includes(data.movementMode)
    ? data.movementMode
    : "sweep";
  highlightActiveMode(speed);
});

function highlightActiveMode(speed) {
  modeButtons.forEach((btn) => {
    const modeSpeed = MODE_SPEEDS[btn.dataset.mode];
    btn.classList.toggle("active", Math.abs(modeSpeed - speed) < 0.0005);
  });
}

speedSlider.addEventListener("input", () => {
  const value = parseFloat(speedSlider.value);
  speedValue.textContent = value.toFixed(3);
  saveAndBroadcast({ speed: value });
  highlightActiveMode(value);
});

enabledToggle.addEventListener("change", () => {
  saveAndBroadcast({ enabled: enabledToggle.checked });
});

movementMode.addEventListener("change", () => {
  saveAndBroadcast({ movementMode: movementMode.value });
});

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const speed = MODE_SPEEDS[btn.dataset.mode];
    speedSlider.value = speed;
    speedValue.textContent = speed.toFixed(3);
    saveAndBroadcast({ speed });
    highlightActiveMode(speed);
  });
});
