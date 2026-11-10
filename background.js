/**
 * AutoFill by Ai — Background Service Worker (Manifest V3)
 * Supports: Google Gemini, OpenAI, Anthropic, OpenRouter, NVIDIA NIM, Groq
 * Features:
 *  - One-click AutoFill when API key is configured; opens Settings if not configured
 *  - Dynamic Free/Available model discovery per provider
 *  - Automatic Primary AI -> Fallback AI failover for 100% reliability
 *  - Animated toolbar icon spinner (OffscreenCanvas) + Browser Notifications
 */

const PROVIDERS = {
  google: {
    id: "google",
    name: "Google Gemini",
    badge: "Free Tier Available",
    defaultModel: "gemini-2.0-flash",
    curatedModels: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Free Tier • Fast)", isFree: true },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (Free Tier • Recommended)", isFree: true },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite (Free Tier • Ultra Fast)", isFree: true },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash (Free Tier)", isFree: true },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", isFree: false }
    ]
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    badge: "Many Free Models",
    defaultModel: "google/gemini-2.0-flash-exp:free",
    curatedModels: [
      { id: "google/gemini-2.0-flash-exp:free", label: "Google: Gemini 2.0 Flash Exp (FREE)", isFree: true },
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Meta: Llama 3.3 70B Instruct (FREE)", isFree: true },
      { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek: V3 Chat (FREE)", isFree: true },
      { id: "qwen/qwen-2.5-72b-instruct:free", label: "Qwen 2.5 72B Instruct (FREE)", isFree: true },
      { id: "mistralai/mistral-small-3.1-24b-instruct:free", label: "Mistral Small 3.1 24B (FREE)", isFree: true },
      { id: "nvidia/llama-3.1-nemotron-nano-8b-v1:free", label: "NVIDIA Nemotron Nano 8B (FREE)", isFree: true }
    ]
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    badge: "Industry Standard",
    defaultModel: "gpt-4o-mini",
    curatedModels: [
      { id: "gpt-4o-mini", label: "GPT-4o Mini (Fast & Affordable)", isFree: false },
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", isFree: false },
      { id: "gpt-4.1-nano", label: "GPT-4.1 Nano (Ultra Fast)", isFree: false },
      { id: "gpt-4o", label: "GPT-4o", isFree: false },
      { id: "o3-mini", label: "o3-mini", isFree: false }
    ]
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic (Claude)",
    badge: "High Precision",
    defaultModel: "claude-3-5-haiku-latest",
    curatedModels: [
      { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku (Fastest)", isFree: false },
      { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet", isFree: false },
      { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", isFree: false }
    ]
  },
  nvidia: {
    id: "nvidia",
    name: "NVIDIA NIM",
    badge: "Free Developer Credits",
    defaultModel: "meta/llama-3.3-70b-instruct",
    curatedModels: [
      { id: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct (Free NIM Tier)", isFree: true },
      { id: "meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B Instruct (Free NIM Tier • Fast)", isFree: true },
      { id: "deepseek-ai/deepseek-r1-distill-llama-8b", label: "DeepSeek R1 Distill Llama 8B (Free NIM Tier)", isFree: true },
      { id: "qwen/qwen2.5-72b-instruct", label: "Qwen 2.5 72B Instruct (Free NIM Tier)", isFree: true },
      { id: "mistralai/mistral-nemotron", label: "Mistral Nemotron (Free NIM Tier)", isFree: true }
    ]
  },
  groq: {
    id: "groq",
    name: "Groq Cloud",
    badge: "Free API Tier • Instant",
    defaultModel: "llama-3.3-70b-versatile",
    curatedModels: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile (Free Tier • Instant)", isFree: true },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant (Free Tier • Ultra Fast)", isFree: true },
      { id: "gemma2-9b-it", label: "Gemma 2 9B IT (Free Tier)", isFree: true },
      { id: "qwen-qwq-32b", label: "Qwen QwQ 32B (Free Tier)", isFree: true }
    ]
  }
};

// Track active loading animations per tab
const activeSpinners = new Map();

// 1. Setup on install & create Context Menus
chrome.runtime.onInstalled.addListener(async (details) => {
  createContextMenus();

  const config = await chrome.storage.local.get(["primaryApiKey"]);
  if (details.reason === "install" && !config.primaryApiKey) {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus();
});

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "autofill-now",
      title: "⚡ AutoFill Current Form (AutoFill by Ai)",
      contexts: ["all"]
    });
    chrome.contextMenus.create({
      id: "autofill-settings",
      title: "⚙️ AutoFill by Ai — Settings & API Keys",
      contexts: ["all"]
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "autofill-settings") {
    chrome.runtime.openOptionsPage();
  } else if (info.menuItemId === "autofill-now" && tab?.id) {
    await handleToolbarClick(tab);
  }
});

// 2. Main Toolbar Icon Click Handler
chrome.action.onClicked.addListener(async (tab) => {
  await handleToolbarClick(tab);
});

async function handleToolbarClick(tab) {
  if (!tab || !tab.id) return;

  // Check if API key is configured
  const settings = await getStoredSettings();
  if (!settings.primaryApiKey || !settings.primaryApiKey.trim()) {
    chrome.runtime.openOptionsPage();
    return;
  }

  // Prevent run on restricted chrome:// or edge:// URLs
  if (!tab.url || /^(chrome|edge|about|chrome-extension):/i.test(tab.url)) {
    showBrowserNotification(
      "AutoFill by Ai — পেইজ সাপোর্টেড নয়",
      "ব্রাউজারের ইন্টারনাল পেইজে অটোফিল কাজ করবে না। যেকোনো ওয়েব ফর্ম পেইজে গিয়ে ক্লিক করুন।"
    );
    return;
  }

  // Prevent duplicate concurrent runs on the same tab
  if (activeSpinners.has(tab.id)) {
    return;
  }

  try {
    startIconLoadingAnimation(tab.id);

    // Ensure content script is injected and ready
    await ensureContentScript(tab.id);

    // Notify content script to show bottom-right loading state
    await sendMessageToTab(tab.id, {
      action: "SHOW_LOADING_TOAST",
      providerName: PROVIDERS[settings.primaryProvider]?.name || settings.primaryProvider
    });

    // Step 1: Extract all form fields and contextual metadata from the page
    const extraction = await sendMessageToTab(tab.id, {
      action: "EXTRACT_FORM_FIELDS"
    });

    if (!extraction || !extraction.fields || extraction.fields.length === 0) {
      stopIconLoadingAnimation(tab.id);
      await sendMessageToTab(tab.id, {
        action: "SHOW_RESULT_TOAST",
        status: "warning",
        title: "কোনো ইনপুট ফিল্ড পাওয়া যায়নি!",
        subtitle: "এই পেইজে অটোফিল করার মতো কোনো ফর্ম বা ইনপুট বক্স খুঁজে পাওয়া যায়নি।"
      });
      showBrowserNotification(
        "AutoFill by Ai — কোনো ফর্ম পাওয়া যায়নি",
        "এই পেইজে কোনো ইনপুট ফিল্ড খুঁজে পাওয়া যায়নি।"
      );
      return;
    }

    // Step 2: Analyze with AI (Primary -> Fallback if needed)
    const aiResult = await generateFormFillValuesWithFailover(
      extraction.fields,
      extraction.pageContext,
      settings
    );

    // Step 3: Apply generated values into the DOM
    const fillResponse = await sendMessageToTab(tab.id, {
      action: "APPLY_AUTOFILL_DATA",
      values: aiResult.values,
      meta: {
        usedProvider: aiResult.usedProviderName,
        usedModel: aiResult.usedModel,
        usedFallback: aiResult.usedFallback,
        primaryError: aiResult.primaryError || null
      }
    });

    stopIconLoadingAnimation(tab.id);

    const filledCount = fillResponse?.filledCount || Object.keys(aiResult.values || {}).length;
    const providerBadge = aiResult.usedFallback
      ? `Fallback: ${aiResult.usedProviderName} (${aiResult.usedModel})`
      : `${aiResult.usedProviderName} (${aiResult.usedModel})`;

    // Trigger Browser System Notification
    showBrowserNotification(
      "AutoFill by Ai — সফলভাবে সম্পন্ন হয়েছে!",
      `মোট ${filledCount}টি ফিল্ড অটোফিল করা হয়েছে [${providerBadge}]।`
    );
  } catch (err) {
    stopIconLoadingAnimation(tab.id);
    const errMsg = err?.message || "অজানা ত্রুটি ঘটেছে। API Key বা মডেল চেক করুন।";
    try {
      await sendMessageToTab(tab.id, {
        action: "SHOW_RESULT_TOAST",
        status: "error",
        title: "অটোফিল সম্পন্ন করা যায়নি",
        subtitle: errMsg
      });
    } catch (_) {}
    showBrowserNotification("AutoFill by Ai — ত্রুটি", errMsg);
  }
}

// 3. Message Listener for Options UI (Model Discovery & Test Connection)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === "FETCH_MODELS") {
    fetchAvailableModels(message.provider, message.apiKey)
      .then((res) => sendResponse({ ok: true, ...res }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }

  if (message?.action === "GET_PROVIDERS_CATALOG") {
    sendResponse({ ok: true, providers: PROVIDERS });
    return false;
  }

  if (message?.action === "OPEN_OPTIONS_PAGE") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (message?.action === "TRIGGER_AUTOFILL_FROM_PAGE") {
    if (sender?.tab) {
      handleToolbarClick(sender.tab);
      sendResponse({ ok: true });
    }
    return false;
  }
});

// 4. Settings Helper
async function getStoredSettings() {
  const defaults = {
    primaryProvider: "google",
    primaryApiKey: "",
    primaryModel: "gemini-2.0-flash",
    enableFallback: true,
    fallbackProvider: "openrouter",
    fallbackApiKey: "",
    fallbackModel: "google/gemini-2.0-flash-exp:free",
    enableSmartLocalEmergencyFallback: true,
    defaultLocaleHint: "auto"
  };
  const data = await chrome.storage.local.get(Object.keys(defaults));
  return { ...defaults, ...data };
}

// 5. Dynamic Model Discovery per Provider
async function fetchAvailableModels(providerId, apiKey) {
  const provider = PROVIDERS[providerId] || PROVIDERS.google;
  const trimmedKey = (apiKey || "").trim();

  if (!trimmedKey) {
    return {
      models: provider.curatedModels,
      source: "curated",
      note: "API Key দিলে লাইভ মডেল লিস্ট লোড হবে। আপাতত জনপ্রিয় ও ফ্রি মডেলগুলো দেখানো হচ্ছে।"
    };
  }

  try {
    if (providerId === "google") {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmedKey)}`
      );
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody?.error?.message || `Google API Error (${resp.status})`);
      }
      const data = await resp.json();
      const liveModels = (data.models || [])
        .filter((m) =>
          (m.supportedGenerationMethods || []).includes("generateContent") &&
          /gemini/i.test(m.name) &&
          !/embedding|vision-only|aqa/i.test(m.name)
        )
        .map((m) => {
          const id = m.name.replace(/^models\//, "");
          const isFree = /flash/i.test(id);
          return {
            id,
            label: `${m.displayName || id}${isFree ? " (Free Tier Available)" : ""}`,
            isFree
          };
        });

      // Sort free/flash models first
      liveModels.sort((a, b) => Number(b.isFree) - Number(a.isFree));
      return {
        models: liveModels.length ? liveModels : provider.curatedModels,
        source: "live",
        note: `সফলভাবে ${liveModels.length}টি মডেল লোড হয়েছে (ফ্রি টিয়ার মডেলগুলো আগে দেখানো হয়েছে)।`
      };
    }

    if (providerId === "openrouter") {
      const resp = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${trimmedKey}` }
      });
      if (!resp.ok) throw new Error(`OpenRouter Error (${resp.status})`);
      const data = await resp.json();
      const all = data.data || [];
      const parsed = all
        .filter((m) => {
          const pPrompt = parseFloat(m?.pricing?.prompt ?? "1");
          const pComp = parseFloat(m?.pricing?.completion ?? "1");
          return m.id.endsWith(":free") || (pPrompt === 0 && pComp === 0);
        })
        .map((m) => ({
          id: m.id,
          label: `${m.name || m.id} [FREE]`,
          isFree: true
        }));

      // Also include popular low-cost models after free models
      const merged = [...parsed];
      for (const c of provider.curatedModels) {
        if (!merged.some((x) => x.id === c.id)) merged.unshift(c);
      }
      return {
        models: merged.slice(0, 60),
        source: "live",
        note: `OpenRouter থেকে ${merged.slice(0, 60).length}টি ফ্রি মডেল পাওয়া গেছে!`
      };
    }

    if (providerId === "openai" || providerId === "groq" || providerId === "nvidia") {
      const baseUrl =
        providerId === "openai"
          ? "https://api.openai.com/v1/models"
          : providerId === "groq"
          ? "https://api.groq.com/openai/v1/models"
          : "https://integrate.api.nvidia.com/v1/models";

      const resp = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${trimmedKey}` }
      });
      if (!resp.ok) throw new Error(`${provider.name} API Error (${resp.status})`);
      const data = await resp.json();
      const rawList = data.data || [];
      const filtered = rawList
        .filter((m) => !/whisper|tts|dall-e|embedding|moderation|guard|rerank/i.test(m.id))
        .map((m) => {
          const isFree = providerId === "groq" || providerId === "nvidia";
          return {
            id: m.id,
            label: `${m.id}${isFree ? " (Free Tier)" : ""}`,
            isFree
          };
        });

      // Put curated models at top so best text models appear first
      const topIds = new Set(provider.curatedModels.map((c) => c.id));
      const ordered = [
        ...provider.curatedModels,
        ...filtered.filter((f) => !topIds.has(f.id))
      ].slice(0, 50);

      return {
        models: ordered,
        source: "live",
        note: `${provider.name} থেকে লাইভ মডেল লিস্ট ভেরিফাই ও লোড করা হয়েছে।`
      };
    }

    if (providerId === "anthropic") {
      const resp = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": trimmedKey,
          "anthropic-version": "2023-06-01"
        }
      });
      if (resp.ok) {
        const data = await resp.json();
        const models = (data.data || []).map((m) => ({
          id: m.id,
          label: `${m.display_name || m.id}`,
          isFree: false
        }));
        if (models.length) {
          return {
            models,
            source: "live",
            note: `Anthropic থেকে ${models.length}টি মডেল লোড হয়েছে।`
          };
        }
      }
      return {
        models: provider.curatedModels,
        source: "curated",
        note: "Anthropic Claude মডেল লিস্ট প্রস্তুত রয়েছে।"
      };
    }
  } catch (err) {
    // Return curated models alongside the warning so user can still pick a model
    return {
      models: provider.curatedModels,
      source: "curated_fallback",
      warning: err.message,
      note: `লাইভ এন্ডপয়েন্ট রেসপন্স করেনি (${err.message}) — ডিফল্ট মডেল লিস্ট দেখানো হচ্ছে।`
    };
  }

  return { models: provider.curatedModels, source: "curated" };
}

// 6. Primary -> Fallback AI Failover Orchestrator
async function generateFormFillValuesWithFailover(fields, pageContext, settings) {
  const prompt = buildFormAnalysisPrompt(fields, pageContext);
  let primaryError = null;

  // Attempt 1: Primary AI Provider
  try {
    const rawValues = await callProviderEndpoint({
      providerId: settings.primaryProvider,
      apiKey: settings.primaryApiKey,
      model: settings.primaryModel || PROVIDERS[settings.primaryProvider]?.defaultModel,
      prompt
    });

    const validated = sanitizeAiOutput(rawValues, fields);
    if (Object.keys(validated).length === 0) {
      throw new Error("Primary AI কোনো ভ্যালিড ডাটা রিটার্ন করেনি।");
    }

    return {
      values: validated,
      usedProviderName: PROVIDERS[settings.primaryProvider]?.name || settings.primaryProvider,
      usedModel: settings.primaryModel,
      usedFallback: false
    };
  } catch (err) {
    primaryError = err?.message || "Primary AI failed";
    console.warn("[AutoFill by Ai] Primary AI error:", primaryError);
  }

  // Attempt 2: Configured Fallback AI Provider
  if (
    settings.enableFallback &&
    settings.fallbackApiKey &&
    settings.fallbackApiKey.trim()
  ) {
    try {
      const fallbackModel =
        settings.fallbackModel || PROVIDERS[settings.fallbackProvider]?.defaultModel;
      const rawFallbackValues = await callProviderEndpoint({
        providerId: settings.fallbackProvider,
        apiKey: settings.fallbackApiKey,
        model: fallbackModel,
        prompt
      });

      const validatedFallback = sanitizeAiOutput(rawFallbackValues, fields);
      if (Object.keys(validatedFallback).length > 0) {
        return {
          values: validatedFallback,
          usedProviderName:
            PROVIDERS[settings.fallbackProvider]?.name || settings.fallbackProvider,
          usedModel: fallbackModel,
          usedFallback: true,
          primaryError
        };
      }
    } catch (fallbackErr) {
      console.warn("[AutoFill by Ai] Fallback AI error:", fallbackErr?.message);
      primaryError = `Primary (${primaryError}) & Fallback (${fallbackErr?.message}) উভয়ই ব্যর্থ হয়েছে।`;
    }
  }

  // Attempt 3: Smart Emergency Contextual Engine (if enabled, ensures 100% fill guarantee even if API quota is exhausted)
  if (settings.enableSmartLocalEmergencyFallback !== false) {
    const emergencyValues = generateSmartContextualEmergencyValues(fields);
    if (Object.keys(emergencyValues).length > 0) {
      return {
        values: emergencyValues,
        usedProviderName: "Smart Built-in Engine",
        usedModel: "Emergency Fallback",
        usedFallback: true,
        primaryError
      };
    }
  }

  throw new Error(primaryError || "AI রেসপন্স করতে ব্যর্থ হয়েছে। সেটিংস থেকে API Key বা Fallback AI চেক করুন।");
}

// 7. Prompt Builder — Context-Aware, Bengali/English Script Sensitive, Semantic Field Matching
function buildFormAnalysisPrompt(fields, pageContext) {
  const simplifiedFields = fields.map((f) => {
    const item = {
      key: f.key,
      tag: f.tag,
      type: f.type,
      label: f.label || "",
      placeholder: f.placeholder || "",
      name: f.name || "",
      id: f.id || "",
      ariaLabel: f.ariaLabel || "",
      surroundingText: f.surroundingText || "",
      languageHint: f.languageHint || "en"
    };
    if (f.options && f.options.length > 0) item.options = f.options;
    if (f.min !== undefined && f.min !== "") item.min = f.min;
    if (f.max !== undefined && f.max !== "") item.max = f.max;
    if (f.maxLength && f.maxLength > 0) item.maxLength = f.maxLength;
    if (f.pattern) item.pattern = f.pattern;
    return item;
  });

  return `You are "AutoFill by Ai", an expert semantic form autofill assistant for web developers testing forms.
Analyze the following HTML form fields from page "${pageContext?.title || "Web Form"}" (${pageContext?.url || ""}) and return a single JSON object mapping each field's "key" to its realistic autofill value.

CRITICAL RULES YOU MUST FOLLOW:
1. COHESIVE PERSONA: Use ONE consistent Bangladeshi/International test persona across the entire form!
   - Example English persona: Full Name = "Abdul Korim", First Name = "Abdul", Last Name = "Korim", Father's Name = "Md. Rafiqul Islam", Mother's Name = "Rokeya Begum", Email = "abdul.korim@example.com", Username = "abdul_korim96".
   - Example Bengali persona (when field label/placeholder asks for Bengali or is written in Bengali): Full Name = "আব্দুল করিম", First Name = "আব্দুল", Last Name = "করিম", Father's Name = "মোঃ রফিকুল ইসলাম", Mother's Name = "রোকেয়া বেগম", Address = "বাড়ি ১২, রোড ৫, ধানমন্ডি, ঢাকা-১২০৯".
2. LANGUAGE SENSITIVITY (BENGALI vs ENGLISH):
   - Inspect each field's "label", "placeholder", "surroundingText", and "languageHint".
   - If the label/placeholder explicitly asks for Bangla/Bengali (e.g., "বাংলায়", "in Bangla", "নাম (বাংলা)") OR if the label/placeholder is written in Bengali script and the input is a text/textarea field for name, address, organization, or comments, provide the value in BENGALI script (e.g., "আব্দুল করিম").
   - If the label/placeholder asks for English (e.g., "ইংরেজিতে", "in English", "Full Name", "First Name") or is in English, provide the value in ENGLISH (e.g., "Abdul Korim").
   - NOTE: Technical fields like email, url, date, time, color, or numeric input[type="number"] MUST always use standard ASCII digits/formats so browser validation succeeds.
3. SEMANTIC PRECISION OVER INPUT TYPE (NEVER CONFUSE NID WITH PHONE):
   - Even if an input has type="number" or type="text", read the label/placeholder carefully!
   - NID / National ID / জাতীয় পরিচয়পত্র নাম্বার / Smart Card: ALWAYS generate a realistic 10-digit or 13-digit Bangladesh NID number (e.g., "1996269481203" or "4658291047"), NEVER a mobile phone number!
   - Birth Certificate / জন্ম নিবন্ধন নাম্বার: 17-digit number (e.g., "19982694812034512").
   - Phone / Mobile / মোবাইল নাম্বার: Valid Bangladeshi mobile number (e.g., "01712345678" or "+8801712345678" if international format is requested; if type="number", use digits only "01712345678").
   - Postal / Zip Code / পোস্ট কোড: Valid 4-digit BD postcode (e.g., "1209").
   - TIN / Tax ID: 12-digit TIN (e.g., "548921034812").
   - Age / বয়স: Realistic age (e.g., "28").
   - Year / পাস করার সন: Realistic 4-digit year (e.g., "2019").
   - GPA / CGPA: Realistic GPA (e.g., "4.85" or "3.75" depending on scale).
   - Password & Confirm Password: Must match each other EXACTLY (e.g., "Test@Pass2026!").
4. SELECT / RADIO / CHECKBOX / DATE FIELDS:
   - For <select> fields with "options": return the exact "value" of one valid non-empty option from its "options" list.
   - For type="date": return "YYYY-MM-DD" (e.g., "1997-05-14" for Date of Birth, or a valid date).
   - For type="checkbox": return boolean true (or the option value).
   - For type="radio": return one valid value from its options.
5. OUTPUT FORMAT:
   - Return ONLY a valid JSON object where each property key is the field's "key" (e.g. "f_0", "f_1") and the value is the string/boolean to fill. No markdown fences, no extra explanation.

FIELDS TO ANALYZE:
${JSON.stringify(simplifiedFields, null, 2)}`;
}

// 8. Unified API Caller across all 6 Providers
async function callProviderEndpoint({ providerId, apiKey, model, prompt }) {
  const trimmedKey = (apiKey || "").trim();
  if (!trimmedKey) {
    throw new Error(`${providerId} এর জন্য API Key সেট করা নেই।`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 28000);

  try {
    if (providerId === "google") {
      const targetModel = (model || "gemini-2.0-flash").replace(/^models\//, "");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        targetModel
      )}:generateContent?key=${encodeURIComponent(trimmedKey)}`;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(
          errData?.error?.message || `Gemini HTTP ${resp.status}`
        );
      }

      const data = await resp.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      return parseJsonFromAiText(text);
    }

    if (providerId === "anthropic") {
      const targetModel = model || "claude-3-5-haiku-latest";
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": trimmedKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: targetModel,
          max_tokens: 2048,
          temperature: 0.2,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(
          errData?.error?.message || `Anthropic HTTP ${resp.status}`
        );
      }

      const data = await resp.json();
      const text = (data?.content || []).map((c) => c.text || "").join("");
      return parseJsonFromAiText(text);
    }

    // OpenAI-compatible providers: OpenAI, OpenRouter, NVIDIA NIM, Groq
    let endpoint = "https://api.openai.com/v1/chat/completions";
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${trimmedKey}`
    };

    if (providerId === "openrouter") {
      endpoint = "https://openrouter.ai/api/v1/chat/completions";
      headers["HTTP-Referer"] = "https://autofill-by-ai.local";
      headers["X-Title"] = "AutoFill by Ai Chrome Extension";
    } else if (providerId === "nvidia") {
      endpoint = "https://integrate.api.nvidia.com/v1/chat/completions";
    } else if (providerId === "groq") {
      endpoint = "https://api.groq.com/openai/v1/chat/completions";
    }

    const bodyPayload = {
      model: model || PROVIDERS[providerId]?.defaultModel || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a precise JSON generator for web form autofilling. Always respond with valid JSON only."
        },
        { role: "user", content: prompt }
      ]
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify(bodyPayload)
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(
        errData?.error?.message || `${providerId} HTTP ${resp.status}`
      );
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || "";
    return parseJsonFromAiText(text);
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseJsonFromAiText(rawText) {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("AI থেকে খালি রেসপন্স এসেছে।");
  }
  const cleaned = rawText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Extract first {...} block
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("AI রেসপন্স JSON ফরম্যাটে পার্স করা যায়নি।");
  }
}

function sanitizeAiOutput(aiObj, fields) {
  if (!aiObj || typeof aiObj !== "object") return {};
  const result = {};
  const validKeys = new Set(fields.map((f) => f.key));
  for (const [k, v] of Object.entries(aiObj)) {
    if (validKeys.has(k) && v !== null && v !== undefined) {
      result[k] = v;
    }
  }
  return result;
}

// 9. Smart Contextual Emergency Engine (Guarantees 100% completion even if both API keys are rate-limited)
function generateSmartContextualEmergencyValues(fields) {
  const out = {};
  for (const f of fields) {
    const combined = `${f.label || ""} ${f.placeholder || ""} ${f.name || ""} ${f.id || ""} ${f.ariaLabel || ""} ${f.surroundingText || ""}`.toLowerCase();
    const isBangla = f.languageHint === "bn";

    if (f.tag === "select" && Array.isArray(f.options) && f.options.length > 0) {
      const nonEmpty = f.options.filter((o) => o.value && !/select|choose|নির্বাচন/i.test(o.text));
      out[f.key] = (nonEmpty[0] || f.options[0]).value;
      continue;
    }
    if (f.type === "checkbox") {
      out[f.key] = true;
      continue;
    }
    if (f.type === "radio" && Array.isArray(f.options) && f.options.length > 0) {
      out[f.key] = f.options[0].value;
      continue;
    }
    if (f.type === "password" || /password|পাসওয়ার্ড/i.test(combined)) {
      out[f.key] = "Test@Pass2026!";
      continue;
    }
    if (/nid|national\s*id|জাতীয়\s*পরিচয়|এনআইডি|smart\s*card/i.test(combined)) {
      out[f.key] = "1996269481203";
      continue;
    }
    if (/birth\s*reg|জন্ম\s*নিবন্ধন/i.test(combined)) {
      out[f.key] = "19982694812034512";
      continue;
    }
    if (/tin|tax\s*id|টিআইএন/i.test(combined)) {
      out[f.key] = "548921034812";
      continue;
    }
    if (f.type === "email" || /e-?mail|ইমেইল/i.test(combined)) {
      out[f.key] = "abdul.korim@example.com";
      continue;
    }
    if (f.type === "tel" || /phone|mobile|cell|contact\s*no|মোবাইল|ফোন/i.test(combined)) {
      out[f.key] = "01712345678";
      continue;
    }
    if (/first\s*name|given\s*name|নামের\s*প্রথম/i.test(combined)) {
      out[f.key] = isBangla ? "আব্দুল" : "Abdul";
      continue;
    }
    if (/last\s*name|surname|family\s*name|নামের\s*শেষ|পদবী/i.test(combined)) {
      out[f.key] = isBangla ? "করিম" : "Korim";
      continue;
    }
    if (/father|পিতা|বাবার/i.test(combined)) {
      out[f.key] = isBangla ? "মোঃ রফিকুল ইসলাম" : "Md. Rafiqul Islam";
      continue;
    }
    if (/mother|মাতা|মায়ের/i.test(combined)) {
      out[f.key] = isBangla ? "রোকেয়া বেগম" : "Rokeya Begum";
      continue;
    }
    if (/username|user\s*id|ইউজারনেম/i.test(combined)) {
      out[f.key] = "abdul_korim96";
      continue;
    }
    if (/name|নাম/i.test(combined)) {
      out[f.key] = isBangla ? "আব্দুল করিম" : "Abdul Korim";
      continue;
    }
    if (/post\s*code|zip|postal|পোস্ট\s*কোড/i.test(combined)) {
      out[f.key] = "1209";
      continue;
    }
    if (/city|district|zilla|জেলা|শহর/i.test(combined)) {
      out[f.key] = isBangla ? "ঢাকা" : "Dhaka";
      continue;
    }
    if (/address|street|location|ঠিকানা/i.test(combined)) {
      out[f.key] = isBangla
        ? "বাড়ি ১২, রোড ৫, ধানমন্ডি, ঢাকা-১২০৯"
        : "House 12, Road 5, Dhanmondi, Dhaka-1209";
      continue;
    }
    if (/company|organization|institute|প্রতিষ্ঠান|কোম্পানি/i.test(combined)) {
      out[f.key] = isBangla ? "নেক্সটজেন সফটওয়্যার লিমিটেড" : "NextGen Software Ltd.";
      continue;
    }
    if (f.type === "url" || /website|portfolio|linkedin|github|ওয়েবসাইট/i.test(combined)) {
      out[f.key] = "https://abdulkorim.dev";
      continue;
    }
    if (f.type === "date" || /dob|birth\s*date|জন্ম\s*তারিখ|date/i.test(combined)) {
      out[f.key] = "1996-08-15";
      continue;
    }
    if (f.type === "number" || /age|বয়স/i.test(combined)) {
      out[f.key] = "28";
      continue;
    }
    out[f.key] = isBangla
      ? "টেস্টিং পারপাসে অটোফিল করা ডাটা"
      : "Sample test data for form verification";
  }
  return out;
}

// 10. Animated Toolbar Icon Spinner (OffscreenCanvas) + Badge
function startIconLoadingAnimation(tabId) {
  let frame = 0;
  chrome.action.setBadgeBackgroundColor({ color: "#D92D20", tabId });
  chrome.action.setBadgeText({ text: "AI", tabId });

  const intervalId = setInterval(() => {
    try {
      const size = 32;
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext("2d");

      // Crisp white rounded background with crimson border
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.roundRect(1, 1, size - 2, size - 2, 7);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#D92D20";
      ctx.stroke();

      // Rotating crimson spinner arc
      const cx = size / 2;
      const cy = size / 2;
      const r = 9;
      const startAngle = (frame * Math.PI) / 6;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";

      // Faint track
      ctx.strokeStyle = "rgba(217, 45, 32, 0.18)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Active arc
      ctx.strokeStyle = "#D92D20";
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, startAngle + Math.PI * 1.3);
      ctx.stroke();

      // Center pulsing dot
      ctx.fillStyle = "#B42318";
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();

      const imageData = ctx.getImageData(0, 0, size, size);
      chrome.action.setIcon({ imageData: { 32: imageData }, tabId });
      frame = (frame + 1) % 12;
    } catch (_) {}
  }, 80);

  activeSpinners.set(tabId, intervalId);
}

function stopIconLoadingAnimation(tabId) {
  const intervalId = activeSpinners.get(tabId);
  if (intervalId) {
    clearInterval(intervalId);
    activeSpinners.delete(tabId);
  }
  try {
    chrome.action.setIcon({
      path: {
        16: "icons/icon16.png",
        32: "icons/icon32.png",
        48: "icons/icon48.png",
        128: "icons/icon128.png"
      },
      tabId
    });
    chrome.action.setBadgeText({ text: "", tabId });
  } catch (_) {}
}

// 11. Browser System Notification Helper
function showBrowserNotification(title, message) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title,
      message,
      priority: 1
    });
  } catch (_) {}
}

// 12. Tab Messaging & Content Script Injection Helper
async function ensureContentScript(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { action: "PING" });
    if (ping?.pong) return true;
  } catch (_) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  }
  return true;
}

function sendMessageToTab(tabId, payload) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
