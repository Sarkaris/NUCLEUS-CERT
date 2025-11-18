"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import * as XLSX from "xlsx";

type UploadStatus = "idle" | "parsing" | "ready" | "error";
type GenerateStatus = "idle" | "running" | "success" | "error";

const FONT_OPTIONS = [
  {
    label: "Algerian",
    value: "algerian",
    fontFamily: '"Algerian", "Times New Roman", serif',
  },
  {
    label: "Playfair Display",
    value: "playfair-display",
    fontFamily: '"Playfair Display", serif',
  },
  {
    label: "Great Vibes",
    value: "great-vibes",
    fontFamily: '"Great Vibes", cursive',
  },
  {
    label: "Cinzel",
    value: "cinzel",
    fontFamily: '"Cinzel", serif',
  },
  {
    label: "Cormorant Garamond",
    value: "cormorant-garamond",
    fontFamily: '"Cormorant Garamond", serif',
  },
  {
    label: "Pinyon Script",
    value: "pinyon-script",
    fontFamily: '"Pinyon Script", cursive',
  },
  {
    label: "Sacramento",
    value: "sacramento",
    fontFamily: '"Sacramento", cursive',
  },
  {
    label: "Montserrat",
    value: "montserrat",
    fontFamily: '"Montserrat", sans-serif',
  },
  {
    label: "Raleway",
    value: "raleway",
    fontFamily: '"Raleway", sans-serif',
  },
  {
    label: "Roboto Slab",
    value: "roboto-slab",
    fontFamily: '"Roboto Slab", serif',
  },
] as const;

type FontValue = (typeof FONT_OPTIONS)[number]["value"];
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 240;

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
};

const slugify = (value: string, fallbackIndex: number) => {
  const slug = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return slug || `certificate-${fallbackIndex + 1}`;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Unable to load template image. Please try again."));
    image.src = src;
  });

export default function Home() {
  const [names, setNames] = useState<string[]>([]);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [generateStatus, setGenerateStatus] = useState<GenerateStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 });
  const [fontSize, setFontSize] = useState(72);
  const [fontColor, setFontColor] = useState("#0a0a0a");
  const [fontKey, setFontKey] = useState<FontValue>(FONT_OPTIONS[0].value);
  const [customPreviewName, setCustomPreviewName] = useState("");
  const [templateSize, setTemplateSize] = useState({ width: 1920, height: 1080 });
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [templateSrc, setTemplateSrc] = useState("/template.webp");
  const [templateData, setTemplateData] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sheetRows, setSheetRows] = useState<string[][]>([]);
  const [columnOptions, setColumnOptions] = useState<{ label: string; value: number }[]>([]);
  const [selectedColumn, setSelectedColumn] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const selectedFont = useMemo(
    () => FONT_OPTIONS.find((option) => option.value === fontKey) ?? FONT_OPTIONS[0],
    [fontKey]
  );

  useEffect(() => {
    if (!previewRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries.at(0);
      if (!entry) return;
      setPreviewSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(previewRef.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!sheetRows.length) {
      setNames([]);
      return;
    }

    const headerCell = sheetRows[0]?.[selectedColumn] ?? "";
    const hasHeader = typeof headerCell === "string" && headerCell.toLowerCase().includes("name");
    const startIndex = hasHeader ? 1 : 0;

    const extracted = sheetRows
      .slice(startIndex)
      .map((row) => row[selectedColumn] ?? "")
      .map((value) => value.trim())
      .filter(Boolean);

    setNames(extracted);
  }, [sheetRows, selectedColumn]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging || !previewRef.current) return;

      const rect = previewRef.current.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      setPosition({
        x: clamp(x),
        y: clamp(y),
      });
    };

    const handlePointerUp = () => setIsDragging(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging]);

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setUploadStatus("parsing");
    setStatusMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!sheet) {
        throw new Error("No sheet found in workbook.");
      }

      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });
      const normalizedRows = rows
        .map((row) =>
          (Array.isArray(row) ? row : [row]).map((cell) => {
            if (typeof cell === "string") return cell.trim();
            if (typeof cell === "number") return String(cell);
            return "";
          })
        )
        .filter((row) => row.some((cell) => cell));

      if (!normalizedRows.length) {
        throw new Error("No values detected in the sheet.");
      }

      const maxColumns = normalizedRows.reduce((max, row) => Math.max(max, row.length), 0);
      if (!maxColumns) {
        throw new Error("Unable to detect any columns in the sheet.");
      }

      const headerRow = normalizedRows[0] ?? [];
      const options = Array.from({ length: maxColumns }, (_, index) => {
        const label = headerRow[index] || `Column ${index + 1}`;
        return { label, value: index };
      });
      const preferredIndex = options.findIndex((option) =>
        option.label.toLowerCase().includes("name")
      );

      setSheetRows(normalizedRows);
      setColumnOptions(options);
      setSelectedColumn(preferredIndex >= 0 ? preferredIndex : 0);
      setUploadStatus("ready");
      setStatusMessage(`Detected ${normalizedRows.length} rows in ${file.name}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to read Excel file.";
      setUploadStatus("error");
      setStatusMessage(message);
    }
  };

  const handleTemplateUpload = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setTemplateError("Please choose an image file (JPG, PNG, SVG).");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setTemplateSrc(reader.result);
      setTemplateData(reader.result);
      setTemplateError(null);
    };
    reader.readAsDataURL(file);
  };

  const resetTemplate = () => {
    setTemplateSrc("/template.webp");
    setTemplateData(null);
    setTemplateError(null);
  };

  const handleGenerate = async () => {
    if (!names.length) return;
    setGenerateStatus("running");
    setStatusMessage(null);

    try {
      await document.fonts.ready;
      const fontSpec = `${fontSize}px ${selectedFont.fontFamily}`;
      await document.fonts.load(fontSpec);

      const imageSource =
        templateData && templateSrc.startsWith("data:")
          ? templateSrc
          : `${templateSrc}?cache=${Date.now()}`;
      const templateImage = await loadImage(imageSource);

      const canvas = document.createElement("canvas");
      canvas.width = templateSize.width;
      canvas.height = templateSize.height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Canvas context unavailable.");
      }

      const zip = new JSZip();

      const posX = position.x * templateSize.width;
      const posY = position.y * templateSize.height;

      for (let index = 0; index < names.length; index++) {
        const name = names[index];

        ctx.clearRect(0, 0, templateSize.width, templateSize.height);
        ctx.drawImage(templateImage, 0, 0, templateSize.width, templateSize.height);

        ctx.fillStyle = fontColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `${fontSize}px ${selectedFont.fontFamily}`;

        ctx.fillText(name, posX, posY);

        const dataUrl = canvas.toDataURL("image/png");
        const base64Data = dataUrl.split(",")[1];
        zip.file(`${slugify(name, index)}.png`, base64Data, { base64: true });
      }

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, "certificates.zip");
      setGenerateStatus("success");
      setStatusMessage("Certificates are ready. Download should begin shortly.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to generate certificates.";
      setGenerateStatus("error");
      setStatusMessage(message);
    }
  };

  const activePreviewName = customPreviewName || names[0] || "Your Name";
  const previewScale =
    templateSize.width > 0
      ? previewSize.width / templateSize.width
      : 1;
  const displayFontSize = Math.max(fontSize * previewScale, 12);

  const absolutePosition = useMemo(
    () => ({
      x: Math.round(position.x * templateSize.width),
      y: Math.round(position.y * templateSize.height),
    }),
    [position, templateSize]
  );

  const canGenerate = names.length > 0 && generateStatus !== "running";

  const handleImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      const image = event.currentTarget;
      if (!image.naturalWidth || !image.naturalHeight) return;
      setTemplateSize({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    },
    []
  );

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDarkMode]);

  return (
    <div className={`min-h-screen transition-colors ${isDarkMode ? "bg-slate-950 text-slate-50" : "bg-white text-slate-900"}`}>
      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Certificate nucleus
            </p>
            <h1 className="text-2xl font-bold sm:text-3xl">
              Upload names, align once, download perfect certificates.
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Drop an Excel sheet with names. Adjust placement on the live preview, then generate a ZIP with all certificates.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium transition hover:bg-slate-50 dark:hover:bg-slate-700"
            aria-label="Toggle theme"
          >
            {isDarkMode ? "☀️ Light" : "🌙 Dark"}
          </button>
        </header>

        <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <div className="space-y-6">
            <div className={`rounded-xl border p-6 shadow-lg ${isDarkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">1. Upload Excel Sheet</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Supports .xlsx files with multiple columns.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="/sample.xlsx"
                    download
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${isDarkMode ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                  >
                    📥 Sample
                  </a>
                  <label className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition ${isDarkMode ? "border-emerald-600 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30" : "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"}`}>
                    📁 Select file
                    <input
                      className="hidden"
                      type="file"
                      accept=".xls,.xlsx"
                      onChange={(event) => handleUpload(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              </div>

              {columnOptions.length > 1 && (
                <div className="mt-4">
                  <label className="block text-sm font-medium mb-2">Select column with names:</label>
                  <select
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-900"}`}
                    value={selectedColumn}
                    onChange={(e) => setSelectedColumn(Number(e.target.value))}
                  >
                    {columnOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} (Column {option.value + 1})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={`mt-4 rounded-lg border border-dashed p-4 text-sm ${isDarkMode ? "border-slate-700 bg-slate-900/30" : "border-slate-300 bg-white"}`}>
                {uploadStatus === "ready" && names.length > 0 ? (
                  <div className="space-y-2">
                    <p>
                      ✅ <span className="font-semibold text-emerald-600 dark:text-emerald-400">{names.length}</span> names loaded
                      {columnOptions.length > 1 && ` from "${columnOptions[selectedColumn]?.label}"`}
                    </p>
                    <p className="text-xs text-slate-500">
                      First entry: <span className="font-medium">{names[0]}</span>
                    </p>
                    <button
                      className="text-xs font-medium text-rose-600 dark:text-rose-400 transition hover:underline"
                      onClick={() => {
                        setNames([]);
                        setSheetRows([]);
                        setColumnOptions([]);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                ) : uploadStatus === "parsing" ? (
                  <p className="text-slate-500">Parsing Excel file...</p>
                ) : (
                  <p className="text-slate-500">Waiting for upload...</p>
                )}
              </div>
            </div>

            <div className={`rounded-xl border p-6 shadow-lg ${isDarkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">2. Position & Style</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      Drag the text to align on certificate.
                    </p>
                  </div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {absolutePosition.x}px × {absolutePosition.y}px
                  </div>
                </div>

                <div
                  ref={previewRef}
                  className={`relative mt-4 w-full overflow-hidden rounded-lg border shadow-inner ${isDarkMode ? "border-slate-700 bg-slate-950" : "border-slate-300 bg-white"}`}
                >
                  <img
                    src={templateSrc}
                    alt="Certificate template preview"
                    className="h-auto w-full select-none object-contain"
                    onLoad={handleImageLoad}
                    draggable={false}
                  />
                  <div
                    className="absolute cursor-move select-none whitespace-nowrap font-semibold drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                    style={{
                      left: `${position.x * 100}%`,
                      top: `${position.y * 100}%`,
                      fontSize: `${displayFontSize}px`,
                      color: fontColor,
                      fontFamily: selectedFont.fontFamily,
                      transform: "translate(-50%, -50%)",
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                  >
                    {activePreviewName}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <label className="flex flex-col gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Font size</span>
                      <span className="text-xs text-slate-500">{fontSize}px</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${isDarkMode ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                        onClick={() =>
                          setFontSize((value) => clamp(value - 2, FONT_SIZE_MIN, FONT_SIZE_MAX))
                        }
                      >
                        −
                      </button>
                      <input
                        type="range"
                        min={FONT_SIZE_MIN}
                        max={FONT_SIZE_MAX}
                        value={fontSize}
                        onChange={(event) => setFontSize(Number(event.target.value))}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${isDarkMode ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                        onClick={() =>
                          setFontSize((value) => clamp(value + 2, FONT_SIZE_MIN, FONT_SIZE_MAX))
                        }
                      >
                        +
                      </button>
                    </div>
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="font-medium">Font color</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={fontColor}
                        onChange={(event) => setFontColor(event.target.value)}
                        className="h-10 w-full cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700"
                      />
                      <button
                        type="button"
                        onClick={() => setFontColor("#ffffff")}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${isDarkMode ? "border-slate-700 bg-slate-800 text-white hover:bg-slate-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                        title="Default white"
                      >
                        White
                      </button>
                      <button
                        type="button"
                        onClick={() => setFontColor("#000000")}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${isDarkMode ? "border-slate-700 bg-slate-800 text-white hover:bg-slate-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                        title="Black"
                      >
                        Black
                      </button>
                    </div>
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="font-medium">Font family</span>
                    <select
                      className={`rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-900"}`}
                      value={fontKey}
                      onChange={(event) => setFontKey(event.target.value as FontValue)}
                    >
                      {FONT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="mt-4 flex flex-col gap-2 text-sm">
                  <span className="font-medium">Preview text override</span>
                  <input
                    className={`rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-900"}`}
                    placeholder="Type custom text to preview"
                    value={customPreviewName}
                    onChange={(event) => setCustomPreviewName(event.target.value)}
                  />
                </label>

                <div className={`mt-4 rounded-lg border border-dashed p-4 text-sm ${isDarkMode ? "border-slate-700 bg-slate-900/30" : "border-slate-300 bg-white"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">Template image</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Upload a JPG/PNG or use default background.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition ${isDarkMode ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
                        📤 Upload
                        <input
                          className="hidden"
                          type="file"
                          accept="image/*"
                          onChange={(event) =>
                            handleTemplateUpload(event.target.files?.[0] ?? null)
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="text-xs font-medium text-emerald-600 dark:text-emerald-400 transition hover:underline"
                        onClick={resetTemplate}
                      >
                        Use default
                      </button>
                    </div>
                  </div>
                  {templateError && (
                    <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{templateError}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className={`rounded-xl border p-6 shadow-lg ${isDarkMode ? "border-emerald-800 bg-gradient-to-br from-emerald-900/20 to-slate-900/50" : "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"}`}>
              <h2 className="text-lg font-semibold">3. Generate ZIP</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                All processing happens in your browser. Nothing is stored or uploaded.
              </p>

              <button
                className={`mt-6 w-full rounded-lg py-3 text-base font-semibold transition shadow-lg ${
                  canGenerate
                    ? "bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.98]"
                    : "bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                }`}
                disabled={!canGenerate}
                onClick={handleGenerate}
              >
                {generateStatus === "running" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></span>
                    Building ZIP...
                  </span>
                ) : (
                  "📦 Download ZIP"
                )}
              </button>

              {generateStatus === "success" && (
                <p className="mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  ✅ ZIP downloaded successfully!
                </p>
              )}
            </div>

            <div className={`rounded-xl border p-6 shadow-lg ${isDarkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-slate-50"}`}>
              <h3 className="text-lg font-semibold mb-4">Status</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Upload:</span>
                  <span className={`font-medium ${uploadStatus === "ready" ? "text-emerald-600 dark:text-emerald-400" : uploadStatus === "error" ? "text-rose-600 dark:text-rose-400" : ""}`}>
                    {uploadStatus}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Generate:</span>
                  <span className={`font-medium ${generateStatus === "success" ? "text-emerald-600 dark:text-emerald-400" : generateStatus === "error" ? "text-rose-600 dark:text-rose-400" : ""}`}>
                    {generateStatus}
                  </span>
                </div>
              </div>
              
              {statusMessage && (
                <div className={`mt-4 rounded-lg border p-3 text-sm ${
                  generateStatus === "error" || uploadStatus === "error"
                    ? "border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400"
                    : "border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                }`}>
                  {statusMessage}
                </div>
              )}

              {names.length > 0 && (
                <div className={`mt-4 max-h-64 overflow-y-auto rounded-lg border p-4 text-sm ${isDarkMode ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-white"}`}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Loaded names ({names.length})
                  </p>
                  <ol className="space-y-1.5">
                    {names.slice(0, 20).map((name, index) => (
                      <li key={name + index} className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono w-6">{index + 1}.</span>
                        <span className="truncate">{name}</span>
                      </li>
                    ))}
                  </ol>
                  {names.length > 20 && (
                    <p className="mt-3 text-xs text-slate-500 text-center">
                      ...and {names.length - 20} more
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
