// --- Debug: confirm script loaded ---
console.log("Lookwise content script LOADED on", window.location.href);

// --- Detect brand from hostname ---
function detectBrand() {
  const host = window.location.hostname;
  if (host.includes("sephora")) return "sephora";
  return "generic";
}

// --- Extract Sephora shade list (buttons inside SwatchGroup) ---
function getSephoraShades() {
  console.log("Lookwise: Running Sephora shade extractor…");

  // Look for swatch group
  const swatchGroup = document.querySelector('[data-comp="SwatchGroup "]');

  if (!swatchGroup) {
    console.warn("Lookwise: No SwatchGroup found on this page.");
    return [];
  }

  const buttons = swatchGroup.querySelectorAll(
    'button[data-at="swatch"], button[data-at="selected_swatch"]'
  );

  const shades = [];

  buttons.forEach((btn) => {
    const aria = btn.getAttribute("aria-label") || "";
    if (!aria) return;

    // Clean trailing " - Selected"
    const cleaned = aria.replace(/\s*-\s*Selected\s*$/i, "");

    // Split name + descriptor
    const parts = cleaned.split(" - ");
    const shadeName = parts[0]?.trim();
    const description = parts.slice(1).join(" - ").trim();

    // Extract SKU ID from swatch image URL
    const img = btn.querySelector("img");
    let sku = null;
    if (img && img.src) {
      const match = img.src.match(/sku\/([^+]+)\+sw\.jpg/i);
      if (match) sku = match[1];
    }

    if (!shadeName) return;

    const shadeObj = {
      shadeName,
      description,
      sku,
      isSelected: btn.getAttribute("data-at") === "selected_swatch",
    };

    shades.push(shadeObj);
  });

  // 🔥 LOG EVERYTHING 🎉
  console.log("Lookwise: Extracted Sephora shades:", shades);

  return shades;
}

// --- Entry point for popup asking for page context ---
function getAvailableShades() {
  const brand = detectBrand();

  if (brand === "sephora") {
    const shades = getSephoraShades();
    return { brand, shades };
  }

  return { brand, shades: [] };
}

// --- Message handling for popup <-> content script communication ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LOOKWISE_GET_PAGE_CONTEXT") {
    const { brand, shades } = getAvailableShades();

    // log what we are sending back
    console.log("Lookwise: Sending page context:", { brand, shades });

    sendResponse({ brand, shades });
  }

  if (message.type === "LOOKWISE_HIGHLIGHT_SHADE") {
    console.log("Lookwise: Highlight request received:", message.shadeName);
    highlightShade(message.shadeName);
  }

  return true;
});

// --- Highlight the best shade on the page ---
function highlightShade(shadeName) {
  const target = shadeName.toLowerCase();
  console.log("Lookwise: Attempting to highlight shade:", target);

  const swatchGroup = document.querySelector('[data-comp="SwatchGroup "]');
  if (!swatchGroup) {
    console.warn("Lookwise: No SwatchGroup found for highlight.");
    return;
  }

  const buttons = swatchGroup.querySelectorAll(
    'button[data-at="swatch"], button[data-at="selected_swatch"]'
  );

  let found = false;

  buttons.forEach((btn) => {
    const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
    if (!aria) return;

    if (aria.startsWith(target)) {
      found = true;
      btn.style.outline = "2px solid #ff4081";
      btn.style.boxShadow = "0 0 6px rgba(255, 64, 129, 0.7)";
      btn.scrollIntoView({ block: "center", behavior: "smooth" });
      console.log("Lookwise: Highlighted:", aria);
    }
  });

  if (!found) {
    console.warn("Lookwise: Could NOT find shade on page:", shadeName);
  }
}
