// Bottom toolbar for the source viewer — pixel-equivalent to invoice-validator-fe
// SourceViewer bottom bar: AntD Button icons, same iconBtnStyle, same layout.

import {
  FileTextOutlined,
  LeftOutlined,
  RightOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";
import { Button } from "antd";

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2.4;
export const ZOOM_STEP = 0.2;

const iconBtnStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#6B7280",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
};

export function SourceViewerToolbar({
  scale, onZoomOut, onZoomIn,
  rotate, onRotateLeft, onRotateRight,
  currentPage, totalPages, onPrev, onNext,
  label = "Invoice Preview",
}: {
  scale: number; onZoomOut: () => void; onZoomIn: () => void;
  rotate: number; onRotateLeft: () => void; onRotateRight: () => void;
  currentPage: number; totalPages: number; onPrev: () => void; onNext: () => void;
  label?: string;
}) {
  // rotate is consumed by the parent — referenced here only so the unused-prop
  // lint stays quiet without changing the public API.
  void rotate;

  return (
    <div
      className="shrink-0"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        background: "#FFFFFF",
        borderTop: "1px solid #E5E7EB",
        height: 48,
        flexShrink: 0,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Left: file icon + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <FileTextOutlined style={{ color: "#6B7280", fontSize: 14 }} />
        <span style={{ fontSize: 14, color: "#101828", fontWeight: 500, fontFamily: "Inter, sans-serif", fontStyle: "normal", lineHeight: "22px" }}>
          {label}
        </span>
      </div>

      {/* Center: zoom */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Button size="small" style={iconBtnStyle} onClick={onZoomOut} disabled={scale <= ZOOM_MIN} icon={<ZoomOutOutlined />} />
        <span style={{ minWidth: 44, textAlign: "center", fontSize: 13, color: "#374151", fontFamily: "Inter, sans-serif", fontWeight: 500 }}>
          {Math.round(scale * 100)}%
        </span>
        <Button size="small" style={iconBtnStyle} onClick={onZoomIn} disabled={scale >= ZOOM_MAX} icon={<ZoomInOutlined />} />
      </div>

      {/* Right: rotate + page nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Button size="small" style={iconBtnStyle} onClick={onRotateLeft} icon={<RotateLeftOutlined />} />
        <Button size="small" style={iconBtnStyle} onClick={onRotateRight} icon={<RotateRightOutlined />} />
        {totalPages > 0 && (
          <>
            <div style={{ width: 1, height: 16, background: "#E5E7EB", margin: "0 4px" }} />
            <Button size="small" style={iconBtnStyle} onClick={onPrev} disabled={currentPage <= 1} icon={<LeftOutlined />} />
            <span style={{ fontSize: 13, color: "#374151", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap", padding: "0 4px" }}>
              {currentPage} of {totalPages}
            </span>
            <Button size="small" style={iconBtnStyle} onClick={onNext} disabled={currentPage >= totalPages} icon={<RightOutlined />} />
          </>
        )}
      </div>
    </div>
  );
}
