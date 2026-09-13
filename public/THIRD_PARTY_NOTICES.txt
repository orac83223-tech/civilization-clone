# 타사 라이선스와 에셋

게임 이름, 가상 세력, 한국어 문구, 규칙 수치, Canvas 지형·도시·유닛 문장 및 SVG 아이콘은 이 프로젝트에서 작성했습니다. 기존 상용 게임의 이미지·음원·로고·문구·코드를 가져오지 않았습니다. 외부 폰트·원격 이미지·CDN·유료 LLM은 사용하지 않습니다. 시스템 글꼴을 사용하며 선택형 효과음은 Web Audio로 합성합니다.

런타임 의존성:

| 패키지 | 버전 | 라이선스 | 출처 |
| --- | --- | --- | --- |
| React | 19.3.0 | MIT | https://github.com/facebook/react |
| React DOM | 19.3.0 | MIT | https://github.com/facebook/react |

빌드/검증 도구에는 Vite, TypeScript, Vitest, ESLint, typescript-eslint, Playwright, tsx, fake-indexeddb 등이 있습니다. 정확한 버전과 모든 전이 의존성은 `package-lock.json`, 해당 배포물의 LICENSE/NOTICE 파일로 확인합니다. 도구를 게임 그래픽 에셋으로 재배포하지 않습니다.

React MIT 고지:

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
