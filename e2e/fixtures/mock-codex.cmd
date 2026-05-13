@echo off
REM Mock 'codex' executable for Pixel Agents e2e tests (Windows).
REM
REM Behaviour:
REM   1. Parses --cd <cwd> from args, falling back to %CD%.
REM   2. Appends an invocation record to %HOME%\.codex-mock\invocations.log.
REM   3. Creates %HOME%\.codex\state_5.sqlite with a threads row for that cwd.
REM   4. Creates %HOME%\.codex\sessions\...\rollout-*.jsonl.
REM   5. Stays alive for up to 30 s (tests can kill it once assertions pass).

setlocal enabledelayedexpansion

set "TARGET_CWD="
set "PREV="

:parse_args
if "%~1"=="" goto done_args
if "!PREV!"=="--cd" set "TARGET_CWD=%~1"
set "PREV=%~1"
shift
goto parse_args
:done_args

if "%TARGET_CWD%"=="" set "TARGET_CWD=%CD%"

REM Use HOME if set (our e2e sets it), fall back to USERPROFILE.
if defined HOME (
  set "MOCK_HOME=%HOME%"
) else (
  set "MOCK_HOME=%USERPROFILE%"
)

if defined CODEX_HOME (
  set "MOCK_CODEX_HOME=%CODEX_HOME%"
) else (
  set "MOCK_CODEX_HOME=%MOCK_HOME%\.codex"
)

set "LOG_DIR=%MOCK_HOME%\.codex-mock"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
echo %DATE% %TIME% cwd=%TARGET_CWD% args=%* >> "%LOG_DIR%\invocations.log"

for /f %%T in ('powershell -NoProfile -Command "[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()"') do set "NOW_MS=%%T"
set "THREAD_ID=thread-%NOW_MS%-%RANDOM%"
set "CHILD_THREAD_ID=%THREAD_ID%-child"
for /f %%D in ('powershell -NoProfile -Command "Get-Date -Format yyyy\\MM\\dd"') do set "SESSION_DATE=%%D"
set "SESSION_DIR=%MOCK_CODEX_HOME%\sessions\%SESSION_DATE%"
set "ROLLOUT_PATH=%SESSION_DIR%\rollout-%THREAD_ID%.jsonl"
set "CHILD_ROLLOUT_PATH=%SESSION_DIR%\rollout-%CHILD_THREAD_ID%.jsonl"
set "DB_PATH=%MOCK_CODEX_HOME%\state_5.sqlite"

if not exist "%SESSION_DIR%" mkdir "%SESSION_DIR%"
>"%ROLLOUT_PATH%" echo {"type":"session_meta","payload":{"id":"%THREAD_ID%","cwd":"%TARGET_CWD:\=\\%"}}
>>"%ROLLOUT_PATH%" echo {"type":"event_msg","payload":{"message":"mock-codex-ready"}}
>"%CHILD_ROLLOUT_PATH%" echo {"type":"session_meta","payload":{"id":"%CHILD_THREAD_ID%","cwd":"%TARGET_CWD:\=\\%"}}
>>"%CHILD_ROLLOUT_PATH%" echo {"type":"event_msg","payload":{"type":"task_started"}}
>>"%CHILD_ROLLOUT_PATH%" echo {"type":"response_item","payload":{"type":"function_call","call_id":"call-child-shell","name":"exec_command","arguments":"{\"cmd\":\"echo child\"}"}}
>>"%CHILD_ROLLOUT_PATH%" echo {"type":"response_item","payload":{"type":"function_call_output","call_id":"call-child-shell","output":"child"}}
>>"%CHILD_ROLLOUT_PATH%" echo {"type":"event_msg","payload":{"type":"task_complete"}}

powershell -NoProfile -Command ^
  "$db = $env:DB_PATH; $id = $env:THREAD_ID; $rollout = $env:ROLLOUT_PATH; $childId = $env:CHILD_THREAD_ID; $childRollout = $env:CHILD_ROLLOUT_PATH; $cwd = $env:TARGET_CWD; $now = $env:NOW_MS; " ^
  "$q = { param($v) '''' + ($v -replace '''', '''''') + '''' }; " ^
  "$sql = @('create table if not exists threads (id text primary key, rollout_path text not null, cwd text not null, created_at_ms integer, updated_at_ms integer, archived integer default 0, agent_nickname text, agent_role text);', " ^
  "'insert or replace into threads (id, rollout_path, cwd, created_at_ms, updated_at_ms, archived, agent_nickname, agent_role) values (' + (& $q $id) + ', ' + (& $q $rollout) + ', ' + (& $q $cwd) + ', ' + $now + ', ' + $now + ', 0, '''', '''');', " ^
  "'insert or replace into threads (id, rollout_path, cwd, created_at_ms, updated_at_ms, archived, agent_nickname, agent_role) values (' + (& $q $childId) + ', ' + (& $q $childRollout) + ', ' + (& $q $cwd) + ', ' + $now + ', ' + $now + ', 0, ''Curie'', ''worker'');') -join \"`n\"; " ^
  "$sql | sqlite3 $db"

>>"%ROLLOUT_PATH%" echo {"type":"event_msg","payload":{"type":"collab_agent_spawn_end","call_id":"call-spawn-child","sender_thread_id":"%THREAD_ID%","new_thread_id":"%CHILD_THREAD_ID%","new_agent_nickname":"Curie","new_agent_role":"worker","status":"pending_init"}}

REM Stay alive so the VS Code terminal doesn't immediately close.
REM Use ping to localhost as a cross-platform sleep (timeout command requires console).
ping -n 31 127.0.0.1 > nul 2>&1
