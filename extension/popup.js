// popup.js

const API_BASE_URL = "http://localhost:8000"; // change to deployed URL later

const fileInput = document.getElementById("fileInput");
const previewImg = document.getElementById("preview");
const analyzeBtn = document.getElementById("analyzeBtn");
const errorDiv = document.getElementById("error");
const resultDiv = document.getElementById("result");

let selectedFile = null;

// ---------- helper: ask content script for brand + shades on this page ----------
function getPageContext() {
  return new Promise((resolve) => {
    if (!chrome.tabs) {
      // should never happen in real popup, but safe fallback
      return resolve({ brand: "generic", shades: [] });
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        return resolve({ brand: "generic", shades: [] });
      }

      chrome.tabs.sendMessage(
        tabId,
        { type: "LOOKWISE_GET_PAGE_CONTEXT" },
        (response) => {
          // if no content script or error, just fall back
          if (chrome.runtime.lastError || !response) {
            console.warn(
              "Lookwise: no content script / context on this page",
              chrome.runtime.lastError
            );
            return resolve({ brand: "generic", shades: [] });
          }

          // expected shape: { brand, shades }
          resolve(response);
        }
      );
    });
  });
}

// ---------- helper: tell content script which shade to highlight ----------
function notifyPageAboutTopShade(data) {
  if (!data || !Array.isArray(data.products) || data.products.length === 0) {
    return;
  }

  const topShadeName = data.products[0].shade_name; // e.g. "Sleepy Girl"

  if (!chrome.tabs) return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;

    chrome.tabs.sendMessage(tabId, {
      type: "LOOKWISE_HIGHLIGHT_SHADE",
      shadeName: topShadeName,
    });
  });
}

// ---------- file input change handler ----------
fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  selectedFile = file || null;

  errorDiv.textContent = "";
  resultDiv.innerHTML = "";

  if (file) {
    const url = URL.createObjectURL(file);
    previewImg.src = url;
    previewImg.style.display = "block";
  } else {
    previewImg.style.display = "none";
  }
});

// ---------- main analyze handler ----------
analyzeBtn.addEventListener("click", async () => {
  if (!selectedFile) {
    errorDiv.textContent = "Please upload a selfie first.";
    return;
  }

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analyzing...";
  errorDiv.textContent = "";
  resultDiv.innerHTML = "";

  const formData = new FormData();
  formData.append("file", selectedFile);

  // get brand + shades from current page via content script
  const { brand, shades } = await getPageContext();
  formData.append("brand", brand);
  formData.append("available_shades", JSON.stringify(shades || []));

  try {
    const res = await fetch(`${API_BASE_URL}/analyze`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Request failed");
    }

    const data = await res.json();
    renderResult(data);
    notifyPageAboutTopShade(data);
  } catch (err) {
    console.error(err);
    errorDiv.textContent = "Something went wrong. Please try again.";
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Find my shade";
  }
});

// ---------- render API response into popup ----------
function renderResult(data) {
  const { skin_tone, undertone, products } = data;

  const header = document.createElement("div");
  header.innerHTML = `
    <div style="margin-bottom:4px;">
      Detected skin tone:
      <strong>${skin_tone} / ${undertone}</strong>
    </div>
    <div style="margin-bottom:4px;">Recommended shades:</div>
  `;
  resultDiv.appendChild(header);

  if (!products || products.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No suitable shades found on this page.";
    empty.style.fontSize = "12px";
    empty.style.color = "#666";
    resultDiv.appendChild(empty);
    return;
  }

  products.forEach((p) => {
    const container = document.createElement("div");
    container.className = "product";

    const swatch = document.createElement("div");
    swatch.className = "swatch";
    if (p.hex) {
      swatch.style.background = p.hex;
    }

    const info = document.createElement("div");

    const name = document.createElement("div");
    name.className = "product-name";
    name.textContent = p.name;

    const meta = document.createElement("div");
    meta.className = "product-meta";
    meta.textContent = `${p.shade_name} • ${p.category}`;

    info.appendChild(name);
    info.appendChild(meta);

    container.appendChild(swatch);
    container.appendChild(info);

    resultDiv.appendChild(container);
  });
}
