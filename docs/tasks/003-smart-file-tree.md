# Smart File Tree

목표: 현재 PR analysis UI와 output schema를 제거하고, 대신 changed files 탐색 자체를 더 빠르게 만드는 `smart file tree` 기능으로 analysis를 재정의한다.

이 기능의 핵심은 "PR을 요약해서 읽게 만드는 것"이 아니라 "리뷰어가 어떤 파일부터 봐야 하는지 더 자연스럽게 정렬/그룹핑해서 보여주는 것"이다. 결과적으로 분석 결과는 오른쪽 패널의 별도 카드가 아니라, 왼쪽 파일 트리의 구조와 정렬을 바꾸는 데만 사용된다.

## Problem

현재 구조는 파일 경로를 기준으로만 트리를 만든다.

장점:

* 구현이 단순하다.
* 실제 repo directory 구조를 왜곡하지 않는다.

문제:

* PR이 여러 concern을 동시에 건드리면 어떤 파일이 같은 맥락인지 한눈에 안 보인다.
* route, component, test, config가 서로 떨어져 있어도 현재 트리에서는 관계가 드러나지 않는다.
* 리뷰 시작 지점이 불분명하다.
* 기존 AI summary/risk/testing 카드는 읽을거리를 늘리지만, 실제 파일 탐색 속도를 직접 줄여주지는 않는다.

특히 큰 PR에서는 "무엇이 바뀌었는가"보다 먼저 "어떤 파일 묶음으로 봐야 하는가"가 중요하다.

## Goals

* 기존 `summary / risks / testing / reviewerQuestions / notableFiles` 기반 analysis를 제거한다.
* analysis 결과를 `smart file tree` 전용 구조로 바꾼다.
* changed files를 2-level semantic group 기준으로 묶어서 보여준다.
* 상위 그룹은 PR 안의 구현 단위(feature / concern / workstream)로 묶는다.
* 하위 그룹은 기술적 레이어 기준으로 묶는다.
* 하위 그룹은 외부 인터페이스에 가까운 쪽에서 core 쪽으로 정렬한다.
* 그룹 내부와 그룹 간 정렬을 사람이 읽기 좋은 순서로 재배치한다.
* semantic grouping이 실패하거나 신뢰할 수 없을 때는 기존 path tree로 자연스럽게 fallback 한다.
* analysis payload format의 하위호환성은 유지하지 않는다.
* provider abstraction, local clone mapping, worktree isolation, filesystem cache는 유지한다.
* 파일 선택/URL query/diff viewer 동작은 그대로 유지한다.

## Non-goals

* PR 요약 카드 유지
* 위험도, 테스트 추천, reviewer question 같은 narrative analysis 유지
* 파일 단위 inline review comment 생성
* diff 내용 자체를 재작성하거나 요약해서 보여주기
* repo 전체 architecture map 생성
* path tree를 완전히 없애기

초기 버전은 "semantic grouping이 있는 파일 탐색기"까지만 한다.

추가로, 기존 analysis format과의 schema compatibility는 목표가 아니다. old format은 읽지 않고, 새 format만 지원한다.

## User Experience

### Before

* 왼쪽: path-based file tree
* 오른쪽: 파일 미선택 시 `AI Analysis` + PR description
* 오른쪽: 파일 선택 시 diff

### After

* 왼쪽: `Smart File Tree` / `File Tree` switchable navigation
* 오른쪽: 파일 미선택 시 PR description
* 오른쪽: 파일 선택 시 diff

즉, analysis의 primary surface는 별도 카드가 아니라 파일 트리 자체다.

### Tree mode switch

파일 트리 영역 상단에는 항상 mode switch가 보여야 한다.

* `Smart File Tree`
* `File Tree`

동작 원칙:

* 기본 선택은 항상 `Smart File Tree`
* cached smart analysis가 없어도 switch는 숨기지 않는다
* 사용자는 언제든 `File Tree` 로 전환할 수 있다
* smart mode가 비어 있거나 분석 중이어도 `File Tree` 전환은 가능해야 한다
* plain `File Tree` 는 항상 즉시 사용 가능해야 한다

### Smart Tree behavior

파일 미선택 상태에서도 사용자는 다음 정보를 왼쪽에서 바로 읽을 수 있어야 한다.

* 어떤 구현 단위가 있는지
* 각 구현 단위 안에 어떤 기술 레이어가 있는지
* 어떤 구현 단위와 레이어를 먼저 봐야 하는지
* 각 묶음의 성격이 무엇인지

예시:

```text
Smart File Tree
  UI Layer (3)
    src/routes/pull-request-page.tsx
    src/components/pr/file-tree.tsx
    src/components/pr/file-diff-panel.tsx
  Service Layer (2)
    src/lib/analyzer.ts
    server/routes/pr-analyzer.ts
  Core Contracts (1)
    server/analyzer/types.ts

Docs Cleanup
  Docs Layer (2)
    docs/tasks/002-pr-analyzer.md
    docs/tasks/003-smart-file-tree.md
```

중요한 점:

* 상위 그룹 label은 실제 directory명이 아니라 PR 안의 구현 단위를 반영한다.
* 하위 그룹은 `UI`, `API / Handler`, `Service`, `Repository`, `Infra`, `Docs`, `Config` 같은 기술 레이어를 반영한다.
* 같은 directory 아래 파일이라도 다른 역할이면 다른 하위 그룹으로 갈 수 있다.
* 서로 다른 directory 파일도 같은 concern이면 같은 상위 그룹으로 묶일 수 있다.
* 테스트 파일은 독립 레이어로 다루지 않고, 대응되는 구현 레이어 하위 그룹에 함께 묶는 것을 기본으로 한다.

### Fallback UX

semantic grouping 결과가 없으면 UI는 아래 순서로 degrade 한다.

1. cached smart grouping 사용
2. 새 grouping 생성 시도
3. 실패 시 기존 path tree 렌더링

사용자는 기능 실패 때문에 파일을 못 보는 상태가 되면 안 된다.

### Smart File Tree states

smart mode는 cached result 유무와 현재 분석 실행 상태를 함께 고려해서 렌더링한다.

#### 1. Cached result 없음

분석 중:

* progress spinner를 보여준다
* 현재 진행 메시지가 있으면 함께 보여준다
* smart tree content 대신 loading state를 보여준다
* 사용자는 switch로 plain `File Tree` 로 이동할 수 있다

분석 시작 전:

* 안내 문구를 보여준다
* `Analyze` 버튼을 보여준다
* 아직 smart grouping이 생성되지 않았음을 분명히 표시한다
* 사용자는 switch로 plain `File Tree` 로 이동할 수 있다

#### 2. Cached result 있음

기본:

* cached smart tree 결과를 그대로 보여준다
* 결과는 smart mode의 본문으로 즉시 렌더링한다

outdated:

* cached 결과는 그대로 보여준다
* 상단에 warning notice를 보여준다
* warning은 현재 PR head와 cached analysis head가 다르다는 점을 설명한다

재분석 실행 중:

* 기존 cached 결과는 계속 보여준다
* 상단에 `updating` 상태를 표시한다
* spinner / progress text는 기존 결과 위쪽에 붙인다
* 분석 완료 전까지 기존 결과를 지우지 않는다

## Analysis Output

기존 schema는 폐기한다.

이전:

```ts
type PullRequestAnalysis = {
  summary: string;
  changeAreas: Array<{ title: string; summary: string; files: string[] }>;
  risks: Array<{ severity: "high" | "medium" | "low"; title: string; details: string; files: string[] }>;
  testing: {
    existingSignals: string[];
    recommendedChecks: string[];
  };
  reviewerQuestions: string[];
  notableFiles: Array<{ path: string; reason: string }>;
  rawMarkdown?: string;
};
```

새 schema:

```ts
type SmartFileTreeAnalysis = {
  version: 1;
  strategy: "semantic" | "path-fallback";
  summary: {
    topLevelGroupCount: number;
    subGroupCount: number;
    largestTopLevelGroupSize: number;
    ungroupedFileCount: number;
  };
  groups: Array<{
    id: string;
    title: string;
    order: number;
    rationale: string;
    fileCount: number;
    children: Array<{
      id: string;
      title: string;
      layer:
        | "ui"
        | "api"
        | "service"
        | "repository"
        | "infra"
        | "docs"
        | "config"
        | "mixed";
      order: number;
      rationale: string;
      filePaths: string[];
    }>;
  }>;
  ungroupedPaths: string[];
  rawMarkdown: string | null;
};
```

설계 원칙:

* 상위 그룹은 PR changed files의 구현 단위를 나타낸다.
* 하위 그룹은 각 상위 그룹 안에서 기술적 레이어를 나타낸다.
* 모든 changed file은 `groups[].children[].filePaths` 또는 `ungroupedPaths` 중 정확히 한 곳에만 속해야 한다.
* 상위 그룹과 하위 그룹 모두 `order` 를 가진다.
* 하위 그룹 order는 임의 생성이 아니라 layer ordering rule을 따라야 한다.
* `rationale` 은 짧은 설명이다. 긴 prose를 허용하지 않는다.
* `strategy` 가 `path-fallback` 이면 semantic grouping 실패로 간주한다.

레이어 기본 정렬 규칙:

1. `ui`
2. `api`
3. `service`
4. `repository`
5. `infra`
6. `docs`
7. `config`
8. `mixed`

이 순서는 외부 인터페이스에 가까운 쪽에서 점점 core implementation detail 쪽으로 읽도록 유도한다. `docs`, `config` 는 주 구현 레이어 뒤에 배치한다.

테스트 파일 처리 원칙:

* 테스트는 독립 하위 그룹을 만들기보다 대응되는 구현 하위 그룹에 포함한다.
* 예를 들어 UI 컴포넌트 테스트는 `ui` 하위 그룹에, service 테스트는 `service` 하위 그룹에 같이 둔다.
* 하나의 구현 단위 전체를 검증하는 통합 테스트는 해당 상위 그룹 안에서 가장 가까운 구현 레이어 하위 그룹에 붙인다.
* 명확한 대응 레이어를 찾기 어려운 테스트만 `mixed` 하위 그룹으로 보낸다.

## Grouping Rules

LLM/provider가 마음대로 prose를 만드는 대신 아래 규칙에 맞춰 구조화된 grouping만 반환해야 한다.

### Hard constraints

* 파일 중복 금지
* 존재하지 않는 path 금지
* 상위 그룹 title은 2~5 단어 정도의 짧은 label
* 하위 그룹 title은 기본적으로 layer 이름 또는 그에 준하는 짧은 label
* 상위 그룹 수는 기본적으로 `1~5`개 범위를 목표로 한다
* 각 상위 그룹 안의 하위 그룹 수는 기본적으로 `1~5`개 범위를 목표로 한다
* changed file이 매우 적으면 상위 그룹 1개 + 하위 그룹 1개도 허용한다
* 파일 수가 적은데 불필요하게 상위 그룹/하위 그룹을 쪼개지 않는다
* 테스트 파일만 따로 떼어 별도 레이어 하위 그룹을 만드는 것은 지양한다
* `generated`, `lockfile`, snapshot, vendored file은 별도 하위 우선순위 그룹으로 보내는 것을 선호한다

### Ranking guidance

상위 그룹 우선순위:

* user-facing behavior를 바꾸는 그룹
* API contract 또는 state flow를 바꾸는 그룹
* entrypoint/router/controller/service 같은 orchestration 레이어

상위 그룹에서 낮은 우선순위:

* generated outputs
* snapshots
* lockfiles
* pure docs
* mechanical renames only

하위 그룹 우선순위는 아래를 강제한다:

* `ui`
* `api`
* `service`
* `repository`
* `infra`
* 그 외 보조 레이어

### Heuristics the analyzer should use

* path proximity
* import/export relationship
* shared naming stem
* test-to-source pairing
* config-to-feature pairing
* server/client boundary
* route or entrypoint to handler/service/repository chain
* primary implementation vs follow-up test/docs files

### Examples

이런 2-level grouping은 허용된다:

* `src/routes/pull-request-page.tsx`
* `src/components/pr/file-tree.tsx`
* `src/components/pr/file-diff-panel.tsx`

-> 상위 그룹 `Smart File Tree`
-> 하위 그룹 `UI Layer`

이런 grouping도 허용된다:

* `server/routes/pr-analyzer.ts`
* `server/analyzer/types.ts`
* `src/lib/analyzer.ts`

-> 상위 그룹 `Analyzer Plumbing`
-> 하위 그룹 `API Layer`, `Service Layer`, `Core Layer`

테스트 예시:

* `src/components/pr/file-tree.tsx`
* `src/components/pr/file-tree.test.tsx`

-> 상위 그룹 `Smart File Tree`
-> 하위 그룹 `UI Layer`

## High-level Architecture

```text
PullRequestPage
  -> fetch PR metadata/files from existing GitHub API routes
  -> fetch existing smart-file-tree analysis for current provider
  -> if semantic grouping exists, render two-level grouped tree
  -> else render plain path tree
  -> on explicit user action, request fresh smart grouping

Vite middleware route
  -> resolve local clone mapped to owner/repo
  -> create isolated git worktree
  -> collect PR metadata + changed files + local repo context
  -> call provider adapter to classify changed files into top-level groups and layer sub-groups
  -> validate/normalize result against changed file list
  -> persist result to filesystem cache
  -> return smart tree analysis payload
```

유지되는 것:

* provider 선택
* cached lookup
* worktree 기반 격리
* local clone mapping requirement

사라지는 것:

* 오른쪽 패널의 AI analysis 카드
* summary/risk/testing/question/notable-files 렌더러

## API Shape

기존 analyzer route path는 유지해도 된다. 다만 payload 의미는 바뀌며, old analysis payload와의 response compatibility는 제공하지 않는다.

```ts
type AnalyzePullRequestResult = {
  repository: {
    owner: string;
    repo: string;
  };
  number: number;
  provider: "codex" | "claude";
  model: string;
  completedAt: string;
  headOid: string;
  baseOid: string | null;
  analysis: SmartFileTreeAnalysis;
};
```

`GET /api/analyzer/pull-requests/:owner/:repo/:number?provider=...`

* cached smart tree analysis 조회
* mapping / provider availability 반환

`POST /api/analyzer/pull-requests/:owner/:repo/:number`

* smart tree analysis 새로 생성
* progress events는 유지 가능
* result payload는 새 schema 사용

## Validation and Normalization

provider output은 그대로 신뢰하면 안 된다. 서버에서 아래 검증을 강제한다.

* 모든 path가 실제 changed files 목록 안에 존재하는지
* 중복 path가 없는지
* 빈 상위 그룹 / 빈 하위 그룹 제거
* 상위 그룹 `fileCount` 재계산
* `order` 재정렬
* 하위 그룹 order가 layer ordering rule을 따르도록 보정
* 테스트 파일이 가능한 경우 대응 구현 하위 그룹에 붙도록 보정
* title/rationale trim
* 과도하게 긴 title/rationale 잘라내기

검증 후 누락된 파일이 있으면 자동으로 `ungroupedPaths` 로 보낸다.

검증 후 semantic group이 전부 무효가 되면:

* `strategy = "path-fallback"`
* `groups = []`
* `ungroupedPaths = 모든 changed file`

## Frontend Rendering

현재 `src/components/pr/file-tree.tsx` 는 path hierarchy만 렌더링한다. 이를 아래처럼 바꾼다.

### New rendering modes

* `smart grouped mode`
* `plain path mode`

mode switch 규칙:

* switch는 항상 렌더링한다
* default selected mode는 `smart grouped mode`
* smart result가 없어도 `plain path mode` 는 항상 진입 가능하다

### Smart grouped mode structure

```text
Description

Top-level group header
  title
  rationale
  file count

Sub-group header
  title
  layer badge
  rationale
  file count

Sub-group files
  flat ordered file rows
```

초기 버전에서는 하위 그룹 내부를 다시 nested directory tree로 만들지 않는다. semantic subgroup 안에서는 flat list가 더 읽기 쉽다.

필요한 UI affordance:

* persistent tree mode switch
* top-level group collapse/expand
* sub-group collapse/expand
* count badge
* optional layer badge
* selected file highlight 유지

권장 렌더 순서:

* tree mode switch
* smart mode status area
* `Description`
* top-level groups ordered by `order`
* inside each top-level group, sub-groups ordered by layer order
* `Other files` section for `ungroupedPaths`
* fallback path tree toggle는 추후 고려

smart mode status area 규칙:

* cached result 없음 + idle: 안내 문구 + `Analyze` 버튼
* cached result 없음 + loading: spinner + progress message
* cached result 있음 + outdated: warning notice + cached tree body
* cached result 있음 + reloading: updating notice + spinner/progress + cached tree body

## Prompt / Provider Contract

provider는 "PR을 리뷰 요약하라"가 아니라 "changed files를 2-level semantic review groups로 분류하라"는 좁은 과업만 수행해야 한다.

반드시 전달할 입력:

* PR title/body
* changed file list with additions/deletions/changeType
* renamed file의 old/new path
* local repo context
* 필요한 경우 representative diff snippets

provider instruction 핵심:

* narrative summary 금지
* 모든 파일을 정확히 한 번만 배치
* 먼저 상위 그룹을 구현 단위 기준으로 만든다
* 그 다음 각 상위 그룹 안에서 기술 레이어 하위 그룹을 만든다
* 하위 그룹은 외부 인터페이스에서 core 쪽으로 정렬한다
* 테스트 파일은 별도 레이어로 분리하지 말고 대응 구현 하위 그룹에 함께 둔다
* generated/docs/config는 구현 파일과 구분하되, 의미상 함께 봐야 하면 같은 상위 그룹 안의 별도 하위 그룹으로 둘 수 있다

## Storage

기존 filesystem cache 전략은 유지한다. 다만 old analysis cache format은 호환하지 않는다.

저장 단위:

* `owner/repo`
* PR number
* provider
* head commit

파일 포맷은 새 schema로 바뀌며, 기존 cache는 마이그레이션하지 않는다.

원칙:

* old analysis cache file은 읽지 않는다
* old analysis cache를 새 schema로 변환하지 않는다
* schema가 맞지 않으면 cache miss가 아니라 unsupported old data로 간주하고 무시하거나 삭제한다
* 필요하면 storage key 또는 filename도 새 포맷 기준으로 바꾼다

권장:

* payload에 `analysis.version = 1` 유지
* storage path 또는 filename에 smart-tree 전용 namespace를 둔다
* 배포 시 기존 cached analysis는 일괄 폐기해도 된다

## Affected Areas

직접 영향 예상 파일:

* `src/components/pr/file-tree.tsx`
* `src/components/pr/pr-analysis-panel.tsx`
* `src/components/pr/pull-request-analysis.tsx`
* `src/components/pr/pull-request-header.tsx`
* `src/routes/pull-request-page.tsx`
* `src/lib/analyzer.ts`
* `server/analyzer/types.ts`
* `server/analyzer/normalize.ts`
* `server/analyzer/prompt.ts`
* `server/analyzer/storage.ts`
* `server/routes/pr-analyzer.ts`
* provider adapters

예상 정리 대상:

* `PullRequestAnalysis` 컴포넌트 제거
* old schema normalizer 제거
* old schema reader / compatibility branch 제거
* summary/risk/testing/question UI 제거

## Rollout Plan

1. analyzer types를 새 `SmartFileTreeAnalysis` schema로 변경
2. provider prompt를 semantic grouping 전용으로 교체
3. server normalizer/validator를 새 schema 기준으로 작성
4. storage read/write를 smart-tree 전용 포맷으로 교체하고 legacy cache handling 제거
5. `PullRequestPage` 에서 analysis panel 렌더링 제거
6. `FileTree` 에 smart grouped mode 추가
7. semantic grouping 실패 시 plain path mode fallback 연결
8. provider별 실제 output 품질 점검 후 prompt 보정

## Risks

* semantic grouping이 너무 공격적이면 실제 repo structure를 찾기 어려울 수 있다
* provider output 품질이 낮으면 grouping 일관성이 떨어질 수 있다
* 2-level grouped list는 familiar한 directory tree보다 낯설 수 있다
* group rationale이 장황해지면 다시 "읽을거리 UI"가 된다

대응:

* fallback path mode 유지
* rationale 길이 제한
* hard validation으로 파일 누락/중복 차단
* top-level/sub-group 수 제한

## Acceptance Criteria

* 파일 미선택 상태에서 별도 `AI Analysis` 카드가 보이지 않는다.
* 파일 트리 상단에 `Smart File Tree` / `File Tree` switch가 항상 보인다.
* 기본 선택은 `Smart File Tree` 이다.
* cached smart result가 없어도 사용자는 `File Tree` 를 즉시 선택할 수 있다.
* changed files가 2-level semantic group 중심으로 렌더링된다.
* 상위 그룹은 구현 단위를 반영한다.
* 하위 그룹은 기술 레이어를 반영하고, `UI -> API -> Service -> Repository -> Infra` 순서가 유지된다.
* 관련 테스트 파일은 대응되는 구현 하위 그룹에 함께 묶인다.
* 모든 changed file이 정확히 한 번만 렌더링된다.
* cached smart result가 있으면 재분석 중에도 기존 결과를 유지한 채 updating 상태만 상단에 표시한다.
* cached smart result가 outdated여도 결과는 유지되며 warning만 상단에 표시한다.
* semantic grouping 실패 시 기존 path tree로 안전하게 fallback 된다.
* 기존 provider 선택과 cached lookup은 계속 동작한다.
* old analysis schema를 기대하는 UI/server/storage 코드는 제거된다.
* old cached analysis가 남아 있어도 이를 읽거나 변환하려고 시도하지 않는다.
