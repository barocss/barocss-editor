# Execute Verification WebSocket read-only matrix

Source chat: 01a15eca-e1d3-7910-9aa1-d590162dbf18
No #535 execution authority inferred.

Execute Verification의 실제 WebSocket 경로용 읽기전용 검증 matrix 제안입니다. 후보 source는 아직 없으므로 모든 항목은 NOT RUN이며 실행 권고/lease/535 HOLD 해제가 아닙니다.

W0 증거 고정: client/service/protocol/schema 각각 immutable SHA/tree, 실제 실행 bundle/module binding, WS URL/Origin/subprotocol/admission version, 실제 DB/registry/manifest/bootstrap/context/generation binding, runtime owner/PID와 고정 deadline을 기록합니다. 기존 B55264 두 사용자 탭, A55263, Word55262는 입력/새로고침/종료하지 않습니다. 새55266/55265만522의별도lease에따릅니다.

W1 실제 WS 전송: 두 독립 controlled session의 실제 pointer/keyboard edit가 실제 WebSocket frame으로 전송되고 native revision/eventIDs/AST/alternatives 및 SUM/IF 화면이 수렴해야 합니다. 모델 callback/REST fallback만 통과해서 WS PASS로 기록하지 않습니다. WS open, local applied, peer received, DB durable receipt는 서로 다른 상태입니다. UI와 service 양쪽의 updateID/hash/length/context/session binding으로 실제 경로를 연결합니다. frame/body/decoded native/full accepted-state/frontier 제한과 WS fragmentation/reassembly 경계를 최종 protocol에 고정합니다. 기존 HTTP encoded-body cap을 WS frame cap으로 암묵 대체하지 않습니다.

W2 현재 ACL과 readOnly: server-controlled identity를 실제 계정에 결합하고 handshake뿐 아니라 각 update/retry/resume에서 현재 권한을 검사합니다. readOnly는 열람 허용/실제 append 거부; 연결 후 권한변경/회수 시 기존 socket, reconnect, 대기 update 재전송, 중복 update retry, credential resume도 일관되게 거부해야 합니다. revoke 후 신규 state/tail/broadcast read도 권한대로 차단해야 합니다. 거부 후 DB/receipt/native accepted state가 불변이고 원래 client outbox는 보존됨을 관측합니다. 두 controlled credential 검증은 production account auth PASS가 아닙니다.

W3 identity/context spoof: packet의 actor/session/account/workbook/context/generation/admission 또는 updateID/hash/bytes 변경을 server identity와 대조합니다. peer 선언 identity나 문서 내용이 권한을 부여하지 않습니다. 같은 ID+다른 bytes, 다른 사용자/문서의 receipt replay, revoked 동일ID 재시도는 거부합니다. 동일ID 중복처리도 ACL 검사보다 먼저 성공시키지 않습니다. socket별 요청/응답을 정확히 결합해 다른 generation/session의 늦은 frame이 새 저장 상태를 바꾸지 않는지 확인합니다.

W4 DB COMMIT-before-ACK loss: 고정 actual-service seam에서 진짜 COMMIT 후 해당 ACK만 유실시킵니다. server의 sequence/frontier/receipt 및 DB commit binding과 다른 page의 native observation을 함께 기록합니다. audit prepared나 peer 수신만으로 durable PASS 불가. 같은 identity/context/updateID/bytes 재시도로 같은 원본 receipt를 받고 durable update/event가 중복되지 않아야 합니다. 실패 transaction의 state/receipt가 ACK나 accepted broadcast로 노출되지 않는지도 구분합니다.

W5 late ACK와 private outbox: 원본 packet의 ID/hash/length/identity/context가 private IDB transaction 완료 후 reload에도 같아야 합니다. 빠진/거부된 credential을 신규 session으로 대체하지 않고 packet을 보존합니다. 실제 old ACK 전달을 보류한 동안 새 packet의 IDB 기록 완료와 server 미수신을 증명하고, old ACK 전달 뒤 새 packet이 pending/unsaved로 남는지 확인합니다. 이후 새 원본 packet의 별도 genuine receipt를 받아야 Saved가 됩니다. polling/resume/재연결을 통한 우회 수신까지 관측합니다. WS용 actual ACK 전달 seam이 없으면 이 browser 항목은 NOT RUN입니다.

W6 true restart/open: checkpoint 후 별도 tail을 저장하고 private browser document 상태를 닫습니다. old relay PID 종료, 다른 NEW PID가 동일 directory/DB/registry/context/generation/original bootstrap에서 재개됨을 기록합니다. fresh page에서 전체 native revision/eventIDs/AST/alternatives/checkpoint-tail 포함을 비교합니다. 원래 credential resume와 빈 document storage 조건을 구분합니다. 다시 실제 edit→save→fresh open까지 확인합니다. private outbox는 서버 영구 저장의 대체 증거가 아닙니다.

W7 fail-closed: 신규 소유 diagnostic copy에만 missing/corrupt manifest/DB/registry/metadata/checkpoint/tail, incomplete binary dependencies, hash mismatch, 용량 초과를 적용합니다. 예상 거부 원인, copy와 원본 inventory/hash 전후를 남깁니다. silent create/reseed/drop, 저장 실패 후 Saved, 손상 copy의 사용자 승격은 금지합니다. final service pre-COMMIT full accepted-state 1000000B 등 기존 계약을 유지/변경하는지는 명시된 새 계약에서 확인해야 하며 통과를 위한 임의 상향은 안 됩니다.

W8 기록 경계: source review/model/native-service test/실제 WS browser/controlled credential/production auth/physical IME를 분리합니다. 첫 실패와 수정 내역을 보존하며 제한 시간 초과는 실패로 기록합니다. 공개 증거는 SHA/ID/length/status 위주, token/credential/raw frame/document text/DB 원문은 제외합니다. 실제 BFCache나 미지원 fault seam은 NOT RUN 유지합니다.

이 메시지는 기준 제안만입니다. #535 source/files/tests/server/browser를 시작하지 않았고 기존 held checkpoint를 변경하지 않았습니다.

