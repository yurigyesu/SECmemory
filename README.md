# SECmemory — 삼성전자 메모리 칩 마킹 코드 디코더

삼성전자 메모리 반도체 단품 IC 및 메모리 모듈(DIMM/SODIMM)의 **실물 패키지 레이저 각인(Top Marking)** 또는 **풀 파트넘버(Ordering Part Number)**를 입력하거나 자리별 세로 스크롤 드럼을 조작해 상세 규격을 조회할 수 있는 웹 애플리케이션입니다.

## 주요 기능
- **실물 각인 & 파트넘버 양방향 디코딩**:
  - 초기 화면 입력란은 빈칸으로 시작하며, 풀 파트넘버(`K4AAG085WB-BCWE`)나 여러 줄 실물 칩 각인(`SEC 216 BCWE / K4AAG08 5WB / GPB1349R`)을 입력하면 제조사(`SEC`), 제조 주차(`YWW`), 로트 추적 코드, 세그먼트별 의미를 즉시 해석합니다.
  - 중단 자리별 세로 스크롤 드럼(`스크롤로 변경`)을 휠·클릭·키보드(`↑↓←→`)로 변경하면 상단 입력란과 하단 해석이 실시간으로 동기화되며, 1~3번째 상위 자리를 변경하면 제품군이 자동 전환됩니다.
- **지원 제품군**:
  - DDR4 (`K4A`), DDR5 (`K4R`), DDR3/3L (`K4B`), GDDR5/6/7 (`K4G`/`K4Z`/`K4V`), LPDDR3~5X (`K4E`/`K4F`/`K4U`/`K3L`), Raw NAND (`K9`), eMMC/UFS (`KLM`/`KLU`), DRAM 모듈 (`M378`/`M471`/`M393`/`M323`/`M425`/`M321` 등)
- **SQLite 데이터베이스 아키텍처**:
  - 빌드 시 Node.js 24 내장 `node:sqlite`가 `db/schema.sql`과 `db/seed.sql`을 컴파일해 `public/db/secmemory.sqlite` 바이너리를 생성합니다.
  - 브라우저에서는 `sql.js`(SQLite 3 WASM)로 `.sqlite` 파일을 직접 쿼리하고, 커스텀 칩 저장 및 조회 기록을 IndexedDB에 영속화하며 `.sqlite` 파일 내보내기/불러오기를 지원합니다.

## 로컬 개발 및 빌드

> 요구 사항: Node.js 24 이상 (`node:sqlite` 내장 모듈 사용)

```bash
# 의존성 설치
npm install

# SQLite DB 빌드 및 WASM 복사 후 개발 서버 실행
npm run dev

# 단위 테스트 실행 (Vitest)
npm test

# 타입체크 + DB 생성 + 프로덕션 정적 빌드 (dist/)
npm run build
```

`db/schema.sql` 또는 `db/seed.sql`을 수정한 뒤에는 아래 명령으로 `public/db/secmemory.sqlite`를 다시 생성할 수 있습니다.

```bash
npm run build:db
```

## GitHub Actions / GitHub Pages 호스팅 설정

저장소에 포함된 [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)이 `main` 브랜치 푸시 시 자동으로 DB 생성 → Vitest 테스트 → Vite 정적 빌드 → GitHub Pages 배포를 수행합니다.

1. GitHub 저장소로 코드를 푸시합니다.
2. GitHub 저장소의 **Settings → Pages** 메뉴로 이동합니다.
3. **Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
4. `main` 브랜치에 푸시하거나 **Actions** 탭에서 워크플로우를 수동 실행(`workflow_dispatch`)하면 배포가 완료됩니다.
