import { BrowserRouter, Routes, Route } from "react-router-dom";

// Phase 4 에서 각 페이지 컴포넌트로 대체될 자리표.
// 현재는 스캐폴딩 검증용 최소 화면.
function Placeholder() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>PharmPoint Toss Plugin</h1>
      <p>SPA 스캐폴딩 준비 완료. 라우터 · 페이지 컴포넌트는 다음 Phase 에서 추가됩니다.</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<Placeholder />} />
      </Routes>
    </BrowserRouter>
  );
}
