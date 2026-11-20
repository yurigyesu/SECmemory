# SECmemory 제작 플랜

삼성전자 메모리 칩의 **실물 패키지 레이저 각인(Top Marking)** 및 **풀 파트넘버(Ordering Part Number)**를 입력하거나 자리별 스크롤 드럼을 조작하면 메모리의 규격과 세그먼트별 상세 정보를 즉시 확인할 수 있는 웹 애플리케이션 제작 플랜입니다.

- **호스팅**: GitHub Actions → GitHub Pages 정적 배포
- **UI 베이스**: [ui.png](./ui.png) 조합형 세로 스크롤 드럼 레이아웃
- **데이터베이스**: 빌드 타임 SQLite 바이너리 생성(`node:sqlite`) + 브라우저 런타임 SQLite WASM(`sql.js`) 및 IndexedDB 영속화

---

## 1. 프로젝트 개요 및 핵심 컨셉

실제 하드웨어 엔지니어, 수리 작업자, BOM 검수자, PC·오버클럭 사용자는 공식 데이터시트 파트넘버(`K4AAG085WB-BCWE`)뿐 아니라 **실물 IC 표면에 여러 줄로 축약 각인된 문자열**을 보고 메모리 사양을 판독해야 합니다.

```text
SEC 216 BCWE        ← 1줄: 제조사(SEC) + 제조주차(YWW) + 속도/온도 접미사
K4AAG08 5WB         ← 2줄: 기본 파트넘버 (패밀리·용량·비트구성·뱅크·전압·다이 리비전)
GPB1349R            ← 3줄: 웨이퍼/조립 로트(Lot) 추적 코드
```

본 웹 페이지는 **입력 기반 디코딩**과 **탐색형 스크롤 드럼 조합**을 결합해 다음 두 워크플로우를 하나의 화면에서 자연스럽게 처리합니다.

- **통합 입력 & 실물 각인 해석**: 풀 파트넘버 한 줄, 공백·하이픈이 누락된 문자열, 또는 실물 칩 다중 줄 각인을 그대로 붙여넣으면 `SEC`·제조주차(`YWW`)·로트 코드를 분리하고 파트넘버를 복원해 즉시 해석합니다. (보조 토글로 1줄/2줄/3줄 분리 입력 가이드도 제공합니다.)
- **조합형 드럼 탐색**: [ui.png](./ui.png) 구조에 따라 코드의 각 자리를 세로로 스크롤하여 값을 변경하면, 완성된 파트넘버와 각 자리별 상세 설명·칩 스펙이 실시간으로 갱신됩니다.

---

## 2. 디자인 & UX 아키텍처 (`ui.png` 베이스)

[ui.png](./ui.png)의 **조합형 다이얼(Combination-Lock) 구조**를 중심 레이아웃으로 삼아 상단 입력란, 중단 스크롤 드럼, 하단 설명 패널이 실시간 양방향으로 연동되도록 설계합니다. (아래 다이어그램은 `K4AAG085WB-BCWE`를 입력·선택한 상태의 예시입니다.)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  입력란                       K4AAG085WB-BCWE                            │
└─────────────────────────────────────────────────────────────────────────┘
   스크롤로 변경
┌───┬───┬───┬────┬────┬───┬───┬───┬───┬───┬───┬────┐  ◀ 수평 선택 프레임(Active Bar)
│ K │ 4 │ A │ AG │ 08 │ 5 │ W │ B │ - │ B │ C │ WE │  ◀ 현재 코드 세그먼트 정렬
└───┴───┴───┴────┴────┴───┴───┴───┴───┴───┴───┴────┘
      │   │    │    │   │   │   │       │   │    │
      │ 3 │ B  │ 4G │04 │ 4 │ … │ M     │ F │ I  │ PB   ◀ 각 자리별 세로 스크롤 드럼
      │ 9 │ R  │ 8G │16 │ … │   │ A     │ … │ T  │ RC      (휠·드래그·클릭·↑↓키 조작)
      │ L │ Z  │ BG │   │   │   │ C     │   │    │ TD
      │   │ V  │    │   │   │   │ D     │   │    │ VF
      └───┘ (활성 컬럼 강조 프레임)

┌─────────────────────────────────────────────────────────────────────────┐
│  각 코드 부분 설명                                                       │
│  1) 현재 선택/스크롤 중인 코드 자리 집중 설명 카드                        │
│  2) 조합된 칩의 핵심 스펙 요약 (용량 Gb/GB, 구성, 속도·타이밍, 전압, 다이) │
│  3) 전체 코드 세그먼트별 1:1 상세 해석 테이블 (행 클릭 ↔ 위 드럼 포커스)  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.1 핵심 인터랙션 설계

1. **상단 `입력란` ↔ 중단 `스크롤로 변경` 실시간 양방향 동기화**
   - 초기 로드 시 상단 `입력란`은 기본값과 플레이스홀더(`placeholder`) 모두 **빈칸(`""`)**으로 시작합니다. (단, `?code=...` URL 쿼리가 있는 경우 해당 코드를 로드)
   - 빈 상태에서는 드럼과 하단 `각 코드 부분 설명` 영역이 대기 상태를 유지하며, 사용자가 직접 코드를 입력·붙여넣기하거나 드럼을 스크롤(또는 카탈로그에서 칩을 선택)하는 즉시 양방향 연동과 세그먼트 해석이 활성화됩니다.
   - 상단 `입력란`에 풀 파트넘버(`K4RAH086VB-BCQK`) 또는 실물 칩 다중 줄 각인(`SEC 216 BCWE / K4AAG08 5WB`)을 입력·붙여넣기하면 각 세그먼트를 파싱하고, 아래 세로 드럼들이 해당 문자 위치로 자동 스냅됩니다.
   - 중단 세로 드럼 중 어느 자리든 **마우스 휠 / 터치 스크롤 / 위아래 인접 값 클릭 / 키보드 `↑↓` 키**로 변경하면 상단 `입력란` 문자열과 하단 `각 코드 부분 설명`이 즉시 갱신됩니다.
2. **상위 자리 변경 시 하위 드럼 자동 연동 (SQLite 동적 조회)**
   - 1~3번째 자리(`K`↔`M`, `4` DRAM ↔ `3` MCP/PoP ↔ `9` NAND ↔ `L` eMMC/UFS, `A` DDR4 ↔ `R` DDR5 ↔ `B` DDR3 ↔ `G/Z/V` GDDR5/6/7 ↔ `E/F/U` LPDDR3/4/4X)를 스크롤해 제품군을 바꾸면, SQLite에서 해당 제품군의 슬롯 스키마(`code_slots`)와 후보 옵션(`code_options`)을 즉시 조회해 오른쪽 하위 드럼 구성을 자동 전환합니다.
3. **하단 `각 코드 부분 설명` & 실용 도구**
   - **활성 자리 집중 설명**: 현재 마우스가 올라가거나 스크롤·포커스된 세로 드럼의 코드 의미와 같은 자리의 형제 옵션 목록을 바로 아래 집중 카드로 표시합니다.
   - **핵심 스펙 요약 카드**: 제품군, 단일 칩 용량(`Gb` + `GB/MB` 환산), 비트 구성(`2G × 8` 등), 동작 속도·클럭·타이밍(`DDR4-3200, CL22-22-22`), 동작 전압, 다이 리비전, 패키지, 제조주차(`YWW`)를 한눈에 정리합니다.
   - **전체 세그먼트 1:1 해석 테이블**: 코드 내 모든 자리의 문자·항목명·해석·신뢰도를 표로 보여 주며, 행 클릭 시 상단 해당 드럼 컬럼으로 포커스·강조됩니다.
   - **다중 칩 구성 계산기**: 현재 해석된 단일 IC를 기준으로 4/8/16/32개 구성 시 총 모듈/VRAM 용량 및 버스 폭·대역폭(`GB/s`)을 즉시 계산합니다.
   - **미니멀 상단 유틸리티 바**: [ui.png](./ui.png) 메인 화면의 집중도를 해치지 않도록 간결한 헤더에 대표 칩 카탈로그/DB 관리 드로어 열기, URL 공유(`?code=`), 스펙 복사(텍스트/JSON), 라이트/다크 2-상태 테마 토글을 배치합니다.

### 2.2 시각 디자인 토큰

- **색상 팔레트 (`light-dark()`)**
  - **라이트 (클린룸 포슬린)**: 배경 `#F5F7FA`, 카드 `#FFFFFF`, 경계 `#D8E0EA`, 본문 `#0E1726`, 보조 `#4A5A70`, 브랜드 포인트 `#1428A0`
  - **다크 (다크 랩)**: 배경 `#0F141C`, 카드 `#161D27`, 경계 `#273244`, 본문 `#E8EEF6`, 보조 `#8FA0B8`, 브랜드 포인트 `#4C7DFF`
  - **세그먼트 분류 색**: 패밀리(코발트), 용량/구성(틸 `#0E7C66`), 다이 리비전(앰버 `#B45309`), 속도/타이밍(인디고 `#3B4CCA`), 패키지/온도(슬레이트 `#475569`)
- **타이포그래피**
  - UI/한글 설명: `Pretendard` (시스템 한글 폰트 폴백 포함)
  - 마킹 코드·드럼 문자·수치·타이밍: `JetBrains Mono` (`tabular-nums`, 대문자 트래킹 적용)

---

## 3. 지원 삼성 메모리 제품군 및 디코딩 범위

SQLite에 저장된 자리별 규칙 데이터와 대표 칩 레퍼런스 카탈로그(`known_chips`)를 결합해, 공식 규칙 외 코드가 입력되어도 **해석 가능한 구간은 모두 표시하고 미정의 구간만 명확히 구분(`정확 일치` / `추정` / `미정의`)**합니다.

| 제품군 | 접두사 | 주요 디코딩 항목 | 대표 예시 |
| :--- | :--- | :--- | :--- |
| **DDR4 SDRAM** | `K4A` | 용량(4Gb~32Gb), x4/x8/x16, 뱅크, 1.2V(W), **다이 리비전(B-die/C-die 등)**, 패키지(78/96-FBGA), 온도, 속도/타이밍(`PB/RC/TD/VF/WE`) | `K4AAG085WB-BCWE`<br>`K4A8G085WB-BCRC` |
| **DDR5 SDRAM** | `K4R` | 용량(16Gb/24Gb/32Gb), x4/x8/x16, 뱅크그룹, 1.1V(V), 다이 리비전, FBGA, 온도, 속도(`QK` 4800 / `WM` 5600 / `CP` 6400 MT/s) | `K4RAH086VB-BCQK` |
| **DDR3 / DDR3L** | `K4B` | 용량(512Mb~8Gb), x4/x8/x16, 8뱅크, 다이 리비전, **전압 구분(`BC` 1.5V / `BY` 1.35V DDR3L)**, 속도(`K0/MA/NB`) | `K4B4G0846E-BYK0` |
| **GDDR5 / 6 / 7** | `K4G`, `K4Z`, `K4V` | 세대(GDDR5/6/7 PAM3), 용량(4Gb~24Gb), x32 구성, 전압, 다이 리비전, 핀당 속도(`12~32 Gbps`) 및 **단일 칩 대역폭(`GB/s`)** 계산 | `K4ZAF325BM-HC16`<br>`K4VAF325ZC-SC28` |
| **LPDDR3 ~ 5X** | `K4E`, `K4F`, `K4U`, `K3L`, `K3LK`, `K3KL` | 세대(LPDDR3/4/4X/5/5X), 단품(Discrete) vs PoP/MCP 적층 패키지 구분, 용량·채널·저전압 I/O(VDDQ), 속도 등급 | `K4U6E3S4AA-MGCR`<br>`K3LK7K70BM-BGCP` |
| **Raw NAND Flash** | `K9` | 셀 타입(SLC/MLC/TLC/V-NAND), 용량, x8/x16, Vcc(1.8V/3.3V), nCE 모드, 세대, TSOP1/FBGA 패키지 | `K9F1G08U0E-SCB0` |
| **eMMC / UFS** | `KLM`, `KLU` | 용량(8GB~1TB), eMMC 5.x / UFS 2.1~4.x 규격, 153-FBGA 패키지 및 상업/전장 온도 등급 | `KLMBG2JETD-B041`<br>`KLUDG4UHDC-B0E1` |
| **DRAM 모듈(DIMM)** | `M378`, `M471`, `M393`, `M386`, `M391`, `M323`, `M425`, `M321`, `M324` | 폼팩터(UDIMM/SODIMM/RDIMM/LRDIMM/ECC), DDR3/4/5 세대, 모듈 용량·Rank, 탑재 다이 리비전, PCB 리비전, 속도 | `M378A2K43CB2-CTD`<br>`M323R2GA3BB0-CQK` |

### 실물 칩 공통 메타데이터 파싱
- **제조사 식별자 분리**: 상단 마킹의 `SEC` (Samsung Electronics Co., Ltd.) 자동 인식 및 분리
- **제조 주차 (`YWW`) 스마트 추론**: 1자리 연도(`Y`) + 2자리 주차(`WW`)를 파싱하되, 메모리 세대 출시 연도를 반영해 10년 주기 모호성을 해소 (예: DDR4 `K4A` + `919` → `2019년 19주차`, DDR5 `K4R` + `322` → `2023년 22주차`)
- **로트(Lot) 코드 분리**: 칩 하단 웨이퍼/조립 추적 코드(`GPB1349R` 등)를 파트넘버와 분리해 메타 배지로 표시

---

## 4. SQLite 데이터베이스 아키텍처

GitHub Pages(정적 호스팅) 환경에서도 **실제 SQLite 3 바이너리 파일(`.sqlite`)**을 단일 진실 공급원(Single Source of Truth)으로 사용하고 브라우저에서 직접 SQL 쿼리를 실행합니다.

### 4.1 빌드 타임 SQLite 생성 (`db/` → `public/db/secmemory.sqlite`)

- **`db/schema.sql`** (`PRAGMA foreign_keys = ON`):
  - `families`: 메모리 제품군 메타데이터 (`family_key`, 접두사 패턴, 설명, 출시 기준 연도, 기본 샘플 코드)
  - `code_slots`: 제품군별 드럼 컬럼(자리) 정의 (`slot_order`, `slot_key`, `label_ko`, `label_en`, `char_start`, `char_length`, `is_separator`, `color_group`, `help_ko`)
  - `code_options`: 각 세로 드럼에 표시되는 선택지 및 해석 데이터 (`code_value`, `short_label`, `title_ko`, `detail_ko`, `meta_json`, `sort_order`)
  - `known_chips`: 검증된 대표 삼성 메모리 칩·모듈 30종 이상 (`K4AAG085WB-BCWE` 포함, 실물 각인 예시·패키지·전압·속도·비고)
  - `user_custom_chips`: 사용자가 직접 등록한 커스텀 칩 코드 및 메모
  - `lookup_history`: 최근 조회·디코딩한 코드 히스토리
  - `db_metadata`: 스키마 버전 및 DB 빌드 일시
- **`db/seed.sql`**: 공식 데이터시트 기반 초기 시드 데이터 SQL
- **`scripts/build-db.mjs`**: Node.js 24 내장 **`node:sqlite` (`DatabaseSync`)**로 `schema.sql` + `seed.sql`을 실행해 **`public/db/secmemory.sqlite`** 바이너리를 생성하고, `PRAGMA integrity_check` 및 `PRAGMA foreign_key_check`로 무결성을 자동 검증합니다.

### 4.2 브라우저 런타임 SQLite 실행 (`sql.js` WebAssembly)

- **`sql.js`**(SQLite 3 WASM)를 사용해 브라우저에서 `./db/secmemory.sqlite`를 로드하고 실제 `SELECT` 쿼리로 드럼 옵션, 세그먼트 디코딩, 대표 칩 카탈로그 검색을 수행합니다.
- `scripts/copy-wasm.mjs`를 통해 `sql-wasm.wasm`을 **`public/wasm/sql-wasm.wasm`**에 복사·번들링하여 외부 CDN 없이 오프라인 및 GitHub Pages 환경에서도 안정적으로 동작합니다.
- **로컬 쓰기·영속화 및 DB 관리**:
  - 사용자가 새 커스텀 칩을 저장하거나 조회 기록이 쌓이면 브라우저 내 SQLite 인스턴스에 `INSERT`하고, `db.export()` 바이너리를 **IndexedDB**에 자동 저장합니다.
  - 카탈로그/DB 드로어에서 **`.sqlite` 파일 다운로드(Export)**, **사용자 `.sqlite` 파일 불러오기(Import)**, **기본 DB로 초기화** 기능을 제공합니다.

---

## 5. GitHub Actions 호스팅 (GitHub Pages CI/CD)

`.github/workflows/deploy.yml`을 구성해 `main` 브랜치 푸시 또는 수동 실행(`workflow_dispatch`) 시 자동으로 **SQLite DB 빌드 → 단위 테스트 → 정적 프로덕션 빌드 → GitHub Pages 배포**까지 수행합니다.

- **워크플로우 실행 파이프라인**:
  1. `actions/checkout@v4` 및 `actions/setup-node@v4` (Node.js 24, npm 캐시 활성화)
  2. `npm ci`
  3. `npm run build:db` (`db/*.sql` → `public/db/secmemory.sqlite` 생성 및 무결성 검증)
  4. `npm test` (Vitest — 실제 생성된 SQLite DB 기반 디코더/파서 테스트 통과 필수)
  5. `npm run build` (`tsc --noEmit` + `vite build`, `vite.config.ts`의 `base: './'` 설정으로 `https://<user>.github.io/<repo>/` 서브경로와 커스텀 도메인 모두에서 에셋·DB·WASM 404 없이 동작)
  6. `actions/configure-pages@v5` → `actions/upload-pages-artifact@v3` (`./dist`) → `actions/deploy-pages@v4`
- **`public/.nojekyll`** 파일을 포함해 Jekyll 처리 우회 및 정적 자산 서빙을 보장합니다.
- **`README.md`**에 로컬 실행/DB 빌드 방법과 GitHub 저장소의 `Settings → Pages → Source: GitHub Actions` 활성화 절차를 안내합니다.

---

## 6. 프로젝트 파일 구조

```text
d:\PROJECT\SECmemory\
├── .github/
│   └── workflows/
│       └── deploy.yml                # GitHub Actions → GitHub Pages 자동 빌드·테스트·배포
├── db/
│   ├── schema.sql                    # SQLite 테이블/인덱스/외래키 스키마
│   └── seed.sql                      # 8개 제품군 슬롯·옵션 및 대표 칩 30종+ 시드 SQL
├── scripts/
│   ├── build-db.mjs                  # node:sqlite로 public/db/secmemory.sqlite 생성 및 검증
│   └── copy-wasm.mjs                 # sql.js WASM 파일을 public/wasm/으로 복사
├── public/
│   ├── .nojekyll                     # GitHub Pages Jekyll 우회 마커
│   ├── db/
│   │   └── secmemory.sqlite          # 빌드 생성 SQLite 3 DB 파일
│   └── wasm/
│       └── sql-wasm.wasm             # 로컬 번들 SQLite WASM 런타임
├── index.html                        # color-scheme 메타 + FOUC 방지 인라인 스크립트
├── package.json                      # Vite, React 19, TypeScript, sql.js, Vitest
├── tsconfig.json
├── vite.config.ts                    # base: './' (GitHub Pages 서브경로 대응)
├── README.md                         # 로컬 실행, DB 갱신, GitHub Pages 배포 가이드
├── PLAN.md                           # 프로젝트 제작 플랜 문서
├── ui.png                            # 디자인 베이스 레퍼런스 이미지
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── styles/
    │   ├── tokens.css                # 클린룸 라이트/다크 토큰(light-dark()), 세그먼트 색상
    │   ├── base.css                  # 리셋, 포커스 링, reduced-motion, .visually-hidden
    │   └── layout.css                # ui.png 기반 입력란·스크롤 드럼 바·해석 패널·반응형 테이블
    ├── db/
    │   ├── types.ts                  # FamilyRow, CodeSlotRow, CodeOptionRow, KnownChipRow
    │   ├── sqliteClient.ts           # sql.js 로더, IndexedDB 영속화, .sqlite Export/Import
    │   └── queries.ts                # 패밀리/슬롯/옵션/대표칩 SQL 쿼리 레이어
    ├── decoder/
    │   ├── normalizer.ts             # 실물 다중 줄 각인(SEC/YWW/Lot) 분리 및 파트넘버 복원
    │   ├── dateCode.ts               # YWW 제조주차 파싱 및 세대별 연대 추론
    │   ├── engine.ts                 # SQLite 데이터 기반 세그먼트 디코딩·파생 스펙/대역폭 계산
    │   └── compose.ts                # 드럼 값 변경 → 파트넘버 조합 & 상위 자리 변경 시 하위 슬롯 매핑
    ├── components/
    │   ├── TopHeader.tsx             # 간결한 헤더(로고, DB/카탈로그 버튼, 공유·복사, 테마 토글)
    │   ├── CodeInputBar.tsx          # ui.png 상단 입력란 (한 줄/다중 줄 각인 인식 + 접근성 검증)
    │   ├── ScrollDrumDeck.tsx        # ui.png 중단 수평 프레임 + 자리별 세로 스크롤 드럼 매트릭스
    │   ├── DrumColumn.tsx            # 개별 세로 스크롤 휠 (scroll-snap, 휠/클릭/키보드 제어)
    │   ├── SegmentExplanation.tsx    # ui.png 하단 각 코드 부분 설명 (집중 카드 + 핵심 스펙 + 테이블)
    │   ├── ModuleCalculator.tsx      # 다중 칩(4/8/16/32 IC) 용량·대역폭 계산기
    │   └── CatalogAndDbDrawer.tsx    # SQLite 대표 칩 검색·선택, 커스텀 칩 저장, .sqlite Export/Import
    ├── utils/
    │   ├── accessibleValidation.ts   # :user-invalid ↔ aria-invalid / polite live-region 브리지
    │   └── theme.ts                  # <meta name="color-scheme"> 기반 2-상태 테마 동기화
    └── __tests__/
        ├── sqlite-db.test.ts         # 빌드된 secmemory.sqlite 스키마/시드/쿼리 무결성 테스트
        ├── normalizer.test.ts        # 다중 줄 각인·YWW·로트 추출 테스트
        └── decoder.test.ts           # 8개 제품군 디코딩 + 드럼 조합 왕복(round-trip) 테스트
```

---

## 7. 단계별 실행 및 검증 순서

1. **Phase 1 — 프로젝트 초기화 & SQLite 빌드 파이프라인**
   - Vite + React 19 + TypeScript + `sql.js` + Vitest 스캐폴딩 (`vite.config.ts`에 `base: './'` 설정)
   - `db/schema.sql`, `db/seed.sql`, `scripts/build-db.mjs`, `scripts/copy-wasm.mjs` 작성
   - `npm run build:db` 실행 → `public/db/secmemory.sqlite` 생성 및 `PRAGMA integrity_check` / `foreign_key_check` 통과 확인
2. **Phase 2 — SQLite 쿼리 레이어 & 디코딩/드럼 조합 엔진**
   - `src/db/sqliteClient.ts`, `src/db/queries.ts`, `src/decoder/*` 구현
   - Vitest(`sqlite-db.test.ts`, `normalizer.test.ts`, `decoder.test.ts`) 실행 및 골든 케이스(8개 제품군·30종+ 칩·다중 줄 각인·드럼 왕복 조합) 통과 확인
3. **Phase 3 — `ui.png` 기반 스크롤 드럼 UI & DB 드로어 구현**
   - 상단 `입력란` → 중단 수평 선택 프레임 + 자리별 세로 스크롤 드럼(`ScrollDrumDeck` / `DrumColumn`) → 하단 `각 코드 부분 설명`(`SegmentExplanation`) 구현
   - 마우스 휠, 터치 스냅, 인접 값 클릭, 키보드 `↑↓←→` 탐색 및 양방향 상태 동기화 연결
   - `ModuleCalculator`, `CatalogAndDbDrawer` (대표 칩 검색, 커스텀 칩 저장, `.sqlite` 내보내기/불러오기/초기화) 구현
4. **Phase 4 — GitHub Actions 워크플로우 & 정적 배포 검증**
   - `.github/workflows/deploy.yml`, `public/.nojekyll`, `README.md` 작성
   - `npx tsc --noEmit`, `npm test`, `npm run build` 실행 및 `npx vite preview`로 정적 빌드 결과물에서 `./db/secmemory.sqlite`·`./wasm/sql-wasm.wasm` 정상 로딩 확인
5. **Phase 5 — 브라우저 E2E 시각·기능 검증**
   - 데스크톱/모바일 뷰포트에서 [ui.png](./ui.png) 레이아웃 일치도, 세로 드럼 스크롤 시 상단 입력란·하단 설명 실시간 갱신, 상위 자리 변경 시 제품군 전환, 실물 다중 줄 각인 붙여넣기, 반응형 테이블 카드 전환, `.sqlite` 내보내기 및 콘솔 오류 0건 확인

---

## 8. 웹 표준 및 접근성 적용 사항

- **`scroll-snap-realtime-feedback`**: 세로 스크롤 드럼 컬럼에서 스크롤 도중 즉각적인 선택 피드백을 제공하기 위해 `scrollsnapchanging` / `scrollsnapchange` 이벤트를 사용하고, 미지원 브라우저(Firefox/Safari)에는 `scroll` + `requestAnimationFrame` + `scrollend` 기하 거리 계산 폴백 및 `focusgroup="toolbar wrap"`용 roving tabindex 폴백을 함께 적용합니다.
- **`scroll-snap-state-sync`**: 스크롤 스냅으로 변경된 활성 자리 상태가 시각적으로만 변하지 않도록 각 드럼 영역에 `tabindex="0"` 및 접근성 이름을 부여하고, 활성 항목에 `aria-current="true"`를 동기화합니다.
- **`responsive-table`**: 하단 `각 코드 부분 설명` 테이블에 `tabindex="0"`·`role="region"`·`aria-labelledby` 래퍼와 `container-type: inline-size`, sticky 헤더, `@container (width < 600px)`에서 `--label-N` CSS 변수를 이용한 카드형 스택 전환을 적용합니다.
- **`accessible-error-announcement`**: 상단 `입력란` 유효성 검증 시 초기 `aria-invalid="false"`를 유지하고 `:user-invalid` 일치 시점에만 `data-error` ID를 `aria-describedby`에 동적 연결하며 단일 `aria-live="polite"` 영역으로 오류를 안내합니다.
- **`dark-mode-toggle`**: `<meta name="color-scheme" content="light dark">`와 FOUC 방지 인라인 스크립트, `:root:has(> head > meta[name="color-scheme"][content="..."])` 매핑, 시스템 설정으로 복귀 가능한 2-상태 라이트/다크 토글을 적용합니다.
