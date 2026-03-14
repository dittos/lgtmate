# PR Analyzer

목표: pull request를 열었을 때 AI가 PR 전체를 분석하고, 그 결과를 lgtmate UI 안에서 바로 확인할 수 있게 한다.

이번 설계에서는 분석 엔진으로 `Codex SDK` 또는 `Claude Code SDK`를 사용할 수 있도록 provider 추상화를 먼저 두고, provider 선택은 사용자가 런타임에 바꿀 수 있게 설계한다. 다만 분석은 GitHub API payload만으로 하지 않고, 로컬에 clone된 저장소를 기반으로 수행한다. UI와 API는 provider에 종속되지 않게 유지한다.

## Problem

현재 lgtmate는 아래 정보까지만 보여준다.

* PR 메타데이터
* 변경 파일 트리
* 선택한 파일 diff
* PR description

이 구조만으로도 수동 리뷰는 가능하지만, 다음 정보는 사용자가 직접 읽어서 조합해야 한다.

* 이 PR이 무엇을 바꾸는지에 대한 요약
* 어떤 파일이 핵심인지
* 위험한 변경인지
* 테스트나 후속 확인 포인트가 무엇인지
* 리뷰어가 먼저 봐야 할 질문이 무엇인지

작은 PR에서는 괜찮지만, 파일 수가 많아질수록 첫 진입 비용이 커진다.

## Goals

* PR 단위 AI 분석 기능을 추가한다.
* 프론트엔드에서 분석 상태와 결과를 자연스럽게 보여준다.
* 분석 엔진은 `Codex SDK`와 `Claude Code SDK` 중 하나를 런타임에 선택할 수 있게 한다.
* provider 교체 없이도 동일한 API 응답 포맷과 UI를 유지한다.
* 분석 요청은 서버에서 수행한다. 프론트엔드는 SDK 키나 SDK 내부 구현을 직접 알지 않는다.
* 분석은 로컬 clone이 연결된 저장소에서만 수행한다.
* 분석 실행 중 로컬 clone의 변경은 격리되어야 하며, 이를 위해 `git worktree`를 사용한다.
* 초기 버전에서는 "한 번 분석해서 결과 보여주기"에 집중한다.

## Non-goals

* 자동 코드 수정 제안 적용
* GitHub review comment를 자동으로 작성하거나 게시하기
* 사용자별 분석 이력 저장
* 장기 persistence DB 도입
* 스트리밍 토큰 단위 렌더링
* clone이 없는 원격 저장소에 대한 원격 전용 분석

스트리밍은 나중에 붙일 수 있지만, 첫 버전은 request/response 기반으로 단순하게 가져간다.

## User Experience

PR 페이지 진입 시 기존 레이아웃은 유지하되, 오른쪽 패널의 "description 기본 상태"를 AI 분석 결과와 함께 사용하는 방향이 적합하다.

초기 진입 상태:

* 좌측: 파일 트리
* 우측 상단: PR header
* 우측 본문: `AI Analysis` 카드 + PR description

파일 선택 시:

* 좌측: 파일 트리
* 우측: 선택 파일 diff
* 우측 하단 또는 보조 영역: 선택 파일과 무관한 PR 분석 요약은 접거나 유지할 수 있음

초기 구현에서는 레이아웃 복잡도를 낮추기 위해 다음 방식이 가장 단순하다.

* 파일이 선택되지 않았을 때만 `AI Analysis` + `Description`을 보여준다.
* 파일이 선택되면 기존처럼 diff panel만 보여준다.

이 방식은 현재 `PullRequestPage` 구조를 크게 깨지 않고 붙일 수 있다.

## Analysis Output

초기 버전의 응답은 자유 텍스트보다 구조화된 JSON이 더 적합하다. UI가 안정적이고 provider가 바뀌어도 동일하게 렌더링할 수 있기 때문이다.

응답 스키마 초안:

```ts
type PullRequestAnalysis = {
  summary: string;
  changeAreas: Array<{
    title: string;
    summary: string;
    files: string[];
  }>;
  risks: Array<{
    severity: "high" | "medium" | "low";
    title: string;
    details: string;
    files?: string[];
  }>;
  testing: {
    existingSignals: string[];
    recommendedChecks: string[];
  };
  reviewerQuestions: string[];
  notableFiles: Array<{
    path: string;
    reason: string;
  }>;
  rawMarkdown?: string;
};
```

UI는 우선 아래 블록만 보여주면 충분하다.

* Summary
* Key change areas
* Risks
* Recommended checks
* Reviewer questions
* Notable files

`rawMarkdown`은 디버깅이나 provider fallback 용도로만 남겨두고, 기본 렌더링은 구조화 데이터에 맞춘다.

## High-level Architecture

```text
PullRequestPage
  -> fetch PR metadata/files from existing GitHub API routes
  -> fetch existing analysis metadata
  -> if analysis file exists, render it
  -> compare PR head commit with stored analysis head commit in frontend
  -> on explicit user action, request fresh analysis only when needed

Vite middleware route
  -> resolve local clone mapped to owner/repo
  -> create isolated git worktree for PR head/base context
  -> collect PR context from local checkout + GitHub metadata
  -> call selected AI provider adapter inside worktree context
  -> validate/normalize JSON result
  -> persist analysis result to filesystem cache
  -> remove worktree
  -> return analysis payload
```

핵심 원칙:

* GitHub fetch, local repo resolution, worktree 생성, AI 호출은 모두 서버에서 수행
* 프론트엔드는 `/api/analyze/...` 같은 내부 route만 호출
* provider별 차이는 server adapter 내부에 가둔다
* 로컬 clone이 연결되지 않은 저장소는 분석할 수 없다
* 분석 엔진은 원본 clone 디렉터리에서 직접 실행하지 않고, 항상 임시 worktree에서 실행한다
* repo mapping은 서버 내부 파일에서만 resolve하며, API나 UI로 수정하지 않는다

## Repository Mapping

분석 엔진이 전체 컨텍스트를 이해하려면 "이 GitHub 저장소가 로컬 어디에 clone되어 있는지"를 알아야 한다.

따라서 별도 repo mapping 계층이 필요하다.

핵심 요구사항:

* GitHub repo (`owner/repo`)와 로컬 clone 절대경로를 매핑할 수 있어야 한다.
* 하나의 GitHub repo는 하나의 canonical local clone에 연결된다.
* 매핑된 경로가 실제 git repository인지 검증해야 한다.
* 매핑된 clone의 remote URL이 GitHub repo와 일치하는지 확인해야 한다.

저장 방식은 파일 기반으로 두고, 사용자가 직접 관리한다.

예시:

* `$HOME/.lgtmate/repo-mappings.json`
* key: `owner/repo`
* value: local clone path

포맷:

```json
{
  "owner/repo1": "/local/path/to/repo1/clone"
}
```

디렉터리 정책:

* lgtmate가 관리하는 사용자별 로컬 상태는 `$HOME/.lgtmate/` 아래에 둔다.
* 초기 버전에서 필요한 하위 파일은 아래와 같다.

  * `$HOME/.lgtmate/repo-mappings.json`
  * `$HOME/.lgtmate/worktrees/`
  * `$HOME/.lgtmate/analyses/`

권장 구조 예시:

```text
$HOME/.lgtmate/
  repo-mappings.json
  worktrees/
  analyses/
  logs/
```

이 파일은 UI에서 수정하지 않는다. 사용자가 직접 편집해 두는 전제로 간다.

서버가 startup 또는 request 시 수행할 검증:

* path 존재 여부
* `.git` 또는 git worktree 구조 여부
* `git remote get-url origin`
* remote가 `https://github.com/owner/repo(.git)` 또는 `git@github.com:owner/repo(.git)`와 호환되는지 확인

UI는 매핑이 없으면 "No local clone mapping found" 상태만 보여주고, 매핑 수정 기능은 제공하지 않는다.

## Worktree Isolation

분석 엔진은 전체 저장소를 읽고, 경우에 따라 파일 생성이나 임시 상태 변경을 시도할 수 있다. 이 작업이 사용자의 원본 clone을 오염시키면 안 된다.

그래서 분석은 항상 `git worktree` 안에서 수행한다.

원칙:

* 원본 clone에서 직접 analyzer를 실행하지 않는다.
* PR 분석 요청마다 별도 임시 worktree를 생성한다.
* 분석 종료 후 worktree를 제거한다.
* 실패해도 cleanup이 가능해야 한다.

권장 흐름:

1. repo mapping으로 canonical clone path를 찾는다.
2. clone fetch 상태를 확인하거나 필요한 ref를 fetch한다.
3. PR head commit 또는 비교 대상 commit을 resolve한다.
4. 임시 디렉터리에 detached worktree를 만든다.
5. analyzer는 해당 worktree를 현재 작업 디렉터리로 사용한다.
6. 분석이 끝나면 `git worktree remove`로 정리한다.

임시 경로 예시:

* `$HOME/.lgtmate/worktrees/{owner}-{repo}-{number}-{timestamp}`

가능한 명령 예시:

```bash
git -C /path/to/repo worktree add --detach $HOME/.lgtmate/worktrees/acme-api-42-123456 <commit-ish>
git -C /path/to/repo worktree remove $HOME/.lgtmate/worktrees/acme-api-42-123456 --force
```

worktree 기준 commit 선택:

* 기본은 PR `headRefOid`
* 필요하면 base branch merge-base 정보도 함께 provider prompt에 전달

초기 버전은 우선 head 기준 checkout만으로 시작하고, 필요 시 base snapshot 비교를 확장한다.

## Provider Abstraction

서버에 공통 인터페이스를 둔다.

```ts
export type AnalyzePullRequestInput = {
  owner: string;
  repo: string;
  number: number;
  provider: "codex" | "claude";
  model?: string;
  localRepositoryPath: string;
  worktreePath: string;
  headOid?: string;
  baseOid?: string;
  pullRequest: GithubPullRequest;
};

export type AnalyzePullRequestResult = {
  provider: "codex" | "claude";
  model: string;
  completedAt: string;
  headOid: string;
  baseOid: string | null;
  analysis: PullRequestAnalysis;
};

export interface PullRequestAnalyzer {
  analyzePullRequest(
    input: AnalyzePullRequestInput
  ): Promise<AnalyzePullRequestResult>;
}
```

구현체 예시:

* `server/analyzer/providers/codex.ts`
* `server/analyzer/providers/claude.ts`
* `server/analyzer/create-analyzer.ts`

provider 선택 방식:

* 사용자는 프론트엔드에서 provider를 선택한다.
* 선택된 provider와 optional model override는 분석 요청 body에 포함된다.
* 서버는 request 값을 기준으로 `createAnalyzer()`에서 adapter를 고른다.
* 환경 변수는 provider 선택이 아니라 "사용 가능한 provider의 API key / default model" 정도만 담당한다.
* provider adapter는 worktree 경로를 받아 그 디렉터리 기준으로 분석 엔진을 실행할 수 있어야 한다.

예시:

```ts
type AnalyzePullRequestRequest = {
  provider: "codex" | "claude";
  model?: string;
};
```

중요한 점:

* provider SDK의 정확한 import 이름과 structured output 지원 방식은 실제 구현 시점에 다시 확인해야 한다.
* 문서 단계에서는 "JSON 강제 출력이 가능한 provider adapter"까지만 책임을 둔다.
* 유효하지 않은 provider 값이 오면 서버는 400을 반환해야 한다.

## Data Collection Strategy

분석 품질과 격리 실행을 동시에 만족시키려면 서버가 전달하는 정보와, 분석 에이전트가 worktree 안에서 직접 찾아야 하는 정보를 분리해야 한다.

GitHub에서 가져오는 정보:

* PR title
* PR body
* base/head branch
* author
* head/base commit metadata

로컬 clone + worktree에서 가져오는 정보:

* analyzer가 직접 읽을 수 있는 전체 소스 컨텍스트
* analyzer가 필요에 따라 조회하는 실제 파일 트리
* analyzer가 필요에 따라 조회하는 `git diff`, `git status`, `git log` 등 git 정보
* analyzer가 필요에 따라 조회하는 repo 내부 설정 파일, 테스트 설정, package manifest 등 주변 맥락

핵심 차이:

* 서버는 PR 자체의 메타데이터만 제공한다.
* 파일 목록, patch, diff 요약 같은 git repo에서 유추 가능한 정보는 prompt에 포함하지 않는다.
* analyzer는 worktree 안에서 직접 파일과 git 정보를 읽을 수 있어야 한다.
* 세부 코드 탐색과 변경 파악은 analyzer가 worktree에서 수행하게 한다.

권장 정책:

* request payload에는 PR 메타데이터만 포함한다
* git repo에서 재구성 가능한 정보는 중복 전달하지 않는다
* 대형 PR에서도 analyzer가 필요한 파일과 diff를 worktree에서 직접 읽게 한다
* 전체 repo 내용을 HTTP payload로 직렬화하지 않는다

즉, 분석 품질의 핵심은 payload enrichment가 아니라 worktree 접근성과 에이전트의 자율 탐색 능력이다.

## Prompt Shape

prompt는 최대한 provider-independent 하게 유지한다.

system prompt 역할:

* 너는 pull request reviewer를 보조하는 분석기다.
* PR metadata와 현재 worktree에 checkout된 repository context를 기반으로 판단한다.
* 확신 없는 내용은 추정이라고 표시한다.
* 결과는 지정한 JSON schema에 맞춰라.

user payload 역할:

* repo / PR 기본 정보
* PR body
* worktree path 또는 현재 작업 디렉터리가 분석 대상 저장소라는 사실
* 출력 스키마 정의

명시적으로 제외할 정보:

* changed file list
* patch text
* diff summary
* git repo를 읽으면 바로 알 수 있는 파생 정보

중요한 지침:

* "버그를 단정하지 말고 risk와 question 형태를 우선하라"
* "테스트가 보이지 않으면 테스트 공백 가능성을 명시하라"
* "파일 경로를 가능한 한 연결하라"

## API Design

새 route 제안:

* `GET /api/analyzer/pull-requests/:owner/:repo/:number`
* `POST /api/analyzer/pull-requests/:owner/:repo/:number`

`GET`은 기존 분석 결과 파일이 있는지 조회하고, 있으면 그 결과를 돌려준다.

`POST`는 명시적으로 새 분석을 실행하고 결과 파일을 갱신한다.

`POST` request body로 provider 선택값을 받는다.

```json
{
  "provider": "codex",
  "model": "gpt-5",
  "forceRefresh": false
}
```

`GET` 응답 예시:

```json
{
  "ok": true,
  "analysis": {
    "provider": "codex",
    "model": "gpt-5",
    "completedAt": "2026-03-14T10:00:00.000Z",
    "headOid": "abc123",
    "baseOid": "def456",
    "analysis": {
      "summary": "..."
    }
  }
}
```

응답 예시:

```json
{
  "ok": true,
  "result": {
    "provider": "codex",
    "model": "gpt-5",
    "completedAt": "2026-03-14T10:00:00.000Z",
    "headOid": "fff999",
    "baseOid": "def456",
    "analysis": {
      "summary": "This PR refactors authentication middleware and updates session validation flow.",
      "changeAreas": [],
      "risks": [],
      "testing": {
        "existingSignals": [],
        "recommendedChecks": []
      },
      "reviewerQuestions": [],
      "notableFiles": []
    }
  }
}
```

실패 응답:

```json
{
  "ok": false,
  "error": "Failed to analyze pull request"
}
```

선택지로 `GET` + 캐시도 가능하지만, 현재 앱 구조에서는 `POST`가 의미상 더 맞다.

중요한 UX 원칙:

* 이 요청은 페이지 진입 시 자동으로 발생하지 않는다.
* 사용자가 명시적으로 `Analyze` 버튼을 눌렀을 때만 실행한다.

## Server Design

추가 파일 초안:

* `server/routes/pr-analyzer.ts`
* `server/routes/repo-mappings.ts`
* `server/analyzer/types.ts`
* `server/analyzer/create-analyzer.ts`
* `server/analyzer/providers/codex.ts`
* `server/analyzer/providers/claude.ts`
* `server/analyzer/prompt.ts`
* `server/analyzer/normalize.ts`
* `server/analyzer/repo-mappings.ts`
* `server/analyzer/worktree.ts`
* `server/analyzer/storage.ts`

`server/routes/pr-analyzer.ts` 책임:

* route param 파싱
* `GET` 요청 시 existing analysis file lookup
* `POST` 요청 시 request body에서 provider / model 파싱
* repo mapping 조회 및 검증
* GitHub에서 PR summary와 commit metadata 수집
* worktree 생성
* analyzer input 구성
* provider 실행
* 결과를 filesystem에 저장
* worktree cleanup
* 응답 검증 후 JSON 반환

`server/analyzer/storage.ts` 책임:

* `$HOME/.lgtmate` 기본 디렉터리 결정
* 필요한 하위 디렉터리 생성
* repo mapping 파일 read
* worktree 루트 경로 제공
* analysis result 파일 read/write

analysis result 저장 경로 예시:

* `$HOME/.lgtmate/analyses/{owner}/{repo}/{number}/{provider}.json`

저장 포맷 예시:

```ts
type StoredPullRequestAnalysis = {
  repository: { owner: string; repo: string };
  number: number;
  provider: "codex" | "claude";
  model: string;
  completedAt: string;
  headOid: string;
  baseOid: string | null;
  analysis: PullRequestAnalysis;
};
```

`server/analyzer/normalize.ts` 책임:

* provider 응답이 살짝 어긋나도 UI가 깨지지 않게 기본값 보정
* severity 값 normalize
* 배열 필드 fallback

메모리 캐시는 두지 않는다.

대신 분석 결과는 파일시스템에 저장하고 재사용한다.

outdated 판단 기준:

* 서버는 저장된 분석 결과의 `headOid`를 그대로 반환한다.
* 프론트엔드는 이미 로드한 PR 데이터의 현재 commit hash와 저장된 `headOid`를 비교한다.
* 값이 다르면 프론트에서 `outdated` 배지를 표시한다.
* analyzer `GET` route는 freshness 계산을 위해 PR 정보를 다시 fetch하지 않는다.

## Frontend Design

클라이언트 쪽에는 GitHub API helper와 비슷한 analyzer helper를 둔다.

예시:

* `src/lib/analyzer.ts`
* `src/components/pr/pull-request-analysis.tsx`
* `src/components/pr/analysis-status-card.tsx`

타입 예시:

```ts
export type PullRequestAnalysisResponse =
  | { ok: true; result: AnalyzePullRequestResult }
  | { ok: false; error: string };
```

`PullRequestPage` 변경 방향:

* 기존 PR/파일 로딩과 별도로 analysis state 추가
* analysis availability / cached result state 추가
* 사용자 provider 선택 state 추가
* PR summary와 files는 평소처럼 자동 로드
* 페이지 진입 시 현재 provider 기준 existing analysis를 먼저 조회
* cached analysis가 있으면 먼저 보여준다
* cached analysis가 없을 때만 empty state를 보여준다
* 프론트가 PR의 현재 commit hash와 stored analysis의 `headOid`를 비교해 outdated 여부를 계산한다
* 사용자가 `Analyze`를 누를 때만 analysis fetch 시작
* analysis loading, error, success 상태를 관리
* 파일 미선택 상태에서 `PullRequestAnalysis`와 `PullRequestDescription`을 순서대로 렌더링

provider 선택 state 예시:

```ts
const [analysisProvider, setAnalysisProvider] = useState<"codex" | "claude">(
  "codex"
);
```

상태 예시:

```ts
const [analysis, setAnalysis] = useState<AnalyzePullRequestResult | null>(null);
const [isAnalysisOutdated, setIsAnalysisOutdated] = useState(false);
const [hasAnalysisMapping, setHasAnalysisMapping] = useState(false);
const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
const [analysisError, setAnalysisError] = useState<string | null>(null);
```

렌더링 정책:

* provider selector: header 근처 또는 analysis 카드 상단
* mapping 없음: local clone mapping missing 상태 표시
* mapping 있음 + provider 사용 가능: `Analyze` 버튼 표시
* cached analysis 있음: 결과 표시
* cached analysis outdated: 프론트에서 계산한 경고 배지 표시 후 stale result를 계속 보여줌
* cached analysis 없음: empty state 유지
* 로딩 중: skeleton 또는 "Analyzing pull request..."
* 실패: 분석 실패 카드 + retry 버튼
* 성공: 구조화된 섹션 카드 렌더링

## UI Placement

첫 구현 기준 추천 배치:

* `PullRequestHeader`
* main split pane
* 우측 기본 상태:
  * analysis status / cache status
  * provider selector
  * `PullRequestAnalysis`
  * `PullRequestDescription`

이유:

* 현재 구조에서 가장 작은 수정으로 붙일 수 있다.
* 사용자가 파일 선택 전 "이 PR을 먼저 이해하는 단계"와 잘 맞는다.
* diff 화면과 분석 화면이 동시에 떠서 시선이 분산되는 문제를 줄인다.
* clone 연결 여부를 분석 카드 앞단에 배치하면 왜 분석이 안 되는지 설명하기 쉽다
* 명시적 실행 방식이면 불필요한 worktree 생성과 provider 호출을 막을 수 있다
* stale analysis를 숨기지 않고 보여주면 사용자는 오래된 결과인지 인지한 상태로 바로 읽을 수 있다

후속 개선 후보:

* notable file 클릭 시 해당 path 선택
* risk에 연결된 file path 클릭 시 diff 이동
* 우측 패널 상단에 "Analysis / Description" 탭 추가
* file 선택 상태에서도 접을 수 있는 sticky summary 제공

## Error Handling

에러는 세 종류로 구분하는 것이 좋다.

* repo mapping 없음 또는 mapping 검증 실패
* cached analysis file read 실패
* worktree 생성 실패 / cleanup 실패
* GitHub 데이터 수집 실패
* AI provider 호출 실패
* AI 출력 파싱 실패

사용자 메시지는 너무 세부적일 필요는 없지만 원인은 구분되면 좋다.

예시:

* `No local clone is connected for this repository.`
* `The connected local clone is invalid or no longer matches this GitHub repository.`
* `The stored analysis result could not be read.`
* `Failed to create an isolated worktree for analysis.`
* `Failed to analyze this pull request.`
* `GitHub data could not be collected for analysis.`
* `The analyzer returned an invalid response.`

개발 로그에는 아래를 남긴다.

* provider 이름
* model 이름
* repo mapping path
* worktree path
* stored analysis path
* latency

단, repository contents나 git diff 원문 전체를 로그로 남기지는 않는다.

## Security and Privacy

이 기능은 서버가 PR 내용을 외부 AI provider에 전송한다는 점이 핵심이다.

따라서 최소한 아래 원칙이 필요하다.

* 선택된 provider에 필요한 API key가 서버에 없으면 해당 provider는 unavailable 상태로 표시
* `$HOME/.lgtmate` 하위 파일은 사용자 로컬 상태로 간주하고 권한을 최소화한다
* 매핑된 local path가 workspace 밖일 수 있으므로 path 검증이 반드시 필요하다
* repo mapping 파일은 서버만 읽고, API/UI로 직접 수정하지 않는다
* analyze API는 local path를 직접 받지 않고 서버 내부 mapping으로만 resolve한다
* analyzer는 원본 clone이 아니라 worktree 안에서만 실행한다
* worktree cleanup 실패 시 stale worktree를 감지하고 정리할 수 있어야 한다
* UI에서 "AI analysis unavailable" 상태를 표시
* 민감한 저장소에서는 사용자가 로컬 환경에서만 키를 넣어 쓰게 함
* provider에 보내는 payload를 로그에 남기지 않음

선택적으로 나중에 다음도 고려할 수 있다.

* private repo 경고 배지
* analyzer off 스위치
* provider별 data retention 정책 안내 링크

## Open Questions

아래는 구현 전에 결정이 필요하다.

* 초기 기본 provider를 `Codex SDK`로 둘지, `Claude Code SDK`로 둘지
* provider 선택값을 URL query, localStorage, session memory 중 어디에 둘지
* worktree 생성 전 필요한 fetch를 어느 수준까지 자동화할지
* structured output을 SDK 레벨에서 강제할지, prompt + post-parse로 처리할지
* notable file 클릭 시 현재처럼 query param만 바꾸는 UX로 충분한지

## Recommended Phase Plan

### Phase 1

가장 작은 end-to-end 구현:

* repo mapping file reader 추가
* cached analysis `GET` route 추가
* analyzer route 추가
* 단일 provider adapter 추가
* local clone validation + worktree lifecycle 추가
* PR metadata + local worktree 기반 분석
* 사용자가 `Analyze` 버튼을 눌렀을 때만 분석 요청 수행
* 분석 결과 filesystem 저장
* cached result 존재 여부와 outdated 상태 표시
* 파일 미선택 상태에서 analysis 카드 렌더링
* retry 버튼 추가

### Phase 2

품질 보강:

* stale worktree cleanup
* response normalization 강화
* notable file deep-link

### Phase 3

확장:

* 두 번째 provider adapter 추가
* provider별 모델 선택 UI
* streaming 또는 progress 단계 표시

## Suggested Implementation Order

1. analyzer 타입과 공통 인터페이스 정의
2. repo mapping 파일 read/검증 로직 작성
3. analysis storage read/write 로직 작성
4. worktree 생성/정리 유틸 작성
5. server route와 GitHub context 수집 로직 작성
6. 첫 provider adapter 구현
7. analyzer client helper 추가
8. `PullRequestPage`에 cached analysis + outdated state 연결
9. `PullRequestAnalysis` UI와 status UI 추가
10. retry / notable file 이동 보강

## Decision

현재 코드베이스 기준으로는 아래 선택이 가장 현실적이다.

* 서버에서 PR 분석 수행
* provider adapter로 `Codex SDK` / `Claude Code SDK` 차이 격리
* provider 선택은 요청 단위로 받고, 서버는 request-driven 방식으로 analyzer를 선택
* repo mapping은 `$HOME/.lgtmate/repo-mappings.json` 파일로 관리
* repo mapping 수정 기능은 API/UI로 노출하지 않고, 사용자가 파일을 직접 관리
* 분석은 로컬 clone 매핑이 존재할 때만 허용
* analyze API는 local path를 받지 않고 서버 내부 mapping으로만 resolve
* 분석 엔진은 원본 repo가 아니라 임시 `git worktree` 안에서 실행
* worktree는 `$HOME/.lgtmate/worktrees/` 아래에서 관리
* 분석은 자동으로 시작하지 않고, 사용자가 명시적으로 시작할 때만 실행
* 분석 결과는 메모리가 아니라 `$HOME/.lgtmate/analyses/` 아래 파일로 저장
* 프론트는 먼저 cached analysis를 조회하고, 저장된 `headOid`와 현재 PR의 commit hash를 비교해 outdated 상태를 표시
* 응답은 구조화 JSON으로 통일
* UI는 파일 미선택 상태에서 `AI Analysis`를 description 위에 표시

이 설계면 기존 PR viewer 구조를 거의 유지하면서, 추후 provider 교체와 UX 확장도 어렵지 않다.
