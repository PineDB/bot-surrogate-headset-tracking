const robots = [
  ...Array.from({ length: 40 }, (_, idx) => `B-${String(idx + 1).padStart(3, "0")}`),
  ...Array.from({ length: 41 }, (_, idx) => `C-${String(idx + 100)}`),
];

const surrogates = [
  ...Array.from({ length: 40 }, (_, idx) => `TB-${String(idx + 1).padStart(3, "0")}`),
  ...Array.from({ length: 40 }, (_, idx) => `TC-${String(idx + 1).padStart(3, "0")}`),
];

const headsets = Array.from({ length: 40 }, (_, idx) => String(idx + 1));
const locations = ["Room A", "Room B", "Room C", "Room D", "Room E", "UPS"];

const placeholders = {
  location: "Select location",
  robot: "Select robot",
  surrogate: "Select surrogate",
  headset: "Select headset",
};

const fieldLabels = {
  name: "Name",
  location: "Location",
  robot: "Robot",
  surrogate: "Surrogate",
  headset: "Headset",
};

function createOption(value, label, { isPlaceholder = false } = {}) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  if (isPlaceholder) {
    option.disabled = true;
    option.selected = true;
  }
  return option;
}

const robotLookup = new Map();
const surrogateLookup = new Map();
const TYPEAHEAD_DELAY = 2000; // milliseconds
const typeaheadConfigs = new WeakMap();
let lastTypeaheadSelect = null;
const confirmModal = {
  overlay: null,
  title: null,
  detail: null,
  confirmBtn: null,
  cancelBtn: null,
  current: null,
};
let modalKeyHandler = null;
const downloadModal = {
  overlay: null,
  form: null,
  startInput: null,
  endInput: null,
  cancelBtn: null,
};
let downloadModalKeyHandler = null;

function normalizedKey(raw) {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function registerLookupValue(map, value, { includeDigitsOnly = false } = {}) {
  const keyBase = normalizedKey(value);
  const digits = keyBase.replace(/\D/g, "");
  const prefix = keyBase.replace(/\d/g, "");
  const number = digits ? String(parseInt(digits, 10)) : "";
  const keys = new Set();

  keys.add(keyBase);
  if (prefix && digits) {
    keys.add(`${prefix}${digits}`);
    if (number) {
      keys.add(`${prefix}${number}`);
    }
  }
  if (prefix && !map.has(prefix)) {
    map.set(prefix, value);
  }

  if (digits) {
    keys.add(digits);
    if (digits.length < 3) {
      keys.add(digits.padStart(3, "0"));
    }
  }
  if (number) {
    keys.add(number);
  }

  keys.forEach((key) => {
    if (!key) return;
    if (map.has(key)) return;
    map.set(key, value);
  });

  if (includeDigitsOnly && digits) {
    const stripped = digits.replace(/^0+/, "") || "0";
    if (!map.has(stripped)) {
      map.set(stripped, value);
    }
  }
}

function registerRobotValue(value) {
  registerLookupValue(robotLookup, value, { includeDigitsOnly: true });
}

function registerSurrogateValue(value) {
  registerLookupValue(surrogateLookup, value, { includeDigitsOnly: true });
}

function lookupValue(map, query) {
  const key = normalizedKey(query);
  if (!key) return null;
  const stripped = key.replace(/^0+/, "") || "0";
  return map.get(key) || map.get(stripped) || null;
}

const requiredFieldKeys = ["name", "location", "robot", "surrogate", "headset"];

function findMissingFields(payload) {
  return requiredFieldKeys
    .filter((key) => {
      const value = payload[key];
      if (typeof value === "boolean") return false;
      return String(value ?? "").trim() === "";
    })
    .map((key) => fieldLabels[key]);
}

function displayValue(value, fallback = "—") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function resetFormFields(form) {
  if (!form) return;
  form.reset();
  const selects = form.querySelectorAll("select");
  selects.forEach((select) => {
    const placeholder = select.querySelector("option[disabled]");
    if (placeholder) {
      placeholder.selected = true;
    } else {
      select.selectedIndex = 0;
    }
  });
}

function initConfirmModal() {
  confirmModal.overlay = document.getElementById("confirm-overlay");
  confirmModal.title = document.getElementById("confirm-title");
  confirmModal.detail = document.getElementById("confirm-detail");
  confirmModal.confirmBtn = document.getElementById("confirm-yes");
  confirmModal.cancelBtn = document.getElementById("confirm-no");

  if (!confirmModal.overlay) return;

  const handleCancel = () => {
    const current = confirmModal.current;
    hideConfirmModal();
    if (current?.onCancel) {
      current.onCancel();
    }
  };

  modalKeyHandler = (event) => {
    if (event.key === "Escape") {
      handleCancel();
    }
  };

  const handleConfirm = async () => {
    const current = confirmModal.current;
    hideConfirmModal();
    if (current?.onConfirm) {
      try {
        await current.onConfirm();
      } catch (error) {
        const message = error?.message || "Action failed.";
        setStatus(message, "error");
      }
    }
  };

  confirmModal.confirmBtn.addEventListener("click", handleConfirm);
  confirmModal.cancelBtn.addEventListener("click", handleCancel);
  confirmModal.overlay.addEventListener("click", (event) => {
    if (event.target === confirmModal.overlay) {
      handleCancel();
    }
  });
}

function showConfirmModal({
  title,
  detail = "",
  confirmLabel = "Yes",
  cancelLabel = "No",
  onConfirm,
  onCancel,
}) {
  if (!confirmModal.overlay) return;
  confirmModal.current = { onConfirm, onCancel };
  if (confirmModal.title) {
    confirmModal.title.textContent = title || "";
  }
  if (confirmModal.detail) {
    confirmModal.detail.textContent = detail;
  }
  confirmModal.confirmBtn.textContent = confirmLabel;
  confirmModal.cancelBtn.textContent = cancelLabel;
  confirmModal.overlay.classList.add("visible");
  confirmModal.overlay.setAttribute("aria-hidden", "false");
  confirmModal.confirmBtn.focus();
  document.addEventListener("keydown", modalKeyHandler);
}

function hideConfirmModal() {
  if (!confirmModal.overlay) return;
  confirmModal.overlay.classList.remove("visible");
  confirmModal.overlay.setAttribute("aria-hidden", "true");
  if (confirmModal.detail) {
    confirmModal.detail.textContent = "";
  }
  confirmModal.current = null;
  document.removeEventListener("keydown", modalKeyHandler);
}

function initDownloadModal() {
  downloadModal.overlay = document.getElementById("download-overlay");
  downloadModal.form = document.getElementById("download-form");
  downloadModal.startInput = document.getElementById("download-start");
  downloadModal.endInput = document.getElementById("download-end");
  downloadModal.cancelBtn = document.getElementById("download-cancel");

  if (
    !downloadModal.overlay ||
    !downloadModal.form ||
    !downloadModal.startInput ||
    !downloadModal.endInput
  ) {
    return;
  }

  downloadModalKeyHandler = (event) => {
    if (event.key === "Escape") {
      hideDownloadModal();
    }
  };

  downloadModal.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const startValue = downloadModal.startInput.value;
    const endValue = downloadModal.endInput.value;

    const startInfo = parseDateInput(startValue);
    if (startValue && !startInfo) {
      setStatus("Invalid start date/time.", "error");
      return;
    }
    const endInfo = parseDateInput(endValue);
    if (endValue && !endInfo) {
      setStatus("Invalid end date/time.", "error");
      return;
    }
    if (startInfo && endInfo && startInfo.date > endInfo.date) {
      setStatus("Start date must be before end date.", "error");
      return;
    }

    hideDownloadModal();
    downloadCsvFile({
      start: startInfo ? startInfo.iso : undefined,
      end: endInfo ? endInfo.iso : undefined,
    });
  });

  downloadModal.cancelBtn?.addEventListener("click", () => hideDownloadModal());
  downloadModal.overlay.addEventListener("click", (event) => {
    if (event.target === downloadModal.overlay) {
      hideDownloadModal();
    }
  });
}

function showDownloadModal() {
  if (!downloadModal.overlay) return;
  downloadModal.form?.reset();
  downloadModal.overlay.classList.add("visible");
  downloadModal.overlay.setAttribute("aria-hidden", "false");
  downloadModal.startInput?.focus();
  document.addEventListener("keydown", downloadModalKeyHandler);
}

function hideDownloadModal() {
  if (!downloadModal.overlay) return;
  downloadModal.overlay.classList.remove("visible");
  downloadModal.overlay.setAttribute("aria-hidden", "true");
  document.removeEventListener("keydown", downloadModalKeyHandler);
}

function parseDateInput(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return { date, iso: date.toISOString() };
}

function resetTypeahead(config) {
  if (!config) return;
  if (config.timeoutId) {
    clearTimeout(config.timeoutId);
  }
  config.timeoutId = null;
  config.buffer = "";
}

function commitTypeahead(config) {
  if (!config || !config.buffer) return;
  const value = config.matcher(config.buffer);
  if (value) {
    config.select.value = value;
    config.select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  resetTypeahead(config);
}

function registerTypeahead(select, matcher) {
  const config = { matcher, buffer: "", timeoutId: null, select };
  typeaheadConfigs.set(select, config);

  select.addEventListener("focus", () => {
    lastTypeaheadSelect = select;
    resetTypeahead(config);
  });
  select.addEventListener("pointerdown", () => {
    lastTypeaheadSelect = select;
  });

  select.addEventListener("blur", () => {
    if (lastTypeaheadSelect === select) {
      lastTypeaheadSelect = null;
    }
    resetTypeahead(config);
  });
}

function handleTypeaheadKeydown(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  let select = null;
  if (event.target instanceof HTMLSelectElement && typeaheadConfigs.has(event.target)) {
    select = event.target;
  } else if (document.activeElement instanceof HTMLSelectElement && typeaheadConfigs.has(document.activeElement)) {
    select = document.activeElement;
  } else if (lastTypeaheadSelect && typeaheadConfigs.has(lastTypeaheadSelect)) {
    select = lastTypeaheadSelect;
  } else {
    return;
  }

  const config = typeaheadConfigs.get(select);
  if (!config) return;

  const key = event.key;

  if (key === "Tab") {
    resetTypeahead(config);
    lastTypeaheadSelect = null;
    return;
  }

  const shouldPrevent = event.target === select;

  if (key === "Escape") {
    resetTypeahead(config);
    lastTypeaheadSelect = null;
    if (shouldPrevent) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }

  if (key === "Backspace") {
    if (config.buffer) {
      config.buffer = config.buffer.slice(0, -1);
      if (config.timeoutId) {
        clearTimeout(config.timeoutId);
      }
      config.timeoutId = setTimeout(() => commitTypeahead(config), TYPEAHEAD_DELAY);
      if (shouldPrevent) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    return;
  }

  if (key === "Enter") {
    commitTypeahead(config);
    if (shouldPrevent) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }

  if (key.length !== 1) return;

  config.buffer += key;
  if (config.timeoutId) {
    clearTimeout(config.timeoutId);
  }
  config.timeoutId = setTimeout(() => commitTypeahead(config), TYPEAHEAD_DELAY);
  if (shouldPrevent) {
    event.preventDefault();
    event.stopPropagation();
  }
}

document.addEventListener("keydown", handleTypeaheadKeydown, true);

function populateSelect(select, options, placeholderText, registerFn = null) {
  select.innerHTML = "";
  const placeholder = createOption("", placeholderText, { isPlaceholder: true });
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);
  options.forEach((value) => {
    const option = createOption(value, value);
    select.appendChild(option);
    if (typeof registerFn === "function") {
      registerFn(value);
    }
  });
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function setStatus(message, type = "info") {
  const status = document.getElementById("status-message");
  status.textContent = message;
  status.style.color = type === "error" ? "#c44536" : "#3248c5";
}

function renderEntries(entries) {
  const list = document.getElementById("entry-list");
  list.innerHTML = "";

  if (!entries.length) {
    const emptyState = document.createElement("li");
    emptyState.className = "entry-item";
    emptyState.textContent = "No saved entries yet.";
    list.appendChild(emptyState);
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "entry-item";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "entry-delete";
    deleteBtn.textContent = "×";
    deleteBtn.setAttribute("aria-label", "Delete entry");
    deleteBtn.dataset.entryId = entry.id;
    deleteBtn.dataset.entryName = entry.name || "";
    item.appendChild(deleteBtn);

    const nameEl = document.createElement("strong");
    nameEl.textContent = displayValue(entry.name, "Unnamed");
    item.appendChild(nameEl);

    const breakdown = document.createElement("ul");
    breakdown.className = "entry-breakdown";

    const rows = [
      { label: "Timestamp", value: formatDate(entry.timestamp) },
      { label: "Location", value: displayValue(entry.location) },
      { label: "Robot", value: displayValue(entry.robot) },
      { label: "Surrogate", value: displayValue(entry.surrogate) },
      { label: "Headset", value: displayValue(entry.headset) },
      { label: "Headset on surrogate", value: entry.headsetOnSurrogate ? "Yes" : "No" },
    ];

    rows.forEach(({ label, value }) => {
      const row = document.createElement("li");
      row.className = "entry-line";
      row.innerHTML = `<span class="entry-label">${label}:</span> <span class="entry-value">${value}</span>`;
      breakdown.appendChild(row);
    });

    item.appendChild(breakdown);

    list.appendChild(item);
  });
}

async function fetchEntries(openPanel = false) {
  try {
    const response = await fetch("/api/entries");
    if (!response.ok) throw new Error("Unable to load saved entries");
    const data = await response.json();
    const entries = Array.isArray(data.entries)
      ? [...data.entries].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      : [];
    renderEntries(entries);
    if (openPanel) {
      document.getElementById("save-panel").classList.add("open");
    }
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const elements = form.elements;
  const payload = {
    name: elements["name"].value.trim(),
    location: elements["location"].value,
    robot: elements["robot"].value,
    surrogate: elements["surrogate"].value,
    headset: elements["headset"].value,
    headsetOnSurrogate: elements["headset_on_surrogate"].checked,
  };

  const missing = findMissingFields(payload);
  if (missing.length) {
    showConfirmModal({
      title: "Not all fields entered, save anyway?",
      detail: `Missing: ${missing.join(", ")}`,
      onConfirm: () => submitEntry(payload, { form, openPanel: true }),
      onCancel: () => setStatus("Save canceled.", "error"),
    });
    return;
  }

  await submitEntry(payload, { form, openPanel: true });
}

function initPanel() {
  const panel = document.getElementById("save-panel");
  const toggleBtn = document.getElementById("toggle-saves");
  const closeBtn = document.getElementById("close-panel");

  toggleBtn.addEventListener("click", () => {
    const shouldOpen = !panel.classList.contains("open");
    panel.classList.toggle("open");
    if (shouldOpen) {
      fetchEntries();
    }
  });

  closeBtn.addEventListener("click", () => panel.classList.remove("open"));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      panel.classList.remove("open");
    }
  });
}

async function submitEntry(payload, { form, openPanel }) {
  try {
    const response = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Unable to save entry");
    }

    resetFormFields(form);
    setStatus("Entry saved.");
    await fetchEntries(openPanel);
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function deleteEntryRequest(entryId) {
  if (!entryId) return;
  try {
    const response = await fetch(`/api/entries/${entryId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Unable to delete entry");
    }
    setStatus("Entry deleted.");
    const panel = document.getElementById("save-panel");
    const isOpen = panel.classList.contains("open");
    await fetchEntries(isOpen);
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function downloadCsvFile({ start, end } = {}) {
  try {
    const params = new URLSearchParams();
    if (start) params.append("start", start);
    if (end) params.append("end", end);
    const query = params.toString();
    const response = await fetch(`/api/entries/export${query ? `?${query}` : ""}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Unable to download CSV.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const filename = `equipment_entries_${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}.csv`;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("CSV download started.");
  } catch (error) {
    setStatus(error.message || "Unable to download CSV.", "error");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const locationSelect = document.getElementById("location");
  const robotSelect = document.getElementById("robot");
  const surrogateSelect = document.getElementById("surrogate");
  const headsetSelect = document.getElementById("headset");

  populateSelect(locationSelect, locations, placeholders.location);
  populateSelect(robotSelect, robots, placeholders.robot, registerRobotValue);
  populateSelect(surrogateSelect, surrogates, placeholders.surrogate, registerSurrogateValue);
  populateSelect(headsetSelect, headsets, placeholders.headset);

  const entryList = document.getElementById("entry-list");
  entryList.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest(".entry-delete");
    if (!deleteBtn) return;
    const entryId = deleteBtn.dataset.entryId;
    if (!entryId) return;
    const entryName = deleteBtn.dataset.entryName?.trim();
    showConfirmModal({
      title: "Delete this entry?",
      detail: entryName ? `Entry: ${entryName}` : "",
      onConfirm: () => deleteEntryRequest(entryId),
    });
  });

  initConfirmModal();
  initDownloadModal();

  registerTypeahead(robotSelect, (query) => lookupValue(robotLookup, query));
  registerTypeahead(surrogateSelect, (query) => lookupValue(surrogateLookup, query));

  document.querySelectorAll("#download-csv").forEach((button) => {
    button.addEventListener("click", showDownloadModal);
  });
  document.getElementById("assignment-form").addEventListener("submit", handleSubmit);
  initPanel();
  fetchEntries();
});
