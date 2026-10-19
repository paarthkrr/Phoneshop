import React, { useState } from "react";

// Real PDF extraction using PDF.js (loaded from CDN)
export default function PDFExtract({ onExtract }) {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadPDFJS() {
    if (window.pdfjsLib) return window.pdfjsLib;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function extractText(file) {
    setLoading(true);
    setStatus("Loading PDF.js...");
    try {
      const pdfjs = await loadPDFJS();
      setStatus("Reading PDF...");
      const data = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(" ") + "\n";
      }
      setStatus("Extracting data...");
      const extracted = parsePhoneData(text);
      setStatus("Done!");
      if (onExtract) onExtract(extracted, text);
    } catch (err) {
      setStatus("Error: " + err.message);
    }
    setLoading(false);
  }

  function parsePhoneData(text) {
    const imeiMatch = text.match(/\b\d{15}\b/);
    const modelMatch = text.match(/iPhone\s*\d+[^\n,]*/i);
    const storageMatch = text.match(/\d+\s*GB/i);
    const priceMatch = text.match(/\$?\d{2,4}/);
    return {
      imei: imeiMatch ? imeiMatch[0] : "",
      model: modelMatch ? modelMatch[0] : "",
      storage: storageMatch ? storageMatch[0] : "",
      price: priceMatch ? parseInt(priceMatch[0].replace("$", "")) : 0,
      raw: text.slice(0, 500),
    };
  }

  return (
    <div style={{ padding: 20 }}>
      <input
        type="file"
        accept=".pdf"
        onChange={e => e.target.files[0] && extractText(e.target.files[0])}
        disabled={loading}
        style={{ marginBottom: 12 }}
      />
      {status && <div style={{ fontSize: 13, color: "#6B7280" }}>{status}</div>}
    </div>
  );
}
