import { DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { Modal, Button, Spinner } from "@/components/ui";
import { ApiError, ingestionService } from "@/services";
import { ScenarioChip } from "@/types/invoice";

const ACCEPTED = ".pdf,.png,.jpg,.jpeg,.tiff,.tif,.zip";

function normalise(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function matchScenario(fileName: string, scenarios: ScenarioChip[]): ScenarioChip | null {
  const norm = normalise(fileName);
  let best: ScenarioChip | null = null;
  let bestLen = -1;
  for (const s of scenarios) {
    const key = normalise(s.key);
    if (norm.startsWith(key) && key.length > bestLen) {
      best = s;
      bestLen = key.length;
    }
  }
  return best;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onUploaded?: (invoiceId: string) => void;
}

type Phase = "idle" | "uploading" | "processing" | "done";

export function UploadModal({ open, onClose, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioChip[]>([]);
  const [matched, setMatched] = useState<ScenarioChip | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    ingestionService.scenarios()
      .then((res) => setScenarios(res.scenarios))
      .catch(() => {});
  }, [open]);

  const reset = useCallback(() => {
    setFile(null);
    setMatched(null);
    setPhase("idle");
    setProgress(0);
    setError(null);
    setIsDragging(false);
  }, []);

  const handleClose = () => {
    if (phase === "uploading" || phase === "processing") return;
    reset();
    onClose();
  };

  const pickFile = (f: File) => {
    setFile(f);
    setError(null);
    setMatched(matchScenario(f.name, scenarios));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) pickFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    setPhase("uploading");
    setProgress(0);

    // Fake progress animation to ~70%
    const tick = setInterval(() => {
      setProgress((p) => Math.min(p + 4, 70));
    }, 60);

    try {
      const data = await ingestionService.upload(file);
      clearInterval(tick);
      setProgress(100);
      setPhase("processing");

      setTimeout(() => {
        reset();
        onClose();
        if (onUploaded) onUploaded(data.invoice_id);
      }, 900);
    } catch (err) {
      clearInterval(tick);
      setPhase("idle");
      setProgress(0);
      setError(err instanceof ApiError ? err.message : "Upload failed");
    }
  };

  const busy = phase === "uploading" || phase === "processing";

  return (
    <Modal open={open} onClose={handleClose} title="Upload Invoice" size="md">
      <div className="flex flex-col gap-5">
        {/* Drop zone */}
        <div
          onClick={() => !busy && inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={[
            "relative flex flex-col items-center justify-center gap-3 rounded-xl cursor-pointer",
            "min-h-[160px] px-6 py-8 transition-all duration-200",
            isDragging
              ? "border-2 border-solid border-border-primary bg-surface-primary-bg"
              : "border-2 border-dashed border-border-default hover:border-border-primary hover:bg-surface-primary-bg",
            busy ? "pointer-events-none opacity-60" : "",
          ].join(" ")}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={handleInputChange}
          />
          {file ? (
            <>
              <div className="w-10 h-10 rounded-lg bg-surface-primary-subtle flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M11.5 2H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7.5L11.5 2Z" stroke="var(--icon-primary-default)" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M11.5 2v5.5H17" stroke="var(--icon-primary-default)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-text-heading">{file.name}</p>
                <p className="text-xs text-text-caption mt-0.5">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); reset(); }}
                className="text-xs text-text-caption hover:text-text-body mt-1"
              >
                Change file
              </button>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-lg bg-surface-card-2 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 13V7m0 0L7.5 9.5M10 7l2.5 2.5" stroke="var(--icon-default-body)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 13.5A3.5 3.5 0 0 0 6.5 17h7A3.5 3.5 0 0 0 17 13.5V13A4 4 0 0 0 10 9.2" stroke="var(--icon-default-body)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-text-body">
                  {isDragging ? "Drop to upload" : "Drag & drop or click to browse"}
                </p>
                <p className="text-xs text-text-caption mt-0.5">PDF, PNG, JPG, TIFF, ZIP</p>
              </div>
            </>
          )}
        </div>

        {/* Progress bar */}
        {(phase === "uploading" || phase === "processing") && (
          <div className="flex flex-col gap-2">
            <div className="h-1.5 bg-surface-card-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-surface-primary rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-text-caption">
              <Spinner size="sm" />
              <span>{phase === "processing" ? "Processing invoice…" : "Uploading…"}</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-text-error bg-surface-error-subtle border border-border-error rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-1 border-t border-border-default">
          <Button variant="secondary" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleUpload}
            disabled={!file || busy}
            loading={busy}
          >
            Upload Invoice
          </Button>
        </div>
      </div>
    </Modal>
  );
}
