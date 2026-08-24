import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Spinner } from "@/components/ui";

// react-pdf's onRenderSuccess hands back the page proxy with the rendered
// (scale- and rotation-applied) canvas dimensions. PageCallback isn't exported
// from the package root, so we only type the fields we read.
type RenderedPage = { width: number; height: number };

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export interface ActiveBbox {
  bbox_left: number;
  bbox_top: number;
  bbox_width: number;
  bbox_height: number;
  page: number;
  confidence: number;
  label: string;
  value?: string;
  /** Below this → red overlay, at/above → green. Mirrors validator-fe. */
  confidenceThreshold?: number;
  /** Stable id so the overlay only re-scrolls when the selection changes. */
  id?: string;
}

interface PdfViewerProps {
  pdfUrl: string;
  authToken: string | null;
  page: number;
  scale: number;
  rotate: number;
  onNumPages: (n: number) => void;
  activeBbox: ActiveBbox | null;
  /** Line-item rows highlight the full page width; metadata fields don't. */
  isLineItemMode?: boolean;
}

// ── Colors — red below threshold, green at/above (validator-fe parity) ────────
function getScoreColors(confidence?: number, threshold?: number) {
  if (confidence !== undefined && threshold !== undefined && confidence < threshold) {
    return {
      border: "rgb(239 68 68)",
      background: "rgba(239, 68, 68, 0.5)",
      shadow: "rgba(239, 68, 68, 0.75)",
      labelBg: "rgb(239 68 68)",
    };
  }
  return {
    border: "rgb(34 197 94)",
    background: "rgba(34, 197, 94, 0.5)",
    shadow: "rgba(34, 197, 94, 0.75)",
    labelBg: "rgb(34 197 94)",
  };
}

// ── Normalized bbox → pixel rect (rotation-aware), ported from validator-fe ───
function getBoundingBoxCoordinates(
  b: ActiveBbox,
  rotation: number,
  pageWidth: number,
  pageHeight: number,
  lineItemMode: boolean,
) {
  const w = rotation % 180 === 0 ? pageWidth : pageHeight;
  const h = rotation % 180 === 0 ? pageHeight : pageWidth;

  const leftN = b.bbox_left;
  const topN = b.bbox_top;
  const rightN = b.bbox_left + b.bbox_width;
  const bottomN = b.bbox_top + b.bbox_height;

  let left: number, top: number, width: number, height: number;

  switch (rotation) {
    case 90:
      width = (bottomN - topN) * h;
      height = (rightN - leftN) * w;
      left = (1 - bottomN) * h;
      top = leftN * w;
      break;
    case 180:
      width = (rightN - leftN) * w;
      height = (bottomN - topN) * h;
      left = (1 - rightN) * w;
      top = (1 - bottomN) * h;
      break;
    case 270:
      width = (bottomN - topN) * h;
      height = (rightN - leftN) * w;
      left = topN * h;
      top = (1 - rightN) * w;
      break;
    case 0:
    default:
      width = (rightN - leftN) * w;
      height = (bottomN - topN) * h;
      left = leftN * w;
      top = topN * h;
      break;
  }

  if (lineItemMode) {
    left = 10;
    width = w - 10;
    const LINE_ITEM_PADDING = 4;
    height = height + 2 * LINE_ITEM_PADDING;
    top = top - LINE_ITEM_PADDING;
  } else {
    // Small cushion so a thin single-line field (most metadata bboxes) is
    // comfortably visible/clickable — NOT a generic "make it bigger" pad.
    // Was a flat 50px, which for a typical ~6-10px-tall OCR text line added
    // 100px of vertical padding alone: enough to visually swallow adjacent,
    // unrelated blocks on the page (verified: RATNA_INTAN's short single-line
    // "Vendor Name"/"Invoice Number" fields rendered as boxes spanning both
    // the customer AND vendor address blocks). Mirrors line-item mode's own
    // much smaller padding just above, which never had this problem.
    const DEFAULT_PADDING = 4;
    left = left - DEFAULT_PADDING;
    top = top - DEFAULT_PADDING;
    width = width + 2 * DEFAULT_PADDING;
    height = height + 2 * DEFAULT_PADDING;
  }

  left = Math.max(0, left);
  top = Math.max(0, top);
  width = Math.min(width, w - left);
  height = Math.min(height, h - top);

  return { left, top, width, height };
}

// ── Overlay — highlight rect + floating label (validator-fe parity) ──────────
function BoundingBoxOverlay({
  bbox,
  pageWidth,
  pageHeight,
  rotation,
  currentPage,
  isLineItemMode,
}: {
  bbox: ActiveBbox;
  pageWidth: number;
  pageHeight: number;
  rotation: number;
  currentPage: number;
  isLineItemMode: boolean;
}) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  const selectionId = bbox.id ?? `${bbox.label}-${bbox.bbox_left}-${bbox.bbox_top}`;

  // Scroll the highlight into the center of the nearest scroll container
  // whenever the selection (or page) changes.
  useLayoutEffect(() => {
    if (bbox.page !== currentPage || !highlightRef.current) return;
    const el = highlightRef.current;
    const t = setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }, 60);
    return () => clearTimeout(t);
  }, [selectionId, bbox.page, currentPage, pageWidth, pageHeight, rotation]);

  if (bbox.page !== currentPage || !pageWidth || !pageHeight) return null;

  const { left, top, width, height } = getBoundingBoxCoordinates(
    bbox, rotation, pageWidth, pageHeight, isLineItemMode,
  );
  const colors = getScoreColors(bbox.confidence, bbox.confidenceThreshold ?? 0.85);
  const showLabel = Boolean(bbox.label || bbox.value);

  // Label below the bbox (so the caption never sits on top of, and hides,
  // the highlighted text itself) — flip above only if there's no room below.
  const GAP = 3;
  const LABEL_HEIGHT_ESTIMATE = 50;
  const labelTopBelow = top + height + GAP;
  const finalLabelTop =
    labelTopBelow + LABEL_HEIGHT_ESTIMATE > pageHeight
      ? Math.max(0, top - LABEL_HEIGHT_ESTIMATE - GAP)
      : labelTopBelow;
  const minLabelWidth = isLineItemMode ? 250 : width;

  return (
    <>
      <div
        ref={highlightRef}
        style={{
          position: "absolute",
          left, top, width, height,
          border: `2px solid ${colors.border}`,
          backgroundColor: colors.background,
          borderRadius: 4,
          zIndex: 100,
          pointerEvents: "none",
          boxShadow: `0 0 10px ${colors.shadow}`,
          transition: "all 200ms ease-in-out",
        }}
      />
      {showLabel && (
        <div
          ref={labelRef}
          style={{
            position: "absolute",
            left, top: finalLabelTop,
            padding: "8px 12px",
            backgroundColor: colors.labelBg,
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 4,
            zIndex: 101,
            pointerEvents: "none",
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            minWidth: minLabelWidth,
            width: "fit-content",
            overflow: "visible",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {bbox.confidence !== undefined && !isNaN(bbox.confidence) && (
            <div
              style={{
                backgroundColor: "rgba(255,255,255,0.2)",
                borderRadius: 4,
                padding: "2px 6px",
                minWidth: 45,
                textAlign: "center",
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "0.5px",
                flexShrink: 0,
              }}
            >
              {(bbox.confidence * 100).toFixed(0)}%
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {bbox.label && <strong>{bbox.label}</strong>}
            {bbox.value && (
              <span style={{ fontSize: 11, opacity: 0.9 }}>{bbox.value}</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function PdfViewer({
  pdfUrl, authToken, page, scale, rotate, onNumPages, activeBbox, isLineItemMode = false,
}: PdfViewerProps) {
  const [error, setError] = useState(false);
  const [pageDims, setPageDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // The page's OWN /Rotate, as declared by the PDF. react-pdf overrides the
  // intrinsic rotation whenever an explicit `rotate` prop is passed, so
  // passing the caller's 0 default would silently discard it — which rendered
  // a correctly-tagged sideways scan (fixtures/dp/PAKUWON/contract.pdf, a
  // landscape scan with /Rotate 270) sideways in the app while every other
  // document, being /Rotate 0, looked unaffected. The caller's `rotate` is
  // therefore treated as a user-applied DELTA on top of this.
  const [intrinsicRotate, setIntrinsicRotate] = useState(0);

  // react-pdf reloads the whole document whenever the `file` prop is a new
  // reference. Memoize it so onRenderSuccess→setState re-renders don't trigger
  // an endless reload loop.
  const file = useMemo(
    () =>
      authToken
        ? { url: pdfUrl, httpHeaders: { Authorization: `Bearer ${authToken}` } }
        : pdfUrl,
    [pdfUrl, authToken],
  );

  // Document's own orientation + whatever the user rotated on top of it. With
  // the common /Rotate 0 document this is exactly the caller's own value, so
  // existing behavior (including P2P's) is unchanged.
  const effectiveRotate = ((intrinsicRotate + rotate) % 360 + 360) % 360;

  return (
    // w-fit + mx-auto: centers when content fits, sticks to the left when the
    // zoomed page overflows so the outer container's horizontal scrollbar can
    // reach the left edge (matches invoice-validator-fe's PdfViewer behaviour).
    <div className="w-fit mx-auto">
      {error ? (
        <div className="flex flex-col items-center justify-center h-64 gap-2 text-text-caption text-sm">
          <span>Could not load PDF</span>
        </div>
      ) : (
        <Document
          file={file}
          onLoadSuccess={({ numPages }) => onNumPages(numPages)}
          onLoadError={() => setError(true)}
          loading={
            <div className="flex items-center justify-center h-64 w-full">
              <Spinner size="lg" />
            </div>
          }
        >
          {/* inline-block so this div wraps exactly to the rendered Page canvas */}
          <div className="relative inline-block shadow-lg">
            <Page
              pageNumber={page}
              scale={scale}
              rotate={effectiveRotate}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              onLoadSuccess={(p: { rotate?: number }) => {
                const own = ((p.rotate ?? 0) % 360 + 360) % 360;
                setIntrinsicRotate(prev => (prev === own ? prev : own));
              }}
              onRenderSuccess={(p: RenderedPage) =>
                setPageDims(prev =>
                  prev.w === p.width && prev.h === p.height
                    ? prev
                    : { w: p.width, h: p.height }
                )
              }
              loading={
                <div className="flex items-center justify-center bg-white" style={{ width: 476, height: 674 }}>
                  <Spinner size="md" />
                </div>
              }
            />

            {activeBbox && pageDims.w > 0 && pageDims.h > 0 && (
              <BoundingBoxOverlay
                key={`${activeBbox.id ?? activeBbox.label}-${page}`}
                bbox={activeBbox}
                pageWidth={pageDims.w}
                pageHeight={pageDims.h}
                // The caller's own manual rotation delta ONLY — not
                // effectiveRotate. bbox_left/top/width/height are computed
                // by the backend relative to the PDF page's OWN effective
                // rect (already reflecting the page's intrinsic /Rotate,
                // the same reference frame page.search_for()/get_text() use
                // — see generate_dp_invoice_bbox.py), and pageDims here is
                // react-pdf's already fully-rotated (intrinsic + manual)
                // render of that same page. Passing effectiveRotate made
                // getBoundingBoxCoordinates apply a SECOND rotation
                // transform on top of a page that was already correctly
                // oriented, silently double-rotating every box. Verified as
                // a real, live bug: KARYA_NASTARI's invoice PDFs (page
                // /Rotate 270) rendered every metadata highlight as a tall,
                // page-spanning vertical strip instead of a tight box.
                // Passing just the manual delta (0 unless the viewer has
                // clicked rotate) keeps that transform meaningful only for
                // rotation actually added on top of the already-correct
                // render — P2P's own fixtures have no rotated PDFs at all,
                // so this can't change its behavior.
                rotation={rotate}
                currentPage={page}
                isLineItemMode={isLineItemMode}
              />
            )}
          </div>
        </Document>
      )}
    </div>
  );
}
