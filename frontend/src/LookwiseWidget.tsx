import React, { useState } from "react";

type Product = {
  id: string;
  name: string;
  shade_name: string;
  hex: string;
  tone: string;
  undertone: string;
  category: string;
  coverage?: string | null;
};

type AnalyzeResponse = {
  skin_tone: string;
  undertone: string;
  products: Product[];
};

interface LookwiseWidgetProps {
  apiBaseUrl?: string; // default: http://localhost:8000
}

const LookwiseWidget: React.FC<LookwiseWidgetProps> = ({
  apiBaseUrl = "http://localhost:8000",
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setResult(null);
    setError(null);

    if (f) {
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError("Please upload a selfie first.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${apiBaseUrl}/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Request failed");
      }

      const data: AnalyzeResponse = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: "12px",
        padding: "16px",
        maxWidth: "400px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        background: "#fff",
      }}
    >
      <h3 style={{ marginBottom: "8px" }}>Find your perfect shade</h3>
      <p style={{ fontSize: "0.9rem", marginBottom: "12px", color: "#555" }}>
        Upload a clear selfie in natural light to get shade suggestions from our
        range.
      </p>

      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ marginBottom: "12px" }}
      />

      {previewUrl && (
        <div style={{ marginBottom: "12px" }}>
          <img
            src={previewUrl}
            alt="Preview"
            style={{
              width: "100%",
              borderRadius: "8px",
              objectFit: "cover",
            }}
          />
        </div>
      )}

      <button
        onClick={handleAnalyze}
        disabled={loading}
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: "999px",
          border: "none",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "0.95rem",
          background: loading ? "#ddd" : "#111",
          color: "#fff",
          marginBottom: "10px",
        }}
      >
        {loading ? "Analyzing..." : "Find my shade"}
      </button>

      {error && (
        <div style={{ color: "#b00020", fontSize: "0.85rem" }}>{error}</div>
      )}

      {result && (
        <div style={{ marginTop: "12px" }}>
          <p style={{ fontSize: "0.9rem", marginBottom: "4px" }}>
            Detected skin tone:{" "}
            <strong>
              {result.skin_tone} / {result.undertone}
            </strong>
          </p>
          <p style={{ fontSize: "0.9rem", marginBottom: "8px" }}>
            Recommended shades:
          </p>
          <div style={{ display: "grid", gap: "8px" }}>
            {result.products.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px",
                  borderRadius: "8px",
                  border: "1px solid #eee",
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    background: p.hex,
                    border: "1px solid #ccc",
                  }}
                />
                <div>
                  <div
                    style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}
                  >
                    {p.name}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#555" }}>
                    {p.shade_name} • {p.category}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LookwiseWidget;
