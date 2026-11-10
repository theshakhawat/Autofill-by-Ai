/**
 * AutoFill by Ai — Content Script (DOM Form Analyzer, Smart Injector & Bottom-Right Toast UI)
 * Features:
 *  - Scans <form> and standalone inputs, textareas, selects, radio groups, and checkboxes
 *  - Extracts labels (<label for>, parent <label>, aria-labelledby, adjacent text), placeholders, and constraints
 *  - Detects language hints (Bengali vs English) from labels/placeholders
 *  - Dispatches native + React/Vue/Angular synthetic input/change events so modern SPA forms update state
 *  - Displays a sleek Editorial Red & White bottom-right toast with loading.gif and completion summary
 */

(() => {
  if (window.__AUTOFILL_BY_AI_LOADED__) return;
  window.__AUTOFILL_BY_AI_LOADED__ = true;

  let trackedElements = new Map();
  let toastContainer = null;
  let toastHideTimer = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action === "PING") {
      sendResponse({ pong: true });
      return false;
    }

    if (message?.action === "SHOW_LOADING_TOAST") {
      showBottomRightToast({
        mode: "loading",
        title: "AutoFill by Ai কাজ করছে...",
        subtitle: `${message.providerName || "AI"} দিয়ে ফর্মের লেবেল ও প্লেসহোল্ডার এনালাইসিস করা হচ্ছে`
      });
      sendResponse({ ok: true });
      return false;
    }

    if (message?.action === "EXTRACT_FORM_FIELDS") {
      const result = extractFormFieldsFromDOM();
      sendResponse(result);
      return false;
    }

    if (message?.action === "APPLY_AUTOFILL_DATA") {
      const filledCount = applyAutofillValues(message.values || {});
      const meta = message.meta || {};
      const badgeText = meta.usedFallback
        ? `Fallback AI ব্যবহৃত হয়েছে: ${meta.usedProvider} (${meta.usedModel})`
        : `${meta.usedProvider} • ${meta.usedModel}`;

      showBottomRightToast({
        mode: "success",
        title: `${filledCount}টি ফিল্ড সফলভাবে অটোফিল হয়েছে!`,
        subtitle: badgeText
      });

      sendResponse({ ok: true, filledCount });
      return false;
    }

    if (message?.action === "SHOW_RESULT_TOAST") {
      showBottomRightToast({
        mode: message.status || "info",
        title: message.title || "AutoFill by Ai",
        subtitle: message.subtitle || ""
      });
      sendResponse({ ok: true });
      return false;
    }
  });

  /**
   * Scans the current document for all fillable form controls and extracts rich contextual hints.
   */
  function extractFormFieldsFromDOM() {
    trackedElements.clear();
    const fields = [];
    const seenRadioGroups = new Set();

    const candidates = Array.from(
      document.querySelectorAll("input, textarea, select")
    );

    let index = 0;
    for (const el of candidates) {
      if (!isElementFillable(el)) continue;

      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute("type") || (tag === "textarea" ? "textarea" : tag === "select" ? "select" : "text")).toLowerCase();

      // Group radio buttons by name so we pick one cohesive option per radio group
      if (type === "radio") {
        const groupName = el.name || `radio_idx_${index}`;
        if (seenRadioGroups.has(groupName)) continue;
        seenRadioGroups.add(groupName);

        const radios = Array.from(
          document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)
        ).filter(isElementFillable);

        const key = `f_${index++}`;
        trackedElements.set(key, { type: "radio-group", elements: radios });

        const groupLabel = findGroupOrFieldLabel(el);
        const options = radios.map((r) => ({
          value: r.value || "on",
          text: findLabelForElement(r) || r.value || ""
        }));

        fields.push({
          key,
          tag: "input",
          type: "radio",
          name: el.name || "",
          id: el.id || "",
          label: groupLabel,
          placeholder: "",
          options,
          languageHint: detectLanguageHint(groupLabel, "")
        });
        continue;
      }

      const key = `f_${index++}`;
      trackedElements.set(key, { type: "single", element: el });

      const label = findLabelForElement(el);
      const placeholder = el.getAttribute("placeholder") || "";
      const ariaLabel = el.getAttribute("aria-label") || "";
      const surroundingText = findSurroundingHintText(el, label);
      const langHint = detectLanguageHint(label, placeholder, surroundingText);

      const fieldDescriptor = {
        key,
        tag,
        type,
        name: el.getAttribute("name") || "",
        id: el.getAttribute("id") || "",
        label,
        placeholder,
        ariaLabel,
        surroundingText,
        languageHint: langHint,
        min: el.getAttribute("min") || "",
        max: el.getAttribute("max") || "",
        maxLength: el.maxLength > 0 && el.maxLength < 5000 ? el.maxLength : undefined,
        pattern: el.getAttribute("pattern") || ""
      };

      if (tag === "select") {
        fieldDescriptor.options = Array.from(el.options)
          .filter((opt) => !opt.disabled)
          .slice(0, 35)
          .map((opt) => ({
            value: opt.value,
            text: (opt.textContent || "").trim()
          }));
      }

      fields.push(fieldDescriptor);
    }

    return {
      fields,
      pageContext: {
        title: document.title || "",
        url: location.href
      }
    };
  }

  function isElementFillable(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "input") {
      const t = (el.getAttribute("type") || "text").toLowerCase();
      if (["hidden", "submit", "reset", "button", "image", "file"].includes(t)) {
        return false;
      }
    }
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  /**
   * Finds the human-readable label associated with an input/select/textarea
   */
  function findLabelForElement(el) {
    // 1. Explicit el.labels
    if (el.labels && el.labels.length > 0) {
      const text = Array.from(el.labels)
        .map((l) => cleanText(l.textContent))
        .filter(Boolean)
        .join(" ");
      if (text) return text;
    }

    // 2. <label for="id">
    if (el.id) {
      const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (byFor) {
        const text = cleanText(byFor.textContent);
        if (text) return text;
      }
    }

    // 3. Wrapped inside a <label>
    const parentLabel = el.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll("input, select, textarea, button").forEach((n) => n.remove());
      const text = cleanText(clone.textContent);
      if (text) return text;
    }

    // 4. aria-labelledby
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((node) => cleanText(node.textContent));
      if (parts.length) return parts.join(" ");
    }

    // 5. Previous sibling or parent container label / span / legend
    const prev = el.previousElementSibling;
    if (prev && ["LABEL", "SPAN", "DIV", "P", "STRONG", "TD", "TH"].includes(prev.tagName)) {
      const text = cleanText(prev.textContent);
      if (text && text.length <= 120) return text;
    }

    // 6. Field wrapper (.form-group, .field, .input-group, tr, div)
    const wrapper = el.closest(
      ".form-group, .form-field, .field, .input-box, .form-control-wrap, .mb-3, .mb-4, tr, fieldset"
    );
    if (wrapper) {
      const lbl = wrapper.querySelector("label, legend, .label, th");
      if (lbl) {
        const text = cleanText(lbl.textContent);
        if (text && text.length <= 120) return text;
      }
    }

    return "";
  }

  function findGroupOrFieldLabel(el) {
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) return cleanText(legend.textContent);
    }
    const wrapper = el.closest(".form-group, .field, .radio-group, div");
    if (wrapper) {
      const heading = wrapper.querySelector("label, .label, p, h4, h5, span");
      if (heading && !heading.contains(el)) {
        return cleanText(heading.textContent);
      }
    }
    return findLabelForElement(el);
  }

  function findSurroundingHintText(el, primaryLabel) {
    const parent = el.parentElement;
    if (!parent) return "";
    const clone = parent.cloneNode(true);
    clone.querySelectorAll("input, select, textarea, script, style, button").forEach((n) => n.remove());
    const raw = cleanText(clone.textContent);
    if (!raw || raw === primaryLabel) return "";
    return raw.slice(0, 140);
  }

  /**
   * Detects whether the field expects Bengali ("bn") or English ("en")
   */
  function detectLanguageHint(label = "", placeholder = "", surrounding = "") {
    const combined = `${label} ${placeholder} ${surrounding}`;

    // Explicit English directive even if label is written in Bangla
    if (/ইংরেজি|ইংরেজীতে|in\s*english|\(english\)|\(en\)/i.test(combined)) {
      return "en";
    }

    // Explicit Bangla directive even if label is in English
    if (/বাংলায়|বাংলাতে|বাংলা|in\s*bangla|in\s*bengali|\(bangla\)|\(bn\)/i.test(combined)) {
      return "bn";
    }

    // Check if the label or placeholder itself contains Bengali Unicode characters (\u0980-\u09FF)
    const bengaliCharRegex = /[\u0980-\u09FF]/;
    if (bengaliCharRegex.test(label) || bengaliCharRegex.test(placeholder)) {
      return "bn";
    }

    return "en";
  }

  function cleanText(str) {
    return (str || "").replace(/\s+/g, " ").trim();
  }

  /**
   * Injects AI-generated values into inputs and triggers native + framework events
   */
  function applyAutofillValues(valuesMap) {
    let filledCount = 0;

    for (const [key, val] of Object.entries(valuesMap)) {
      const tracked = trackedElements.get(key);
      if (!tracked) continue;

      try {
        if (tracked.type === "radio-group") {
          const radios = tracked.elements || [];
          let target =
            radios.find((r) => String(r.value).toLowerCase() === String(val).toLowerCase()) ||
            radios[0];
          if (target) {
            target.checked = true;
            dispatchFrameworkEvents(target);
            highlightFilledElement(target);
            filledCount++;
          }
          continue;
        }

        const el = tracked.element;
        if (!el) continue;

        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute("type") || "text").toLowerCase();

        if (type === "checkbox") {
          const shouldCheck =
            val === true ||
            val === "true" ||
            val === 1 ||
            String(val).toLowerCase() === String(el.value).toLowerCase();
          el.checked = Boolean(shouldCheck);
          dispatchFrameworkEvents(el);
          highlightFilledElement(el);
          filledCount++;
          continue;
        }

        if (tag === "select") {
          const strVal = String(val);
          const options = Array.from(el.options);
          let match =
            options.find((o) => o.value === strVal) ||
            options.find((o) => o.value.toLowerCase() === strVal.toLowerCase()) ||
            options.find((o) => o.textContent.trim().toLowerCase().includes(strVal.toLowerCase())) ||
            options.find((o) => o.value && !o.disabled);

          if (match) {
            el.value = match.value;
            dispatchFrameworkEvents(el);
            highlightFilledElement(el);
            filledCount++;
          }
          continue;
        }

        // Standard input / textarea
        let finalValue = String(val);
        if (type === "number") {
          // Strip non-numeric characters except minus & decimal for input[type="number"]
          const digitsOnly = finalValue.replace(/[^0-9.-]/g, "");
          if (digitsOnly) finalValue = digitsOnly;
        }

        setNativeValue(el, finalValue);
        dispatchFrameworkEvents(el);
        highlightFilledElement(el);
        filledCount++;
      } catch (e) {
        console.warn("[AutoFill by Ai] Failed filling field:", key, e);
      }
    }

    return filledCount;
  }

  /**
   * Uses native prototype value setter so React 16/17/18/19, Vue, and Angular detect state changes
   */
  function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

    if (valueSetter && valueSetter !== prototypeValueSetter && prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else {
      element.value = value;
    }
  }

  function dispatchFrameworkEvents(el) {
    el.dispatchEvent(new Event("focus", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function highlightFilledElement(el) {
    const prevTransition = el.style.transition;
    const prevBoxShadow = el.style.boxShadow;
    el.style.transition = "box-shadow 0.35s ease, border-color 0.35s ease";
    el.style.boxShadow = "0 0 0 2px rgba(217, 45, 32, 0.28)";
    setTimeout(() => {
      el.style.boxShadow = prevBoxShadow;
      el.style.transition = prevTransition;
    }, 1800);
  }

  /**
   * Bottom-Right Toast Notification UI (Shadow DOM isolated so page CSS never breaks it)
   */
  function showBottomRightToast({ mode = "success", title = "", subtitle = "" }) {
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "autofill-by-ai-toast-host";
      toastContainer.style.cssText =
        "position:fixed;bottom:22px;right:22px;z-index:2147483647;pointer-events:none;font-family:Inter,system-ui,-apple-system,sans-serif;";
      const shadow = toastContainer.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = `
        .af-toast {
          pointer-events: auto;
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 290px;
          max-width: 390px;
          background: #FFFFFF;
          color: #111827;
          border: 1px solid #FECACA;
          border-left: 4px solid #D92D20;
          border-radius: 12px;
          padding: 13px 16px;
          box-shadow: 0 12px 32px -6px rgba(180, 35, 24, 0.16), 0 4px 12px -2px rgba(17, 24, 39, 0.08);
          transform: translateY(16px);
          opacity: 0;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
        }
        .af-toast.visible {
          transform: translateY(0);
          opacity: 1;
        }
        .af-icon-wrap {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          background: #FEF2F2;
          border: 1px solid #FEE2E2;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          overflow: hidden;
        }
        .af-icon-wrap img {
          width: 26px;
          height: 26px;
          object-fit: contain;
        }
        .af-body {
          flex: 1;
          min-width: 0;
        }
        .af-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 2px;
        }
        .af-brand {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #D92D20;
        }
        .af-title {
          font-size: 13.5px;
          font-weight: 600;
          color: #111827;
          line-height: 1.35;
          margin: 0;
        }
        .af-subtitle {
          font-size: 12px;
          color: #4B5563;
          line-height: 1.4;
          margin: 3px 0 0 0;
          word-break: break-word;
        }
        .af-close {
          background: transparent;
          border: none;
          color: #9CA3AF;
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          font-size: 15px;
          line-height: 1;
        }
        .af-close:hover {
          color: #D92D20;
          background: #FEF2F2;
        }
      `;
      const wrapper = document.createElement("div");
      wrapper.className = "af-toast";
      wrapper.innerHTML = `
        <div class="af-icon-wrap" id="af-icon-slot"></div>
        <div class="af-body">
          <div class="af-header">
            <span class="af-brand">AutoFill by Ai</span>
          </div>
          <p class="af-title" id="af-title-slot"></p>
          <p class="af-subtitle" id="af-sub-slot"></p>
        </div>
        <button class="af-close" id="af-close-btn" title="বন্ধ করুন">✕</button>
      `;

      shadow.appendChild(style);
      shadow.appendChild(wrapper);
      document.documentElement.appendChild(toastContainer);

      shadow.getElementById("af-close-btn").addEventListener("click", () => {
        wrapper.classList.remove("visible");
      });
    }

    const shadow = toastContainer.shadowRoot;
    const toastEl = shadow.querySelector(".af-toast");
    const iconSlot = shadow.getElementById("af-icon-slot");
    const titleSlot = shadow.getElementById("af-title-slot");
    const subSlot = shadow.getElementById("af-sub-slot");

    if (mode === "loading") {
      const gifUrl = chrome.runtime.getURL("icons/loading.gif");
      iconSlot.innerHTML = `<img src="${gifUrl}" alt="Loading..." />`;
    } else if (mode === "success") {
      iconSlot.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D92D20" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6L9 17l-5-5"/>
        </svg>`;
    } else {
      iconSlot.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D92D20" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>`;
    }

    titleSlot.textContent = title;
    subSlot.textContent = subtitle;

    requestAnimationFrame(() => {
      toastEl.classList.add("visible");
    });

    if (toastHideTimer) clearTimeout(toastHideTimer);
    if (mode !== "loading") {
      toastHideTimer = setTimeout(() => {
        toastEl.classList.remove("visible");
      }, 5200);
    }
  }
})();
