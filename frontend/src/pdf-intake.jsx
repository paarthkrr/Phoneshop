import React, { useState } from "react";

// AI PDF/Excel intake - drag & drop file, extract data
export default function PDFIntake({ onExtract }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }

  async function processFile(f) {
    setFile(f);
    setStatus("Processing...");
    // Simulate extraction (real implementation would use PDF.js or server-side)
    setTimeout(() => {
      const extracted = {
        imei: "350331588476866",
        model: "iPhone 16 Pro",
        storage: "256GB",
        color: "Black",
        price: 890,
      };
      setStatus("Extracted!");
      if (onExtract) onExtract(extracted);
    }, 1500);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${dragging ? "#7A1F2B" : "#E2E6EC"}`,
        borderRadius: 12,
        padding: 40,
        textAlign: "center",
        background: dragging ? "rgba(122,31,43,0.05)" : "#FAFAFA",
        transition: "all 0.2s",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
        {file ? file.name : "Drop PDF or Excel here"}
      </div>
      <div style={{ fontSize: 13, color: "#6B7280" }}>
        {status || "Or click to browse"}
      </div>
      <input
        type="file"
        accept=".pdf,.xlsx,.xls,.csv"
        onChange={(e) => e.target.files[0] && processFile(e.target.files[0])}
        style={{ display: "none" }}
        id="file-input"
      />
      <label htmlFor="file-input" style={{ cursor: "pointer", color: "#7A1F2B", fontSize: 13, marginTop: 12, display: "inline-block" }}>
        Browse files
      </label>
    </div>
  );
}
