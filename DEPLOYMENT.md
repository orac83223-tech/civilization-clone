# 배포 기록

기준일: 2026-09-14 (Asia/Seoul).

## 실제 확인 결과

- 기준 저장소: https://github.com/orac83223-tech/civilization-clone
- 원격 기본 브랜치: `main`, 작업 기반 커밋 `f05a67632fb330df7b351798178ad64c21004a1b`.
- 작업 브랜치: `codex/game-mvp`.
- 구현 PR: https://github.com/orac83223-tech/civilization-clone/pull/1
- 첫 구현 체크포인트: `86656c50bc788edbe884ae330d9e20e6e82ec757`, push 후 원격 SHA 일치를 확인했습니다.
- 첫 원격 CI [34769049649](https://github.com/orac83223-tech/civilization-clone/actions/runs/34769049649)는 위 커밋에서 **success**. Linux 설치·typecheck·lint·coverage·50지도/20AI·build·Chromium/WebKit 브라우저 15개·하위 경로 검증을 통과했습니다. 후속 수정의 최신 검증은 PR Checks와 최종 보고에서 커밋별로 구분합니다.
- GitHub API로 **private=true**, push/admin 권한, **has_pages=false**를 확인했습니다.
- `POST /repos/orac83223-tech/civilization-clone/pages`에 `{"build_type":"workflow"}`를 요청했습니다.
- 응답 **HTTP 422**: `Your current plan does not support GitHub Pages for this repository.`
- 공개 범위·요금제·결제는 변경하지 않았습니다. 확인된 공개 플레이 URL은 없습니다.
- 저장소 rulesets 조회도 HTTP 403으로 제한되었습니다. 보호 규칙을 우회하지 않고 기능 브랜치와 PR을 사용합니다.

## 배포 준비

`.github/workflows/ci.yml`은 typecheck, lint, unit coverage, 20 AI 시뮬레이션, production build, desktop/mobile Chromium 및 mobile WebKit Playwright를 실행합니다. 실패한 경우 배포용 성공 산출물을 제공하지 않습니다. 테스트 증거는 실패 여부와 관계없이 보관합니다.

`.github/workflows/deploy.yml`은 기존 저장소 정책대로 **main + ENABLE_PAGES_DEPLOY=true + 수동 workflow_dispatch**로만 실행합니다. 빌드·시뮬레이션·실제 브라우저 테스트가 성공해야 `needs: build` 뒤 Pages 배포가 가능합니다. 저장소 읽기 권한은 기본, Pages 쓰기 및 OIDC는 배포 job에만 둡니다. fork PR에 비밀을 전달하거나 `pull_request_target`을 쓰지 않습니다.

GitHub가 현재 제공하는 공식 workflow 문서의 `actions/checkout@v6`, `actions/setup-node@v6`, `configure-pages@v5`, `upload-pages-artifact@v4`, `deploy-pages@v4`를 확인했습니다. Node 24 및 npm lockfile을 사용합니다. 빌드 결과는 `dist/`, Vite 기본 `base: './'`로 프로젝트 사이트 하위 경로를 지원합니다.

## 남은 배포 조치

현재 요금제로 이 비공개 저장소에 GitHub Pages를 사용할 수 없다는 제약을 먼저 해결해야 합니다. 사용자가 계정에서 Pages 사용 조건을 변경하거나 다른 호스팅을 지정할 수 있습니다. 저장소를 자동으로 공개 전환하거나 유료 플랜에 가입하지 않습니다.

Pages를 사용할 수 있게 된 경우:

1. PR의 CI 검증과 저장소 리뷰 정책에 따라 `main`에 병합합니다.
2. Settings → Pages에서 GitHub Actions를 선택합니다.
3. Actions repository variable `ENABLE_PAGES_DEPLOY=true`를 설정합니다.
4. `Deploy Pages` workflow를 `main`에서 실행합니다.
5. workflow 결과의 실제 `page_url`로 HTTP, 모든 에셋, 새 게임, 도시 건설, 저장·새로고침을 검증합니다.

localhost 및 Codespaces 포트 주소는 개발 미리보기이며 공개 배포 완료 URL로 보고하지 않습니다.

## 확인한 공식 자료

- [GitHub Pages 요금제 조건과 custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [actions/checkout](https://github.com/actions/checkout)
- [actions/setup-node](https://github.com/actions/setup-node)
- [Vite 설치와 Node 버전](https://vite.dev/guide/)
- [Vitest 버전 이전 및 호환성](https://vitest.dev/guide/migration.html)

Actions/Codespaces 사용량은 계정 할당량과 과금 설정에 따르며, 무제한 무료라고 가정하지 않습니다.
