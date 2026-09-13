# 웹 배포

1. 게임 구현 PR의 CI 통과 후 main에 병합한다.
2. GitHub Settings → Pages에서 GitHub Actions를 선택한다. 비공개 저장소 Pages 사용은 계정 요금제에서 지원해야 한다. 지원하지 않으면 저장소 공개 전환 또는 다른 호스팅을 사용자가 선택한다. 자동 공개 전환하지 않는다.
3. Settings → Secrets and variables → Actions → Variables에 ENABLE_PAGES_DEPLOY=true를 설정한다.
4. Actions → Deploy Pages → Run workflow에서 main을 선택한다.
5. workflow가 반환한 실제 page_url에서 시작·저장·새로고침·모바일을 검증한다. URL은 배포 전 추측해서 완료로 보고하지 않는다.

현재 공개 배포는 비활성화되어 있다. CI는 push/PR에서 실행되고 web-dist 산출물을 보관한다.
https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
