# Backlog = GitHub issues

할 일(백로그)은 **GitHub 이슈**로 관리합니다.

- "이번에 해야할을 알려주고 진행해줘"라고 하면 에이전트가 **열린 이슈** 중 첫 번째(또는 `next` 라벨)를 골라 진행합니다.
- 새 할 일: GitHub에서 **New issue** → Feature / Bug fix / E2E 템플릿 선택 후 작성.
- 완료: PR에서 "Closes #N"으로 머지하면 이슈가 자동으로 닫힙니다.

자세한 절차: **`.cursor/AGENTS.md`** § "Single command: 이번에 해야할을 알려주고 진행해줘".
