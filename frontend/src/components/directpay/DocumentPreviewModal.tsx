// Shared PDF preview modal — used by both the Matching and Bill Posting
// pages to open either the invoice or the matched contract's source PDF from
// a header meta-item click, mirroring P2P's own invoice-number-opens-preview
// pattern (see pages/invoice/[id]/bill-posting.tsx's pdfOpen modal).
import { useState } from "react";
import dynamic from "next/dynamic";
import { Modal } from "antd";
import { SourceViewerToolbar, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "@/components/SourceViewerToolbar";
import { Loader } from "@/components/ui";

const PdfViewer = dynamic(() => import("@/components/PdfViewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-gray-400">
      <Loader size="large" />
    </div>
  ),
});

interface DocumentPreviewModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  pdfUrl: string;
  authToken: string | null;
}

export function DocumentPreviewModal({ open, onClose, title, pdfUrl, authToken }: DocumentPreviewModalProps) {
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(0.8);
  const [rotate, setRotate] = useState(0);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title}
      width="80vw"
      style={{ top: 24 }}
      styles={{ body: { display: "flex", flexDirection: "column", height: "82vh", padding: 0, overflow: "hidden" } }}
      footer={null}
      destroyOnHidden
    >
      {open && (
        <>
          <div className="flex-1 overflow-auto py-4 px-5" style={{ background: "#f8fafc" }}>
            <PdfViewer
              pdfUrl={pdfUrl}
              authToken={authToken}
              page={page}
              scale={scale}
              rotate={rotate}
              onNumPages={setNumPages}
              activeBbox={null}
            />
          </div>
          <SourceViewerToolbar
            scale={scale}
            onZoomOut={() => setScale((s) => Math.max(ZOOM_MIN, parseFloat((s - ZOOM_STEP).toFixed(1))))}
            onZoomIn={() => setScale((s) => Math.min(ZOOM_MAX, parseFloat((s + ZOOM_STEP).toFixed(1))))}
            rotate={rotate}
            onRotateLeft={() => setRotate((r) => (r - 90 + 360) % 360)}
            onRotateRight={() => setRotate((r) => (r + 90) % 360)}
            currentPage={page}
            totalPages={numPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(numPages, p + 1))}
            label={title}
          />
        </>
      )}
    </Modal>
  );
}
