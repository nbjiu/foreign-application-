/** @format */

"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { clsx } from "clsx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// pdfjs 설정 - 클라이언트에서만 실행
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjs: any = null;

type Ann = {
    id: string;
    pageIndex: number;
    x: number; // canvas 픽셀 좌표 (1:1 매핑)
    y: number;
    text: string;
    fontSize: number;
    selected: boolean;
};

export default function PdfAnnotator({ pdfUrl }: { pdfUrl: string }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [, setPdf] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [page, setPage] = useState<any>(null);
    const [renderScale] = useState(1.5); // 고정 렌더링 스케일
    const [canvasSize, setCanvasSize] = useState<{
        w: number;
        h: number;
    } | null>(null);
    const [pdfSize, setPdfSize] = useState<{
        w: number;
        h: number;
    } | null>(null);

    const [addingMode, setAddingMode] = useState(false);
    const [anns, setAnns] = useState<Ann[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [pdfjsLoaded, setPdfjsLoaded] = useState(false);
    const [zoom, setZoom] = useState(100); // 줌 레벨 (%)

    const activeAnn = useMemo(
        () => anns.find((a) => a.id === activeId),
        [anns, activeId]
    );

    // pdfjs 초기화
    useEffect(() => {
        const initPdfjs = () => {
            if (typeof window !== "undefined" && !pdfjs) {
                console.log("PDF.js를 CDN에서 로드 중...");

                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.href =
                    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf_viewer.min.css";
                document.head.appendChild(link);

                const script = document.createElement("script");
                script.src =
                    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
                script.onload = () => {
                    console.log("PDF.js CDN 로드 완료");
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    pdfjs = (window as any).pdfjsLib;
                    if (pdfjs) {
                        pdfjs.GlobalWorkerOptions.workerSrc =
                            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
                        console.log("PDF.js 워커 설정 완료");
                        setPdfjsLoaded(true);
                    } else {
                        console.error(
                            "PDF.js 로드되었지만 pdfjsLib을 찾을 수 없음"
                        );
                    }
                };
                script.onerror = () => {
                    console.error("PDF.js CDN 로드 실패");
                };
                document.head.appendChild(script);
            }
        };

        initPdfjs();
    }, []);

    // PDF 로드 및 렌더링
    useEffect(() => {
        if (!pdfjs || !pdfjsLoaded) return;

        let mounted = true;
        (async () => {
            const doc = await pdfjs.getDocument(pdfUrl).promise;
            if (!mounted) return;
            setPdf(doc);
            const p = await doc.getPage(1);
            if (!mounted) return;
            setPage(p);

            // PDF 원본 크기 (72 DPI 기준 포인트)
            const viewport = p.getViewport({ scale: 1 });
            setPdfSize({ w: viewport.width, h: viewport.height });

            // 캔버스 렌더링 (고정 스케일)
            const renderViewport = p.getViewport({ scale: renderScale });
            setCanvasSize({
                w: renderViewport.width,
                h: renderViewport.height,
            });

            const canvas = canvasRef.current!;
            const ctx = canvas.getContext("2d")!;
            canvas.width = Math.floor(renderViewport.width);
            canvas.height = Math.floor(renderViewport.height);

            await p.render({
                canvasContext: ctx,
                viewport: renderViewport,
                canvas,
            }).promise;

            console.log("PDF 렌더링 완료:", {
                pdfOriginalSize: { w: viewport.width, h: viewport.height },
                canvasSize: {
                    w: renderViewport.width,
                    h: renderViewport.height,
                },
                renderScale: renderScale,
            });
        })();
        return () => {
            mounted = false;
        };
    }, [pdfUrl, pdfjsLoaded, renderScale]);

    // 줌 변경 시 캔버스 스타일 업데이트
    const canvasStyle = useMemo(() => {
        if (!canvasSize) return {};

        const scale = zoom / 100;
        return {
            width: `${canvasSize.w * scale}px`,
            height: `${canvasSize.h * scale}px`,
            outline: "1px solid #e5e7eb",
            background: "#fff",
        };
    }, [canvasSize, zoom]);

    // 어노테이션 스타일 (줌 적용)
    const getAnnotationStyle = (ann: Ann) => {
        const scale = zoom / 100;
        return {
            left: ann.x * scale,
            top: ann.y * scale,
            fontSize: ann.fontSize * scale,
            lineHeight: 1.2,
            background: "transparent",
            userSelect: "none" as const,
            padding: ann.selected ? 2 * scale : 0,
            zIndex: 1,
        };
    };

    const handleCanvasClick = (e: React.MouseEvent) => {
        if (!addingMode || !canvasSize) return;

        const canvas = e.target as HTMLCanvasElement;
        const rect = canvas.getBoundingClientRect();
        const scale = zoom / 100;

        // 화면 좌표를 캔버스 좌표로 변환
        const canvasX = (e.clientX - rect.left) / scale;
        const canvasY = (e.clientY - rect.top) / scale;

        const id = crypto.randomUUID();
        const newAnn: Ann = {
            id,
            pageIndex: 0,
            x: canvasX - 60,
            y: canvasY - 16,
            text: "Your text",
            fontSize: 24,
            selected: true,
        };

        setAnns((prev) => [
            ...prev.map((a) => ({ ...a, selected: false })),
            newAnn,
        ]);
        setActiveId(id);
        setAddingMode(false);
    };

    // 드래그 상태 관리
    const [dragState, setDragState] = useState<{
        isDragging: boolean;
        dragId: string | null;
        startPos: { x: number; y: number };
        offset: { x: number; y: number };
    }>({
        isDragging: false,
        dragId: null,
        startPos: { x: 0, y: 0 },
        offset: { x: 0, y: 0 },
    });

    const selectAnn = (id: string) => {
        setAnns((prev) => prev.map((a) => ({ ...a, selected: a.id === id })));
        setActiveId(id);
    };

    // 드래그 시작
    const handleMouseDown = (e: React.MouseEvent, ann: Ann) => {
        e.preventDefault();
        e.stopPropagation();

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scale = zoom / 100;

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setDragState({
            isDragging: true,
            dragId: ann.id,
            startPos: { x: mouseX, y: mouseY },
            offset: {
                x: mouseX - ann.x * scale,
                y: mouseY - ann.y * scale,
            },
        });

        selectAnn(ann.id);
    };

    // 드래그 중
    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (
                !dragState.isDragging ||
                !dragState.dragId ||
                !canvasRef.current
            )
                return;

            const canvas = canvasRef.current;
            const rect = canvas.getBoundingClientRect();
            const scale = zoom / 100;

            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const canvasX = (mouseX - dragState.offset.x) / scale;
            const canvasY = (mouseY - dragState.offset.y) / scale;

            setAnns((prev) =>
                prev.map((a) =>
                    a.id === dragState.dragId
                        ? { ...a, x: canvasX, y: canvasY }
                        : a
                )
            );
        },
        [dragState, zoom]
    );

    // 드래그 종료
    const handleMouseUp = useCallback(() => {
        setDragState({
            isDragging: false,
            dragId: null,
            startPos: { x: 0, y: 0 },
            offset: { x: 0, y: 0 },
        });
    }, []);

    // 마우스 이벤트 리스너 등록
    useEffect(() => {
        if (dragState.isDragging) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
            return () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            };
        }
    }, [dragState.isDragging, handleMouseMove, handleMouseUp]);

    const updateActive = (patch: Partial<Ann>) => {
        if (!activeId) return;
        setAnns((prev) =>
            prev.map((a) => (a.id === activeId ? { ...a, ...patch } : a))
        );
    };

    const deleteActive = () => {
        if (!activeId) return;
        setAnns((prev) => prev.filter((a) => a.id !== activeId));
        setActiveId(null);
    };

    // PDF 저장 - 캔버스 좌표를 PDF 좌표로 변환
    const handleSavePdf = async () => {
        if (!page || !canvasSize || !pdfSize) return;

        const ab = await fetch(pdfUrl).then((r) => r.arrayBuffer());
        const pdfDoc = await PDFDocument.load(ab);
        const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const firstPage = pdfDoc.getPage(0);

        // 캔버스 좌표를 PDF 좌표로 변환하는 비율
        const scaleX = pdfSize.w / canvasSize.w;
        const scaleY = pdfSize.h / canvasSize.h;

        console.log("PDF 저장 좌표 변환:", {
            canvasSize,
            pdfSize,
            scale: { x: scaleX, y: scaleY },
        });

        anns.forEach((a) => {
            if (a.pageIndex !== 0) return;

            // 캔버스 좌표를 PDF 좌표로 변환
            const pdfX = a.x * scaleX;
            const pdfY = pdfSize.h - a.y * scaleY - a.fontSize * scaleY;
            const pdfFontSize = a.fontSize * scaleY;

            console.log(`Annotation ${a.id}:`, {
                canvasPos: { x: a.x, y: a.y },
                pdfPos: { x: pdfX, y: pdfY },
                fontSize: { canvas: a.fontSize, pdf: pdfFontSize },
            });

            firstPage.drawText(a.text, {
                x: pdfX,
                y: pdfY,
                size: pdfFontSize,
                font: helv,
                color: rgb(0, 0, 0),
            });
        });

        const bytes = await pdfDoc.save();
        const blob = new Blob([new Uint8Array(bytes)], {
            type: "application/pdf",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "외화송금신청서" + new Date().toISOString() + ".pdf";
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!pdfjs || !pdfjsLoaded) {
        return (
            <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                    <p className="text-gray-600">
                        PDF 뷰어를 로드하고 있습니다...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setAddingMode((v) => !v)}
                    className={clsx(
                        "px-3 py-2 rounded-lg border",
                        addingMode ? "bg-black text-white" : "bg-white"
                    )}
                >
                    텍스트 추가
                </button>

                <button
                    onClick={handleSavePdf}
                    className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-100"
                >
                    저장(PDF)
                </button>

                <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">줌:</label>
                    <select
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="px-2 py-1 border rounded text-sm"
                    >
                        <option value={50}>50%</option>
                        <option value={75}>75%</option>
                        <option value={100}>100%</option>
                        <option value={125}>125%</option>
                        <option value={150}>150%</option>
                        <option value={200}>200%</option>
                    </select>
                </div>

                {activeAnn && (
                    <div className="ml-auto flex items-center gap-2">
                        <input
                            className="px-2 py-1 border rounded w-72"
                            value={activeAnn.text}
                            onChange={(e) =>
                                updateActive({ text: e.target.value })
                            }
                            placeholder="텍스트 입력"
                        />
                        <label className="text-sm text-gray-500">Font</label>
                        <input
                            type="range"
                            min={8}
                            max={72}
                            value={activeAnn.fontSize}
                            onChange={(e) =>
                                updateActive({
                                    fontSize: Number(e.target.value),
                                })
                            }
                        />
                        <span className="text-xs text-gray-500 w-8">
                            {activeAnn.fontSize}px
                        </span>
                        <button
                            onClick={deleteActive}
                            className="px-2 py-1 border rounded bg-white hover:bg-gray-100"
                        >
                            삭제
                        </button>
                    </div>
                )}
            </div>

            {/* Viewer Container - 스크롤 가능 */}
            <div
                ref={containerRef}
                className="relative border border-gray-300 bg-gray-50"
                style={{
                    width: "100%",
                    height: "600px",
                    overflow: "auto",
                }}
            >
                <div className="relative inline-block">
                    <canvas
                        ref={canvasRef}
                        onClick={handleCanvasClick}
                        className={clsx(
                            "block",
                            addingMode && "cursor-crosshair"
                        )}
                        style={canvasStyle}
                    />
                    {/* Overlay annotations */}
                    {anns.map((a) => (
                        <div
                            key={a.id}
                            onMouseDown={(e) => handleMouseDown(e, a)}
                            onClick={(e) => {
                                e.stopPropagation();
                                selectAnn(a.id);
                            }}
                            className={clsx(
                                "absolute select-none",
                                a.selected ? "ring-2 ring-blue-500" : "ring-0",
                                dragState.isDragging &&
                                    dragState.dragId === a.id
                                    ? "cursor-grabbing"
                                    : "cursor-grab"
                            )}
                            style={getAnnotationStyle(a)}
                        >
                            <span className="bg-transparent pointer-events-none">
                                {a.text}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="text-xs text-gray-500">
                팁: &ldquo;텍스트 추가&rdquo;를 클릭한 후 PDF를 클릭하여
                텍스트를 추가하세요. 텍스트를 드래그하여 위치를 조정할 수
                있습니다. 줌을 조절하여 정확한 위치 지정이 가능합니다.
            </div>
        </div>
    );
}
