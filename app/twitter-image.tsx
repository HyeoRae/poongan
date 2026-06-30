// 트위터 공유 카드 — OG 이미지와 동일 디자인 재사용
// (runtime/size 등 config는 Next가 재export를 인식하지 못하므로 여기서 직접 선언)
import Image from "./opengraph-image";

export const runtime = "edge";
export const alt = "제 4회 풍계모 여름여행 · 통영-거제편";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default Image;
