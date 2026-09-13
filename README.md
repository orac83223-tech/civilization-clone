# 육각의 제국: 새벽의 시대

브라우저 안에서 실행하는 한국어 싱글플레이 턴제 4X 전략 게임입니다. 사람 1명과 규칙 기반 AI 3세력이 시드로 생성한 24×18 육각 대륙에서 경쟁합니다. 설치·가입·서버·유료 API 없이 정적 파일만으로 실행합니다.

**배포 상태:** 2026-09-14 GitHub Pages 활성화 요청이 HTTP 422 `Your current plan does not support GitHub Pages for this repository.`로 거절되었습니다. 저장소는 비공개를 유지하며 실제 공개 플레이 URL은 아직 없습니다. [배포 기록](DEPLOYMENT.md)과 [실행 검증 보고서](TEST_REPORT.md)를 참고하세요.

## 실행 및 다른 환경에서 이어 개발

```sh
git clone https://github.com/orac83223-tech/civilization-clone.git
cd civilization-clone
git switch codex/game-mvp
npm ci
npm run dev
```

Node.js **24.13.1**, npm **11.8.0**, `package-lock.json`을 사용합니다. 비공개 저장소를 읽을 수 있는 GitHub 인증이 필요합니다. 기존 사용자 작업은 초기 커밋과 Git 이력에 보존되어 있습니다. `src/index.html`, `src/main.js`, `src/style.css`, `scripts/build.mjs`는 원래 시작점으로 보존하고, 실제 게임의 진입점은 루트 `index.html` → `src/main.tsx`입니다.

Codespaces 또는 VS Code Dev Containers에서 `.devcontainer/devcontainer.json`을 열면 `npm ci`가 실행됩니다. `npm run dev` 후 Ports의 **5173**을 브라우저로 열면 됩니다. 공개 포트로 바꿀 필요가 없습니다. Codespaces/Actions의 무료 사용량은 계정마다 다르므로 무제한 무료라고 가정하지 않습니다. 대형 게임 엔진이나 공용 Python 패키지 설치는 필요하지 않습니다.

```sh
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run simulate
npm run build
npm run preview
```

운영 빌드는 `dist/`, 미리보기 포트는 **4173**입니다. 게임은 루트 경로와 `/civilization-clone/` 같은 하위 경로를 지원합니다. 초기 로딩 이후 게임 규칙·지도·AI는 네트워크를 사용하지 않습니다. 서비스 워커를 설치하지 않으므로 인터넷 연결 없이 새로고침까지 보장하지는 않습니다.

브라우저 테스트는 원격 CI에서 `npx playwright install --with-deps chromium webkit`, `npm run test:e2e`로 실행합니다. 로컬에서는 기존 Chromium이 있을 때 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`로 실행 파일을 지정할 수 있습니다. 테스트 목적으로 로컬에 브라우저를 자동 다운로드하지 않습니다.

## 처음 플레이

1. 시드를 입력하고 **새로운 시대를 열다**로 시작합니다. 같은 시드는 같은 대륙·자원·시작 위치를 만듭니다.
2. 개척자를 선택하고 **도시 건설**을 누릅니다. 도시에서 생산, 연구 화면에서 첫 기술을 선택합니다.
3. 정찰병을 선택하고 이동 가능한 타일을 누른 뒤 경로를 확인해 이동합니다. 유적을 발견하면 일회성 보상을 받습니다.
4. **턴 종료**로 AI 행동과 라운드 정산을 진행합니다. 생산·연구가 비어 있거나 미행동 유닛이 있어도 경고를 확인하고 진행할 수 있습니다.
5. 도시를 확장하고 타일을 개량하면서 정복·과학·점수 승리를 추구합니다. 모든 도시와 개척자를 잃으면 탈락합니다.

마우스 드래그로 지도 이동, 휠로 확대·축소합니다. 모바일에서는 탭 선택, 드래그 이동, 두 손가락 확대·축소를 지원합니다. 주요 행동은 버튼과 키보드로도 접근할 수 있습니다. 도시 노동 타일 잠금과 집중 변경으로 산출을 조정하세요.

## 승리와 저장

- **정복:** 자신의 수도를 포함해 모든 원래 수도를 동시에 지배합니다. 살아 있는 미정착 세력이 있으면 판정을 유보합니다.
- **과학:** 지식통합까지 연구하고 생산력 160의 대학술원 프로젝트를 완성합니다.
- **점수:** 100라운드 종료 시 공개된 점수식으로 결정합니다. 동시 승리·동률 처리와 세부 수치는 [게임 규칙](GAME_RULES.md), [밸런스](BALANCE.md)에 기록합니다.

자동 저장, 수동 3슬롯, JSON 파일 내보내기·가져오기를 지원합니다. 자동 저장은 정상 복구본 2개를 추가로 보관합니다. 저장 DB 이름은 `hex-empires-dawn-saves-v1`로 다른 앱과 구분합니다. AI 행동은 세력 경계에서 저장하며, 재개할 때 이미 끝난 행동·정산을 반복하지 않습니다. 가져오기 파일은 최대 5MB이며 버전·필드·범위·엔티티 참조를 검증합니다.

브라우저 저장소가 차단되거나 공간이 부족해도 메모리에서 플레이를 계속하고 파일로 내보낼 수 있습니다. 브라우저 데이터 삭제·시크릿 모드·저장소 정리로 세이브가 사라질 수 있으며 기기 간 자동 동기화는 없습니다. 기기를 옮길 때 JSON 파일을 내보내세요.

## 소스 구조

| 경로 | 역할 |
| --- | --- |
| `src/game/core` | 상태·명령 타입, 육각 좌표, 결정론적 상태 전이 |
| `src/game/systems` | 지도·시야·이동·전투·경제·불변식 |
| `src/game/ai` | 관측 정보만 입력받는 Utility AI |
| `src/game/data/balance.ts` | 지형·유닛·건물·기술·정책·수치 |
| `src/render` | Canvas 지도, 카메라·터치·미니맵 |
| `src/ui` | React 패널, 한국어 문자열, 직접 제작한 문장 |
| `src/storage` | 검증된 JSON과 직렬 IndexedDB 저장 |
| `tests`, `scripts/simulate.ts` | 규칙/브라우저/50지도/20AI대전 검증 |

UI와 AI는 `applyCommand(state, actorId, command)`를 사용합니다. 불법 명령은 원본 상태를 보존하고 오류를 반환합니다. 엔진에는 DOM·React·Canvas·네트워크가 없습니다. 규칙 난수는 저장 가능한 xorshift 상태를 사용하며 시간·렌더 프레임에 의존하지 않습니다.

P1 백로그: 문화 승리, 불가사의, 해군. P0에 계정·멀티플레이·종교·광고·결제·PWA는 포함하지 않습니다. 30~60분은 설계 목표이며 실제 측정된 플레이 시간으로 홍보하지 않습니다.
