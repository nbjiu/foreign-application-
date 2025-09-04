/** @format */

import dynamic from "next/dynamic";

// PDF 컴포넌트를 클라이언트에서만 로드
const PdfAnnotator = dynamic(() => import("@/components/PdfAnnotator"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
            <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                <p className="text-gray-600">PDF 뷰어를 로드하고 있습니다...</p>
            </div>
        </div>
    ),
});

export default function Home() {
    return (
        <main className="mx-auto max-w-5xl p-4">
            <h1 className="text-2xl font-semibold mb-4">
                외화송금신청서 - 텍스트 입력 데모
            </h1>
            <PdfAnnotator pdfUrl="/assets/application.pdf" />
            <p className="text-sm text-gray-500 mt-4">
                • &ldquo;텍스트 추가&rdquo; → PDF 위 원하는 곳을 클릭 → 내용을
                입력하세요. 드래그로 이동, 슬라이더로 폰트 크기 조절 가능. 저장
                버튼으로 PDF로 내보내기.
            </p>
        </main>
    );
}
