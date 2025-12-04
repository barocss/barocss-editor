# renderer-dom 스펙 문서 v2 작성 계획

## 현재 스펙 문서의 문제점

### 1. 주요 변경사항 미반영

**누락된 내용:**
- ❌ React-style Fiber Reconciliation (Render Phase / Commit Phase 분리)
- ❌ skipNodes 기능 (입력 중인 노드 보호)
- ❌ EffectTag 상수화 (PLACEMENT, UPDATE, DELETION)
- ❌ VNodeTag, DOMAttribute 상수화
- ❌ Component lifecycle 타이밍 (mountComponent, updateComponent, unmountComponent)
- ❌ Text node 처리 (#text 태그)
- ❌ Logger 시스템 (LogCategory 기반)
- ❌ isReconciling 플래그 (setState 방지)

### 2. 구식 설명

**현재 문서의 문제:**
- `reconcileVNodeChildren()` 같은 구식 함수명 사용
- 단일 단계 reconciliation 설명 (Render/Commit 분리 없음)
- 데코레이터 정보가 VNode 최상위에 있다고 설명 (실제로는 `attrs['data-decorator-*']`)

---

## 새 스펙 문서 구조 (v2)

### 목차 (예상)

1. [아키텍처 개요](#1-아키텍처-개요)
   - 렌더링 파이프라인
   - React-style Fiber Reconciliation
   - 핵심 원칙

2. [DSL 규칙](#2-dsl-규칙)
   - 템플릿 정의
   - 엘리먼트 템플릿
   - 자식 확장: `slot()`
   - 조건부/반복 렌더링
   - 마크/데코레이터 등록

3. [VNode 구조](#3-vnode-구조)
   - 기본 필드
   - 컴포넌트 식별자 (sid, stype)
   - Text VNode (#text 태그)
   - 마크/데코레이터 참조
   - 포털 VNode

4. [Reconciliation: Render Phase](#4-reconciliation-render-phase)
   - Fiber 트리 생성
   - renderFiberNode 동작
   - effectTag 설정
   - DOM 생성 (삽입 없음)
   - skipNodes 처리

5. [Reconciliation: Commit Phase](#5-reconciliation-commit-phase)
   - commitFiberTree 동작
   - commitFiberNode 동작
   - DOM 삽입/재배치 (insertBefore)
   - 속성/스타일 업데이트
   - Component lifecycle 호출
   - skipNodes 처리

6. [VNode 매칭 알고리즘](#6-vnode-매칭-알고리즘)
   - Child Matching Matrix
   - ID 기반 매칭 (sid, key)
   - 타입+인덱스 기반 매칭
   - 구조적 매칭

7. [데이터 속성 처리](#7-데이터-속성-처리)
   - DOM 표식 규칙 (data-bc-*, data-decorator-*)
   - 속성 부착 시점
   - 네임스페이스 처리

8. [마크와 데코레이터](#8-마크와-데코레이터)
   - 마크 처리
   - 데코레이터 처리 (attrs['data-decorator-*'])
   - 인라인/블록/레이어 데코레이터

9. [컴포넌트 상태 관리](#9-컴포넌트-상태-관리)
   - 상태 클래스 정의
   - 상태 등록
   - 라이프사이클 훅 (mount, update, unmount)
   - 자동 재렌더링
   - isReconciling 플래그

10. [포털](#10-포털)
    - 포털 정의
    - 포털 처리 (Render/Commit Phase)

11. [skipNodes 기능](#11-skipnodes-기능)
    - 목적 (입력 중인 노드 보호)
    - 동작 방식
    - EditorViewDOM 연동

12. [로깅 시스템](#12-로깅-시스템)
    - LogCategory 기반 구조화
    - 디버그 플래그

13. [상수 정의](#13-상수-정의)
    - EffectTag (PLACEMENT, UPDATE, DELETION)
    - VNodeTag (TEXT, PORTAL)
    - DOMAttribute (BC_SID, DECORATOR_SID 등)

14. [오류 처리](#14-오류-처리)
    - 모델 검증
    - 데코레이터 검증
    - 포털 검증

15. [성능 요구사항](#15-성능-요구사항)
    - DOM 안정성
    - 렌더링 성능
    - 성능 기준

16. [테스트/검증 원칙](#16-테스트검증-원칙)
    - DOM 검증
    - 포털 검증

17. [금지 사항](#17-금지-사항)

---

## 주요 변경사항 요약

### 1. Reconciliation 구조 변경

**이전:**
- 단일 단계 reconciliation
- DOM 조작과 변경 계산이 혼재

**현재:**
- React-style Fiber Reconciliation
- Render Phase: 변경 계산만 (DOM 조작 없음)
- Commit Phase: 계산된 변경사항을 DOM에 적용

### 2. skipNodes 기능 추가

**목적:**
- 입력 중인 노드를 외부 변경으로부터 보호

**동작:**
- Render Phase에서 skipNodes 체크 → 스킵
- Commit Phase에서 skipNodes 체크 → DOM 업데이트 스킵

### 3. Component Lifecycle 통합

**이전:**
- lifecycle 타이밍 불명확

**현재:**
- mountComponent: Commit Phase (PLACEMENT)
- updateComponent: Commit Phase (UPDATE)
- unmountComponent: Commit Phase (DELETION)
- isReconciling 플래그로 setState 방지

### 4. 상수화

**이전:**
- 문자열 리터럴 사용 ('PLACEMENT', '#text', 'data-bc-sid' 등)

**현재:**
- EffectTag.PLACEMENT, EffectTag.UPDATE, EffectTag.DELETION
- VNodeTag.TEXT, VNodeTag.PORTAL
- DOMAttribute.BC_SID, DOMAttribute.DECORATOR_SID 등

### 5. Text Node 처리 개선

**이전:**
- tag가 없으면 text node로 처리

**현재:**
- tag: '#text' (VNodeTag.TEXT)로 명시적 표시
- createTextVNode()로 생성

### 6. 데코레이터 정보 저장 위치 변경

**이전:**
- VNode 최상위에 decoratorSid, decoratorStype 등

**현재:**
- attrs['data-decorator-sid'], attrs['data-decorator-stype'] 등
- DOM 속성과 일치

---

## 작성 우선순위

### Phase 1: 핵심 구조 (필수)
1. 아키텍처 개요 (Fiber Reconciliation 포함)
2. Reconciliation: Render Phase
3. Reconciliation: Commit Phase
4. VNode 매칭 알고리즘

### Phase 2: 기능 설명 (필수)
5. skipNodes 기능
6. Component Lifecycle
7. 상수 정의

### Phase 3: 세부 사항 (중요)
8. VNode 구조 (최신 반영)
9. 데이터 속성 처리
10. 마크와 데코레이터

### Phase 4: 부가 기능 (참고)
11. 포털
12. 로깅 시스템
13. 오류 처리
14. 성능 요구사항
15. 테스트/검증 원칙
16. 금지 사항

---

## 참고 문서

다음 문서들을 참고하여 작성:

1. `react-style-reconciliation.md` - React-style Reconciliation 상세
2. `skipnodes-implementation-plan.md` - skipNodes 구현 계획
3. `skipnodes-behavior.md` - skipNodes 동작 방식
4. `fiber-concept-flow.md` - Fiber 개념 흐름
5. `reconciliation-flow-analysis.md` - Reconciliation 흐름 분석

---

## 다음 단계

1. ✅ 현재 스펙 문서 문제점 분석
2. ✅ 새 스펙 문서 구조 계획
3. ⏳ Phase 1 작성 (핵심 구조)
4. ⏳ Phase 2 작성 (기능 설명)
5. ⏳ Phase 3 작성 (세부 사항)
6. ⏳ Phase 4 작성 (부가 기능)
7. ⏳ 검토 및 수정

