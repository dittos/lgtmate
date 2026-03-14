# Background Analysis Jobs

목표: PR analysis를 HTTP request 수명주기에서 분리해서, 브라우저를 닫거나 PR 화면을 떠나도 서버가 백그라운드에서 계속 분석을 수행할 수 있게 한다. 또한 프론트엔드는 나중에 다시 접속했을 때 현재 job 상태를 복원하고, 진행상황 스트림에 다시 붙을 수 있어야 한다.

현재 analysis는 `POST /api/analyzer/...` 요청이 살아있는 동안만 progress를 전달하는 구조다. 이 방식은 구현은 단순하지만, 브라우저 탭 종료나 PR 이동 시 UX가 끊기고, 완료 전까지는 진행 중 작업을 다시 확인할 방법이 없다.

이번 작업에서는 analysis를 "단발성 stream response"가 아니라 "서버가 관리하는 analysis job"으로 재정의한다.

## Problem

현재 구조의 한계는 아래와 같다.

* analysis 실행 상태가 프론트엔드 component state에만 있다.
* 브라우저를 닫거나 다른 PR로 이동하면 진행 상태가 사라진다.
* 서버는 클라이언트 연결 종료와 무관하게 계속 작업할 수 있지만, 그 상태를 다시 조회하거나 재구독할 API가 없다.
* 같은 PR에 대해 이미 실행 중인 analysis가 있어도, 프론트엔드는 이를 모르고 새 요청을 보낼 수 있다.
* cached completed result는 읽을 수 있지만, "현재 분석 중" 상태는 복원할 수 없다.

이 때문에 실제 서버 작업 상태와 UI 상태가 쉽게 어긋난다.

## Goals

* analysis 실행을 서버 관리 background job으로 분리한다.
* 브라우저 종료, 새로고침, PR 페이지 이탈 이후에도 job은 계속 진행된다.
* 프론트엔드는 PR 페이지에 다시 들어왔을 때 현재 job 상태를 복원할 수 있다.
* 프론트엔드는 진행 중인 job의 progress stream에 다시 붙을 수 있다.
* completed result cache와 in-progress job state를 함께 지원한다.
* 같은 `owner/repo/number/provider/headOid` 기준으로 중복 실행을 피한다.
* job이 완료되면 기존 analysis cache에 결과를 저장한다.
* job 실패, 취소, stale 상태를 구분해서 표현할 수 있다.

## Non-goals

* 분산 job queue 도입
* 외부 DB 도입
* 멀티 프로세스/멀티 인스턴스 coordination
* 사용자별 권한 분리
* provider별 세부 진행률 퍼센트 계산
* job 재시작 후 stdout/stderr 전체 로그 영구 보관
* job state의 filesystem persistence

초기 버전은 "단일 lgtmate 서버 프로세스 안에서 돌아가는 in-memory job"까지만 목표로 한다.

## User Experience

### PR page initial load

PR 페이지 진입 시 프론트엔드는 아래 두 정보를 함께 본다.

* cached analysis result
* active or recent analysis job state

가능한 상태:

1. completed analysis만 있음
2. active job만 있음
3. completed analysis와 active re-analysis job이 함께 있음
4. 실패한 recent job이 있음
5. 아무 결과도 job도 없음

### When analysis is running

진행 중 analysis가 있으면 UI는 이를 "현재 세션에서 시작한 요청"이 아니라 "서버에서 실행 중인 job"으로 취급한다.

표시 원칙:

* PR을 다시 열어도 동일한 progress 상태가 보여야 한다.
* 다른 PR로 이동했다가 돌아와도 여전히 진행 중이면 loading state를 복원한다.
* cached result가 있으면 re-analysis 중에도 기존 결과를 유지한다.
* cached result가 없으면 loading/empty state를 보여준다.
* 진행 메시지는 최신 메시지 1개만 기본 노출한다.

### When browser closes

브라우저를 닫아도 job은 유지된다.

사용자가 나중에 돌아오면:

* job이 아직 실행 중이면 "Analyzing..." 상태를 다시 본다.
* job이 그 사이 완료되었으면 완료된 cached analysis를 본다.
* job이 실패했으면 마지막 실패 상태와 메시지를 본다.

### Re-subscribe behavior

프론트엔드는 active job이 있으면 progress stream에 붙는다.

원칙:

* stream 연결 실패 자체가 job 실패를 의미하지는 않는다.
* stream이 끊기면 프론트엔드는 job status polling 또는 재연결로 복구할 수 있어야 한다.
* 사용자가 페이지를 새로 열었을 때 이전 진행 로그 전체를 반드시 재생할 필요는 없다.
* 최소 요구사항은 "현재 state + 마지막 progress message + 이후 신규 이벤트 수신"이다.
* 서버 재시작 이후에는 기존 job state가 사라질 수 있다.

## High-level Architecture

```text
Frontend
  -> GET analysis state for PR/provider
  -> if active job exists, connect to progress stream by jobId
  -> if user requests analyze and matching active job exists, reuse it
  -> if no matching active job exists, create a new job

Analyzer route layer
  -> resolve PR metadata and head SHA
  -> lookup existing active job by dedupe key
  -> create job record and start background runner if needed
  -> return current state immediately

Background runner
  -> create isolated worktree
  -> execute provider analyzer
  -> append progress events to job state
  -> persist final status/result
  -> write analysis cache on success
  -> cleanup worktree

Progress stream route
  -> read current job snapshot
  -> emit snapshot or latest message
  -> stream subsequent progress/status events
```

핵심 원칙:

* analysis 실행과 client connection은 분리한다.
* job state는 서버 메모리에서만 관리한다.
* completed analysis는 기존 analysis cache를 source of truth로 유지한다.
* active job tracking은 별도 job store가 담당한다.
* progress stream은 "작업 실행 채널"이 아니라 "관찰 채널"이다.

## Job Identity and Deduplication

job은 아래 기준으로 중복을 판정한다.

* repository owner
* repository repo
* pull request number
* provider
* target head OID
* requested model

권장 dedupe key:

```ts
`${owner}/${repo}#${number}:${provider}:${model}:${headOid}`
```

동작 원칙:

* 같은 dedupe key의 active job이 있으면 새 job을 만들지 않고 기존 job을 재사용한다.
* `forceRefresh` 는 completed cache를 무시하게 할 수는 있지만, 이미 같은 target으로 active job이 있으면 그 job에 합류한다.
* PR head가 바뀌면 다른 job으로 취급한다.
* provider가 다르면 별도 job이다.

## Job Lifecycle

```ts
type AnalysisJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
```

초기 버전 lifecycle:

1. `queued`
2. `running`
3. `completed` or `failed`

`cancelled` 는 향후 취소 기능을 위한 예약 상태로 두되, 이번 작업에서 실제 cancel API를 반드시 구현할 필요는 없다.

job record 예시:

```ts
type AnalysisJobRecord = {
  id: string;
  owner: string;
  repo: string;
  number: number;
  provider: "codex" | "claude";
  model: string;
  headOid: string;
  baseOid: string | null;
  dedupeKey: string;
  status: AnalysisJobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  progressMessage: string | null;
  progressSequence: number;
  error: string | null;
  resultPath: string | null;
};
```

추가 원칙:

* `updatedAt` 은 progress event마다 갱신한다.
* `progressSequence` 는 stream resume 또는 client-side stale event 방지에 쓸 수 있다.
* 성공 시 `resultPath` 는 stored analysis cache file을 가리킬 수 있다.

## State Model

기존 `$HOME/.lgtmate/analyses/` 는 completed result cache 용도로 유지한다.

job state는 별도 filesystem에 저장하지 않고 서버 메모리에만 둔다.

즉, 유지되는 것은 두 층이다.

* completed analysis result: filesystem cache
* active / recent job state: in-memory job store

이 설계의 의미:

* 브라우저 종료나 PR 페이지 이탈에는 강하다.
* 서버 프로세스 재시작에는 강하지 않다.
* 진행 상태 복원은 "같은 서버 프로세스가 살아 있는 동안"만 보장된다.

초기 버전에서 event log 전체 저장은 필수가 아니다.

메모리 snapshot으로 유지할 최소 정보:

* 현재 job snapshot
* 마지막 progress message

선택 사항:

* 최근 progress event 몇 개를 ring buffer로 메모리에 유지

이 ring buffer가 있으면 reconnect 직후 최근 이벤트 일부를 재전송할 수 있지만, 초기 버전에서는 snapshot + live events만으로도 충분하다.

## Backend Responsibilities

### 1. Job store

서버 내부에 job store 계층을 추가한다.

역할:

* job 생성
* dedupe key로 active job 조회
* job 상태 갱신
* job snapshot 읽기
* active job 목록 조회

중요한 제약:

* 현재 lgtmate는 단일 프로세스 앱으로 가정한다.
* 프로세스가 죽으면 child process도 같이 죽을 가능성이 높다.
* 따라서 "프로세스 재시작 후 job 복구"는 이번 작업의 목표가 아니다.
* 서버가 재시작되면 in-memory job state는 사라진다.
* 재시작 이후에는 active job을 복구하지 않고, completed analysis cache만 조회 가능하다.

### 2. Background runner

`POST` 요청 핸들러 안에서 analyzer를 직접 await하지 않고, job을 만든 뒤 백그라운드 runner를 시작한다.

동작:

1. PR metadata/files/headOid 수집
2. dedupe key 계산
3. active job 조회
4. 있으면 해당 job snapshot 반환
5. 없으면 job 생성
6. background task 시작
7. HTTP 응답은 즉시 job snapshot 반환

background task 내부에서는 현재 analyzer flow를 재사용한다.

* worktree 생성
* provider 실행
* progress callback을 job store update로 연결
* 성공 시 analysis cache 저장
* 실패 시 job 상태 저장
* cleanup 수행

### 3. Stream fan-out

서버는 active job별 subscriber 목록을 메모리로 관리한다.

예시:

```ts
Map<jobId, Set<(event: AnalysisJobStreamEvent) => void>>
```

job 상태가 바뀌면:

* memory subscribers에 event broadcast

이 구조면 job 실행과 stream subscriber 수를 분리할 수 있다.

## API Design

기존 endpoint를 완전히 제거하지 말고, semantic meaning을 job 기반으로 바꾼다.

### 1. Lookup analysis state

```http
GET /api/analyzer/pull-requests/:owner/:repo/:number?provider=codex
```

응답 예시:

```ts
type PullRequestAnalysisLookupResponse = {
  ok: true;
  analysis: AnalyzePullRequestResult | null;
  repository: {
    hasMapping: boolean;
    path: string | null;
    error: string | null;
  };
  providers: Record<AnalyzerProvider, AnalyzerProviderAvailability>;
  job: AnalysisJobSnapshot | null;
};
```

규칙:

* `analysis` 는 latest completed cached result
* `job` 은 현재 PR/provider/head 기준 active job 또는 가장 최근 relevant job
* active job이 없고 recent failed job만 있으면 그 실패 상태를 줄 수 있다

### 2. Create or join analysis job

```http
POST /api/analyzer/pull-requests/:owner/:repo/:number
Content-Type: application/json
```

request:

```ts
{
  provider: "codex" | "claude";
  model?: string;
  forceRefresh?: boolean;
}
```

response:

```ts
type PullRequestAnalysisRunResponse = {
  ok: true;
  job: AnalysisJobSnapshot;
  reusedExistingJob: boolean;
};
```

규칙:

* 더 이상 이 endpoint가 long-lived progress stream을 직접 반환하지 않는다.
* 새 job 생성 또는 기존 active job 합류 결과만 즉시 반환한다.

### 3. Stream job progress

```http
GET /api/analyzer/jobs/:jobId/stream
```

transport 권장:

* `text/event-stream` 기반 SSE

이유:

* 브라우저 reconnect semantics가 단순하다.
* NDJSON fetch stream보다 "관찰 채널" 용도에 더 잘 맞는다.
* 현재 요구사항은 request body가 필요 없다.

event 예시:

```ts
type AnalysisJobStreamEvent =
  | { type: "snapshot"; job: AnalysisJobSnapshot }
  | { type: "progress"; jobId: string; sequence: number; message: string; status: "queued" | "running" }
  | { type: "completed"; job: AnalysisJobSnapshot; result: AnalyzePullRequestResult }
  | { type: "failed"; job: AnalysisJobSnapshot }
  | { type: "heartbeat"; at: string };
```

권장 동작:

* 연결 직후 `snapshot` 이벤트 1회 전송
* 이후 상태 변화만 push
* terminal state 전송 후 stream 종료 가능

### 4. Get job snapshot directly

```http
GET /api/analyzer/jobs/:jobId
```

목적:

* SSE 연결 전 초기 조회
* stream reconnect 실패 시 fallback polling

## Frontend Responsibilities

프론트엔드는 더 이상 "analysis 요청 promise가 resolve될 때까지 기다리는 컴포넌트"가 아니라 "job state를 구독하는 화면"으로 바뀐다.

필수 변경:

* `analyzePullRequest()` 는 stream-reading helper가 아니라 job creation helper로 바뀐다.
* active job이 있으면 `EventSource` 또는 동등한 SSE client로 stream에 붙는다.
* 페이지 이탈 시 stream subscription만 정리하고, job 자체는 건드리지 않는다.
* 다른 PR로 이동한 뒤 stale stream event가 현재 화면 state를 덮어쓰지 않도록 jobId 기반 가드가 필요하다.

권장 state shape:

```ts
type PullRequestAnalysisViewState = {
  analysis: AnalyzePullRequestResult | null;
  job: AnalysisJobSnapshot | null;
  isJobStreamConnected: boolean;
};
```

렌더링 원칙:

* `job.status === "queued" | "running"` 이면 loading UI 표시
* `analysis` 가 있으면 re-analysis 중에도 결과 유지
* `job.status === "failed"` 이고 `analysis` 가 없으면 error empty state
* `job.status === "failed"` 이고 `analysis` 가 있으면 warning 수준으로 표시

## Provider Progress Integration

provider adapter는 현재처럼 자유 문자열 progress를 올려도 된다.

단, job 기반으로 바꾸면서 아래 규칙을 둔다.

* 서버는 provider progress를 표준 job progress event로 감싼다.
* progress message는 "latest snapshot field"에도 저장한다.
* 너무 잦은 동일 메시지는 dedupe한다.

현재 Codex provider의 item-level progress 요약은 그대로 재사용 가능하다.

## Failure Handling

명시적으로 다뤄야 할 실패:

* repo mapping 없음
* provider unavailable
* PR metadata fetch 실패
* worktree 생성 실패
* provider 실행 실패
* cache write 실패
* stream subscriber 연결 실패

정책:

* job 생성 전에 검증 실패하면 job을 만들지 않고 즉시 HTTP error 반환
* job 생성 후 발생한 실패는 job status를 `failed` 로 남긴다
* 실패 메시지는 lookup API와 job API 양쪽에서 읽을 수 있어야 한다

## Cleanup and Retention

active job은 terminal state가 되면 active set에서 제거 가능하다. 다만 recent UX 복원을 위해 짧게 보관하는 편이 낫다.

권장 정책:

* active job은 항상 메모리에 유지
* terminal job은 최근 N개만 메모리에 유지
* 오래된 terminal job은 메모리에서 제거
* completed analysis cache retention은 기존 정책 유지

completed analysis result는 별도 cache에 저장되므로, terminal job을 메모리에서 제거해도 최종 분석 결과 조회에는 영향이 없다.

## Implementation Plan

1. analysis job types와 in-memory job store를 추가한다.
2. analyzer route를 "job create/join" 방식으로 변경한다.
3. background runner와 in-memory subscriber fan-out을 추가한다.
4. job snapshot API와 SSE stream API를 추가한다.
5. frontend analyzer client를 job 기반 API에 맞게 바꾼다.
6. PR page에서 active job 복원과 SSE 재구독을 추가한다.
7. 기존 direct POST streaming 구현을 제거한다.

## Open Questions

* recent failed job을 lookup response에 얼마나 오래 노출할지 정책이 필요하다.
* progress event replay를 어디까지 지원할지 결정이 필요하다.
* model이 dedupe key에 항상 포함되어야 하는지, provider default model 변경 시 UX가 기대와 맞는지 확인이 필요하다.

## Acceptance Criteria

* analysis 시작 후 브라우저를 닫아도 서버 작업은 계속 진행된다.
* 같은 PR 페이지에 다시 들어오면 active job 상태를 복원할 수 있다.
* active job이 있으면 프론트엔드는 progress stream에 다시 붙을 수 있다.
* analysis가 완료되면 기존처럼 cached result를 바로 볼 수 있다.
* 진행 중 re-analysis는 기존 cached result를 지우지 않는다.
* 같은 PR/provider/head/model에 대해 중복 job이 생기지 않는다.
* 같은 서버 프로세스가 살아 있는 동안에는 active job 상태를 복원할 수 있다.
* 서버 재시작 후에는 active job state가 사라져도, completed analysis cache 조회는 정상 동작한다.
