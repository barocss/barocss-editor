# #534 원본 검사 근거

소유자: Execute Sheet Accounts. 기존 parent/helper 검사 기록만 추출했다. 검사를 다시 실행하지 않았다. 제품 소스와 Integration 운영 파일은 수정하지 않았다.

- 서버 후보 S: `2ebf8113a7a0ad8da526eea48077278a22eae5fe`.
- 미사용 변수 제거 후속 T: `6e74ff05adf67dcd9e7ea39169347bbe09d4691f`. 부모는 S다. 한 파일만 바뀌었다.
- `manifest.json`은 각 산출물의 byte 수와 SHA256을 기록한다. `manifest.sha256.txt`는 manifest를 식별한다.
- 각 검사 폴더의 `commands.json`, `combined-output.txt`, `original-tool-records.jsonl`, `provenance.json`, `receipt.json`은 명령·원본 출력·원본 tool 결과·원본 기록 위치와 hash·실제 종료 코드를 보존한다.
- `source-objects.json`은 S/T의 실제 Git blob, byte 수와 SHA256이다. 이미 고정된 Git 객체를 다시 복사하지 않았다.
- `source-delta-timeline.json`은 당시 실제 수정 tool 입력이다. `source-stages.json`은 S에서 이 수정을 역적용해 계산한 WIP 식별값이다. 계산한 식별값을 원본 스냅샷으로 표시하지 않는다. pre-fence 두 파일은 당시 helper가 기록한 Git blob과 일치한다. authority는 원래 복사 영수증의 SHA256과도 일치한다. WS의 첫 수리 직전 WIP는 이미 복사 원본과 달랐으므로 둘을 같다고 표시하지 않는다.
- `existing-artifact-links.json`은 Integration lint 첫 실패와 기존 복사·설정 영수증의 경로/hash다. 타인 산출물은 수정하거나 중복 복사하지 않았다.

| 기록 | 실제 결과 |
| --- | --- |
| postcommit-red / postcommit-green | 2 FAIL → 같은 2 PASS |
| precommit-oracle-failure | 기존 12 PASS, 조회용 DB 잠금 오류 3건. 제품 RED 근거에서 제외 |
| precommit-red / precommit-authority-green | 실제 SQLite 저장 1건 대 기대 0건으로 3 FAIL → 같은 3 PASS. 후속 authority 3 PASS도 같은 원본 출력에 포함 |
| authority-red | 대기 중 로그인/세션 검사, 절대 기한 3 FAIL |
| strict-eight | 8 roots, 0 diagnostics |
| combined49-and-http3 | 첫 suite 49건 중 47 PASS·2 FAIL. 다음 선택 HTTP/controlled 3 PASS |
| priority-repair-green | 동일 만료 코드 실패 2건과 신규 authority 3건: 5 PASS, strict 1 root 0 |
| publication-red / transport-final-green | 전송 경계 1 FAIL → 최종 전송 5 PASS, strict 2 roots 0 |
| bootstrap-green | 5 PASS, strict 2 roots 0 |
| style-lint-green / style-types-green | T의 한 파일 lint exit 0, strict 1 root 0 |

49건과 다음 HTTP 3건은 한 shell 명령에 있었다. tool이 기록한 마지막 shell 종료 코드는 0이다. 첫 Node 프로세스의 종료 코드는 별도로 기록되지 않았다. 원본 TAP의 2 FAIL을 유지하며, 이 기록을 green 49건이나 독립 exit 1로 바꾸지 않는다.

S 전체 backend lint PASS 기록은 없다. Integration의 joined lint에서 미사용 변수 첫 실패가 났다. T의 해당 파일 lint만 PASS다. T에서 시험은 다시 실행하지 않았다. 실제 IdP·PG·Sheet 브라우저 두 계정·권한·로그아웃·제품 재시작 검증과 전체 수용은 Integration의 별도 근거다. 이 작성자의 NOTRUN 경계는 `source-pin-boundaries.json`에 있다.

실제 로그인 토큰, credentials, private config, provider/DB 데이터는 읽거나 복사하지 않았다. 원본 기록의 token 표기는 합성 시험 코드·프로토콜 필드 이름이다.
