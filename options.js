/**
 * AutoFill by Ai — Options & Onboarding Controller (options.js)
 * Handles:
 *  - Selecting Primary & Fallback AI platforms
 *  - Auto-fetching free/available models when API key is entered or button clicked
 *  - Persisting settings in chrome.storage.local
 *  - Triggering live test autofill on the built-in developer playground form
 */

const PROVIDER_NAMES = {
  google: "Google Gemini",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
  nvidia: "NVIDIA NIM",
  groq: "Groq Cloud"
};

let currentPrimaryProvider = "google";
let debouncePrimaryTimer = null;
let debounceFallbackTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  const providerCards = Array.from(document.querySelectorAll(".provider-card"));
  const primaryProviderLabel = document.getElementById("primary-provider-label");
  const primaryApiKeyInput = document.getElementById("primary-api-key");
  const primaryModelSelect = document.getElementById("primary-model-select");
  const primaryModelStatus = document.getElementById("primary-model-status");
  const primaryKeyHint = document.getElementById("primary-key-hint");

  const enableFallbackCheck = document.getElementById("enable-fallback");
  const fallbackBody = document.getElementById("fallback-body");
  const fallbackProviderSelect = document.getElementById("fallback-provider-select");
  const fallbackApiKeyInput = document.getElementById("fallback-api-key");
  const fallbackModelSelect = document.getElementById("fallback-model-select");
  const fallbackModelStatus = document.getElementById("fallback-model-status");
  const enableEmergencyCheck = document.getElementById("enable-emergency-fallback");

  const saveBtn = document.getElementById("save-settings-btn");
  const saveFeedback = document.getElementById("save-feedback");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");

  // 1. Load saved settings from chrome.storage.local
  const stored = await chrome.storage.local.get([
    "primaryProvider",
    "primaryApiKey",
    "primaryModel",
    "enableFallback",
    "fallbackProvider",
    "fallbackApiKey",
    "fallbackModel",
    "enableSmartLocalEmergencyFallback"
  ]);

  currentPrimaryProvider = stored.primaryProvider || "google";
  primaryApiKeyInput.value = stored.primaryApiKey || "";
  enableFallbackCheck.checked = stored.enableFallback !== false;
  fallbackProviderSelect.value = stored.fallbackProvider || "openrouter";
  fallbackApiKeyInput.value = stored.fallbackApiKey || "";
  enableEmergencyCheck.checked = stored.enableSmartLocalEmergencyFallback !== false;

  updateActiveProviderCard(currentPrimaryProvider);
  toggleFallbackSection(enableFallbackCheck.checked);
  updateTopStatusPill(Boolean(stored.primaryApiKey), currentPrimaryProvider, stored.primaryModel);

  // Load initial models for Primary & Fallback
  await loadModelsForTarget("primary", currentPrimaryProvider, primaryApiKeyInput.value, stored.primaryModel);
  await loadModelsForTarget("fallback", fallbackProviderSelect.value, fallbackApiKeyInput.value, stored.fallbackModel);

  // 2. Provider Card Click
  providerCards.forEach((card) => {
    card.addEventListener("click", async () => {
      const provider = card.getAttribute("data-provider");
      currentPrimaryProvider = provider;
      updateActiveProviderCard(provider);
      await loadModelsForTarget("primary", provider, primaryApiKeyInput.value);
    });
  });

  function updateActiveProviderCard(provider) {
    providerCards.forEach((c) => {
      c.classList.toggle("active", c.getAttribute("data-provider") === provider);
    });
    primaryProviderLabel.textContent = PROVIDER_NAMES[provider] || provider;
  }

  // 3. Auto-load models when typing/pasting API Key
  primaryApiKeyInput.addEventListener("input", () => {
    clearTimeout(debouncePrimaryTimer);
    debouncePrimaryTimer = setTimeout(() => {
      loadModelsForTarget("primary", currentPrimaryProvider, primaryApiKeyInput.value);
    }, 550);
  });

  document.getElementById("fetch-primary-models-btn").addEventListener("click", () => {
    loadModelsForTarget("primary", currentPrimaryProvider, primaryApiKeyInput.value);
  });

  fallbackProviderSelect.addEventListener("change", () => {
    loadModelsForTarget("fallback", fallbackProviderSelect.value, fallbackApiKeyInput.value);
  });

  fallbackApiKeyInput.addEventListener("input", () => {
    clearTimeout(debounceFallbackTimer);
    debounceFallbackTimer = setTimeout(() => {
      loadModelsForTarget("fallback", fallbackProviderSelect.value, fallbackApiKeyInput.value);
    }, 550);
  });

  document.getElementById("fetch-fallback-models-btn").addEventListener("click", () => {
    loadModelsForTarget("fallback", fallbackProviderSelect.value, fallbackApiKeyInput.value);
  });

  // 4. Show / Hide API Key Buttons
  document.getElementById("toggle-primary-key").addEventListener("click", (e) => {
    const isPwd = primaryApiKeyInput.type === "password";
    primaryApiKeyInput.type = isPwd ? "text" : "password";
    e.target.textContent = isPwd ? "Hide Key" : "Show Key";
  });

  document.getElementById("toggle-fallback-key").addEventListener("click", (e) => {
    const isPwd = fallbackApiKeyInput.type === "password";
    fallbackApiKeyInput.type = isPwd ? "text" : "password";
    e.target.textContent = isPwd ? "Hide Key" : "Show Key";
  });

  // 5. Fallback Toggle
  enableFallbackCheck.addEventListener("change", () => {
    toggleFallbackSection(enableFallbackCheck.checked);
  });

  function toggleFallbackSection(enabled) {
    fallbackBody.style.opacity = enabled ? "1" : "0.45";
    fallbackBody.style.pointerEvents = enabled ? "auto" : "none";
  }

  // 6. Save Settings Button
  saveBtn.addEventListener("click", async () => {
    const payload = {
      primaryProvider: currentPrimaryProvider,
      primaryApiKey: primaryApiKeyInput.value.trim(),
      primaryModel: primaryModelSelect.value,
      enableFallback: enableFallbackCheck.checked,
      fallbackProvider: fallbackProviderSelect.value,
      fallbackApiKey: fallbackApiKeyInput.value.trim(),
      fallbackModel: fallbackModelSelect.value,
      enableSmartLocalEmergencyFallback: enableEmergencyCheck.checked
    };

    await chrome.storage.local.set(payload);
    updateTopStatusPill(Boolean(payload.primaryApiKey), payload.primaryProvider, payload.primaryModel);

    saveFeedback.textContent = "✓ সেটিংস সফলভাবে লোকাল স্টোরেজে সেভ হয়েছে!";
    setTimeout(() => {
      saveFeedback.textContent = "";
    }, 4000);
  });

  // 7. Live Demo AutoFill Button on the Options Page
  document.getElementById("trigger-demo-autofill").addEventListener("click", async () => {
    // Save current inputs first so the user can test immediately
    const payload = {
      primaryProvider: currentPrimaryProvider,
      primaryApiKey: primaryApiKeyInput.value.trim(),
      primaryModel: primaryModelSelect.value,
      enableFallback: enableFallbackCheck.checked,
      fallbackProvider: fallbackProviderSelect.value,
      fallbackApiKey: fallbackApiKeyInput.value.trim(),
      fallbackModel: fallbackModelSelect.value,
      enableSmartLocalEmergencyFallback: enableEmergencyCheck.checked
    };
    await chrome.storage.local.set(payload);
    updateTopStatusPill(Boolean(payload.primaryApiKey), payload.primaryProvider, payload.primaryModel);

    chrome.runtime.sendMessage({ action: "TRIGGER_AUTOFILL_FROM_PAGE" });
  });

  // Helper: Fetch and populate model select dropdown
  async function loadModelsForTarget(target, provider, apiKey, preferredModel = "") {
    const selectEl = target === "primary" ? primaryModelSelect : fallbackModelSelect;
    const badgeEl = target === "primary" ? primaryModelStatus : fallbackModelStatus;

    badgeEl.textContent = "লোড হচ্ছে...";
    selectEl.innerHTML = `<option value="">মডেল লোড হচ্ছে...</option>`;

    try {
      const res = await chrome.runtime.sendMessage({
        action: "FETCH_MODELS",
        provider,
        apiKey
      });

      const models = res?.models || [];
      selectEl.innerHTML = "";

      models.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.label || m.id;
        selectEl.appendChild(opt);
      });

      if (preferredModel && models.some((m) => m.id === preferredModel)) {
        selectEl.value = preferredModel;
      } else if (models.length > 0) {
        selectEl.value = models[0].id;
      }

      const freeCount = models.filter((m) => m.isFree).length;
      badgeEl.textContent =
        res?.source === "live"
          ? `Live • ${models.length} Models`
          : `${models.length} Models (${freeCount} Free)`;

      if (target === "primary" && res?.note) {
        primaryKeyHint.textContent = res.note;
      }
    } catch (err) {
      badgeEl.textContent = "Default List";
    }
  }

  function updateTopStatusPill(hasKey, provider, model) {
    if (hasKey) {
      statusDot.classList.add("ready");
      statusText.textContent = `Ready • ${PROVIDER_NAMES[provider] || provider} (${model || "Active"})`;
    } else {
      statusDot.classList.remove("ready");
      statusText.textContent = "API Key সেট করা হয়নি — নিচে সেট করুন";
    }
  }
});
