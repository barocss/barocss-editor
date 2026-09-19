# Wonffice 제품 버전

이 비공개 패키지의 `version`은 프런트엔드와 서버를 포함한 Wonffice 전체의 버전 기준이다. npm에 게시하지 않는다. 기존 공개 라이브러리는 독립 버전을 유지한다.

초기 `0.0.0`은 릴리즈 기록을 만들기 위한 개발 기준이다. 제품을 출시했다는 뜻이 아니다. root package.json과 office-app의 버전은 전체 서비스 버전으로 사용하지 않는다.

제품 변경 PR에는 `pnpm changeset`에서 이 패키지를 선택한다. 공개 라이브러리도 변경했다면 해당 패키지를 함께 선택한다. 개발 도구·문서만 바꾸면 제품 버전을 올리지 않는다. `.changeset/config.json`의 `privatePackages.version`은 true이고 `privatePackages.tag`는 false다. 제품 태그는 제품 릴리즈 절차에서 별도로 관리한다.

첫 alpha를 준비할 때는 전용 릴리즈 PR에서 Changesets의 pre 모드를 사용한다. 제품 major changeset으로 0.0.0에서 1.0.0-alpha.0 후보를 만들 수 있다. pre 모드는 해당 릴리즈에 포함된 공개 패키지에도 적용되므로 변경 목록 전체를 먼저 확인한다. Changesets 버전 적용과 npm 게시, 서비스 배포는 서로 다른 단계다.

릴리즈 검증 도구는 이 파일과 manifest의 제품 버전이 같은지 확인한다. 배포 조합·검증 증거는 manifest에 기록한다. 이 패키지는 서버 설치나 SaaS 배포를 실행하지 않는다.
