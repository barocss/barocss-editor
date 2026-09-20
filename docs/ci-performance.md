# CI 실행 시간과 필수 검사

관련 이슈: [#286](https://github.com/barocss/barocss-editor/issues/286).

## 검사 구성

CI는 main 대상 PR과 main push에서 같은 범위를 검사한다. 변경 경로에 따른 검사 생략은 적용하지 않는다.

다음 네 job은 독립적으로 실행한다.

- `Lint and verification tools`: 릴리스 메타데이터 검사, 로컬 검증 도구 검사, lint.
- `Source type check`: 전체 소스 타입 검사.
- `Test type check`: 전체 테스트 타입 검사와 누락된 테스트 파일 검사.
- `Unit tests`: 전체 단위 검사.

기존 필수 검사 이름 `Lint, type-check, unit test`는 네 결과를 모으는 job에서 유지한다. `always()`로 선행 job의 실패 후에도 판정한다. 네 결과가 모두 `success`일 때만 성공한다. 실패, 취소, 생략, 빈 결과는 실패다. 실행 자체가 취소되어 집계 job이 실행되지 않으면 성공한 필수 검사로 간주하지 않는다.

React E2E와 npm 소비자 검증은 기존 구성을 유지한다. 브랜치 보호 설정도 바꾸지 않는다. 병렬 검사에는 이전 job의 빌드 결과가 필요하지 않으며 각 job이 같은 lockfile로 설치한다.

`pnpm test:checks`는 실제 workflow의 판정 스크립트를 실행한다. 네 입력 각각에 성공, 실패, 취소, 생략, 빈 값, 잘못된 값, 누락을 넣는다. 필수 검사 이름, 선행 job 연결과 기존 명령 유지도 검사한다. GitHub 스케줄러의 동작은 실제 PR 실행에서 별도로 확인한다.

## 개선 전 측정

2026-09-20의 성공한 실행 세 건을 GitHub Actions jobs API로 측정했다. 설정 기준은 main `3b839784acede56018a42303f4066d3cf233f062`다.

| 실행 | 가장 긴 CI job | 소스 타입 | 테스트 타입 | 단위 검사 | CI 러너 시간 합계 |
| --- | --- | --- | --- | --- | --- |
| [PR #284](https://github.com/barocss/barocss-editor/actions/runs/35501571759) | 10:00 | 2:28 | 2:38 | 4:05 | 14:17 |
| [PR #277](https://github.com/barocss/barocss-editor/actions/runs/35501077207) | 13:01 | 3:15 | 3:20 | 5:25 | 18:03 |
| [main](https://github.com/barocss/barocss-editor/actions/runs/35500484385) | 13:02 | 3:12 | 3:25 | 5:29 | 18:01 |

타입 검사 두 개와 단위 검사가 가장 긴 job의 약 92~93%를 차지했다. npm 검증은 packages 전체를 빌드한다. 문서 예제 검증은 그 tarball을 재사용하며 라이브러리를 다시 빌드하지 않는다.

## 비교 방법과 제한

- job 시간은 `completed_at - started_at`으로 계산한다.
- CI 경과 시간은 첫 job 시작부터 마지막 job 완료까지다. 필수 집계 job의 대기 시간도 별도로 기록한다.
- 러너 합계는 CI에 속한 각 job의 실행 시간을 더한다. 병렬 job을 단순히 가장 긴 job의 시간으로 계산하지 않는다.
- Documentation은 별도 workflow다. 위 합계에는 Documentation, 대기열, 청구 반올림을 포함하지 않는다.
- 분리된 job의 설치와 초기화 때문에 러너 합계는 증가할 수 있다. 병렬 실행만으로 비용 절감을 주장하지 않는다.
- 개선 후 PR의 commit, 실행 링크, 각 job 시간, 러너 합계와 결과를 PR에 기록한다. 다른 commit과 러너의 단일 표본 비교는 확정적인 절감률이 아니다.

전체 검사 대상, 기존 타입 부채 기준, E2E, npm tarball 검증은 줄이지 않는다. 캐시나 변경 영향 분석은 별도 측정과 검증 후 도입한다.
