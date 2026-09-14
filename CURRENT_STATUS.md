# 현재 상태

2026-09-14. 기준 저장소: https://github.com/orac83223-tech/civilization-clone. 작업 브랜치: `codex/game-mvp`.

## 구현 및 검증 체크포인트

1. 엔진 완주 경로 구현: 시드 지도, 이동·정착·생산·연구, 턴/정산, AI, 전투·점령, 3종 승리와 패배.
2. 경제·안개·개량·정책·외교 및 IndexedDB/JSON 저장·복구 구현.
3. Canvas/React 실제 UI, 데스크톱/모바일 조작, 튜토리얼·설정·결과 화면 구현. production build 및 strict typecheck/lint 통과.
4. 지도 50/50 및 조정 후 AI 대전 20/20 완주·불변식 검증 통과. 실제 공격 352회, 점령 9회, 처치 95회. 37~40라운드에 종료. 로컬 규칙·저장 147개, 브라우저 12개와 두 손가락 핀치 추가 검사 1개 통과. 엔진·저장 분기 커버리지 86.17%.
5. `/civilization-clone/` 하위 경로의 운영 빌드 HTTP/에셋/새 게임/도시 건설/저장 후 새로고침 검증 통과. 이는 로컬 검증이며 공개 배포가 아님.

Node 24.13.1 / npm 11.8.0 기존 설치 사용. 새 로컬 브라우저 다운로드 없이 설치된 Chrome 152.0.7977.84 사용. 외부 런타임 API, 서버, 유료 서비스 없음.

## 실제 배포 차단

GitHub Pages 활성화 요청이 HTTP 422 `Your current plan does not support GitHub Pages for this repository.`로 거절됨. 저장소 비공개 유지. 공개 URL은 없음. 세부 증거와 다음 절차는 `DEPLOYMENT.md`.

## 작업 보존과 다음 단계

- 첫 소스 체크포인트 `86656c50bc788edbe884ae330d9e20e6e82ec757`를 기능 브랜치에 push했고 원격 SHA를 확인했습니다.
- [PR #1](https://github.com/orac83223-tech/civilization-clone/pull/1), [첫 CI 성공](https://github.com/orac83223-tech/civilization-clone/actions/runs/34769049649). 첫 CI는 Linux Chromium/WebKit 15개 시나리오까지 통과했습니다. 후속 수정은 같은 브랜치에 추가하며 PR Checks에서 커밋별 결과를 확인합니다.
- 전체 소스·lockfile·devcontainer·CI/배포 workflow·규칙/밸런스·검증/배포 문서·실제 스크린샷을 저장소에 보존합니다.
- 남은 출시 검증: 실제 휴대전화의 조작·발열, 사람의 완주 시간과 난이도, 정복/점수 승리의 자연 발생 빈도. 자동 대전 20판은 모두 과학 승리였습니다.
- P1 백로그: 문화 승리, 불가사의 경쟁, 해군. 현재 화면에는 미작동 P1 버튼을 두지 않습니다.
- 공개 배포는 위 Pages 제약 해소 또는 사용자가 지정하는 다른 호스팅이 필요합니다. 저장소 공개/요금제 변경은 하지 않습니다.
- 다른 환경에서 `git clone` → `git switch codex/game-mvp` → `npm ci` → `npm run dev`; 자세한 조작·저장 제한·포트 안내는 README.
