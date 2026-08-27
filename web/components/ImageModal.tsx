import { useCallback, useEffect, useRef, useState } from "react";
import { fetchImageSize } from "../editor/extensions.ts";

interface ImageModalProps {
  src: string;
  alt?: string;
  link?: string;
  onClose: () => void;
}

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 10;
const ZOOM_STEP = 0.25;

export function ImageModal({ src, alt, link, onClose }: ImageModalProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<
    {
      startX: number;
      startY: number;
      startPosX: number;
      startPosY: number;
    } | null
  >(null);
  const [loaded, setLoaded] = useState(false);
  const fitRef = useRef(false);
  const [info, setInfo] = useState<{
    width?: number;
    height?: number;
    size?: number;
  }>({});

  const fitToViewport = useCallback(() => {
    const vp = viewportRef.current;
    const img = imgRef.current;
    if (!vp || !img || !img.naturalWidth || !img.naturalHeight) return;
    const pad = 40;
    const scaleX = (vp.clientWidth - pad * 2) / img.naturalWidth;
    const scaleY = (vp.clientHeight - pad * 2) / img.naturalHeight;
    const s = Math.min(scaleX, scaleY, 1);
    setZoom(s);
    setPos({
      x: (vp.clientWidth - img.naturalWidth * s) / 2,
      y: (vp.clientHeight - img.naturalHeight * s) / 2,
    });
    fitRef.current = true;
  }, []);

  useEffect(() => {
    if (loaded && !fitRef.current) fitToViewport();
  }, [loaded, fitToViewport]);

  useEffect(() => {
    let cancelled = false;
    fetchImageSize(src).then((size) => {
      if (!cancelled && size) {
        setInfo((prev) => ({ ...prev, size }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const formatBytes = (b?: number) => {
    if (!b) return "—";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const zoomTo = (z: number) => {
    const img = imgRef.current;
    if (!img) return;
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    setPos((p) => {
      const imgCx = p.x + (img.naturalWidth * zoom) / 2;
      const imgCy = p.y + (img.naturalHeight * zoom) / 2;
      return {
        x: imgCx - (img.naturalWidth * clamped) / 2,
        y: imgCy - (img.naturalHeight * clamped) / 2,
      };
    });
    setZoom(clamped);
  };

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const img = imgRef.current;
      if (!img) return;
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + delta));
      setPos((p) => {
        const imgCx = p.x + (img.naturalWidth * zoom) / 2;
        const imgCy = p.y + (img.naturalHeight * zoom) / 2;
        return {
          x: imgCx - (img.naturalWidth * newZoom) / 2,
          y: imgCy - (img.naturalHeight * newZoom) / 2,
        };
      });
      setZoom(newZoom);
    },
    [zoom],
  );

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
    };
  };

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      x: dragRef.current.startPosX + dx,
      y: dragRef.current.startPosY + dy,
    });
  }, []);

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="img-modal-backdrop" onClick={onBackdropClick}>
      <div className="img-modal-toolbar">
        <button onClick={() => zoomTo(zoom - ZOOM_STEP * 2)} title="Zoom out">
          −
        </button>
        <span
          className="muted"
          style={{ minWidth: "4.5em", textAlign: "center" }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => zoomTo(zoom + ZOOM_STEP * 2)} title="Zoom in">
          +
        </button>
        <button onClick={fitToViewport} title="Fit to viewport">
          Fit
        </button>
        <button
          onClick={() => {
            const vp = viewportRef.current;
            const img = imgRef.current;
            if (!vp || !img || !img.naturalWidth || !img.naturalHeight) return;
            setZoom(1);
            setPos({
              x: (vp.clientWidth - img.naturalWidth) / 2,
              y: (vp.clientHeight - img.naturalHeight) / 2,
            });
            fitRef.current = true;
          }}
          title="Actual size (100%)"
        >
          1:1
        </button>
        <div className="spacer" />
        <span className="img-modal-meta" title={link}>
          {info.width && info.height
            ? `${info.width} × ${info.height} px`
            : "—"}
          {" · "}
          {formatBytes(info.size)}
          {alt ? ` · alt: ${alt}` : ""}
          {link ? ` · ${link}` : ""}
        </span>
        <div className="spacer" />
        <button onClick={onClose}>Close</button>
      </div>
      <div
        ref={viewportRef}
        className={`img-modal-viewport${dragRef.current ? " dragging" : ""}`}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt ?? ""}
          style={fitRef.current
            ? {
                position: "absolute",
                left: 0,
                top: 0,
                transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
              }
            : undefined}
          onLoad={(e) => {
            setLoaded(true);
            const el = e.currentTarget;
            setInfo((prev) => ({
              ...prev,
              width: el.naturalWidth,
              height: el.naturalHeight,
            }));
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}
