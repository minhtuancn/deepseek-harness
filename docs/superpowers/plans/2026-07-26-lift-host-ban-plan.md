# Lift 0.0.0.0 Binding Ban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable binding the DeepSeek Harness web server to all network interfaces (`0.0.0.0`) while warning the user about safety, and updating all E2E and unit tests to reflect the new behavior.

**Architecture:** Remove the strict rejection constraint in `web-startup` plugin flags validation, allowing `0.0.0.0` to be passed, and update associated test suites to expect success and verification on wildcard binding.

**Tech Stack:** TypeScript, Node.js, Commander, Vitest

## Global Constraints

- Keep edits minimal, focusing on the specific task.
- Follow existing patterns in the codebase.
- Maintain full test coverage and check that tests run correctly.

---

### Task 1: Update web-startup plugin validation to allow 0.0.0.0

**Files:**
- Modify: `packages/bundle/web-app/src/startup.ts:69-71`

**Interfaces:**
- Consumes: `options.host` from `webCommand()` options parser.
- Produces: `WEB_STARTUP_SERVICE` values containing `host: '0.0.0.0'` if specified.

- [ ] **Step 1: Modify `packages/bundle/web-app/src/startup.ts`**
  Remove the check:
  ```typescript
  if (options.host === '0.0.0.0') {
    program.error('error: --host 0.0.0.0 is intentionally not supported yet for safety: it would expose remote code execution to the network; use 127.0.0.1 instead')
  }
  ```
  Instead, allow it and let it pass through.

- [ ] **Step 2: Commit**
  ```bash
  git add packages/bundle/web-app/src/startup.ts
  git commit -m "feat(web-app): allow binding to 0.0.0.0 network interface"
  ```

---

### Task 2: Update unit test suite for web-startup

**Files:**
- Modify: `packages/bundle/web-app/tests/startup.spec.ts:132-138`

**Interfaces:**
- Consumes: `bootProvider(['--host', '0.0.0.0'])` function.
- Produces: Assertions verifying successful configuration of wildcard interface.

- [ ] **Step 1: Modify `packages/bundle/web-app/tests/startup.spec.ts`**
  Find the test:
  ```typescript
  it('rejects the intentionally unsupported all-interfaces host before the consumer activates', async () => {
    const { values, observed } = await bootProvider(['--host', '0.0.0.0'])
    expect(observed.out).toContain('--host 0.0.0.0 is intentionally not supported yet for safety: it would expose remote code execution to the network; use 127.0.0.1 instead')
    expect(values).toBeUndefined()
    expect(observed.readerConfig).toBeUndefined()
    expect(observed.exits).toEqual([1])
  })
  ```
  Change it to assert that `--host 0.0.0.0` resolves successfully:
  ```typescript
  it('accepts the all-interfaces host and configures it', async () => {
    const { values, observed } = await bootProvider(['--host', '0.0.0.0'])
    expect(values).toEqual({
      host: '0.0.0.0',
      trustedHosts: [],
    })
    expect(observed.readerConfig).toEqual({
      host: '0.0.0.0',
      port: 3080,
      trustedHosts: [],
    })
    expect(observed.exits).toEqual([])
  })
  ```

- [ ] **Step 2: Run the test suite**
  Run: `pnpm --filter @deepseek-ai/dsh-web-app test`
  Expected: PASS

- [ ] **Step 3: Commit**
  ```bash
  git add packages/bundle/web-app/tests/startup.spec.ts
  git commit -m "test(web-app): update startup unit test to expect success on 0.0.0.0"
  ```

---

### Task 3: Update CLI built-bin E2E test suite

**Files:**
- Modify: `apps/cli/tests/built-bin.e2e.ts:342-350`

**Interfaces:**
- Consumes: `runBuiltBin` execution helper (line 17).
- Produces: Updated E2E test validating that `--host 0.0.0.0` boots the server successfully.

**Context:** The `web` profile starts a long-running server that does not exit. `runBuiltBin` (which uses `execa` with a 25s timeout) expects the process to exit. Previously the `0.0.0.0` case errored and exited immediately. After the change, we must spawn the process, wait for the `dsh web: http://127.0.0.1:` URL line (which appears even when bound to `0.0.0.0`), then kill it with SIGTERM — mirroring the pattern in `apps/cli/tests/lazy-search-startup.compat.spec.ts`.

- [ ] **Step 1: Replace the wildcardHost block in `apps/cli/tests/built-bin.e2e.ts`**

  Find (lines 342-350):
  ```typescript
  const wildcardHost = await runBuiltBin(['web', '--host', '0.0.0.0'], {
    DSH_HOME: home,
    DSH_TELEMETRY_DISABLED: '1',
  })
  expect(wildcardHost.code).toBe(1)
  expect(wildcardHost.stdout).toBe('')
  expect(wildcardHost.stderr).toContain('--host 0.0.0.0 is intentionally not supported yet for safety: it would expose remote code execution to the network; use 127.0.0.1 instead')
  expect(wildcardHost.stderr).not.toContain('dsh web: http://')
  ```
  Replace with a spawn-based boot check:
  ```typescript
  // `--host 0.0.0.0` now boots the server on all interfaces. The URL line
  // always prints the loopback address (see web-app localWebUrl), so assert
  // the server settled and then dispose it like the real Web smoke does.
  const wildcardChild = spawn(process.execPath, [
    dshBin, 'web', '--host', '0.0.0.0', '--port', '0',
  ], {
    cwd: home,
    env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let wildcardOut = ''
  let wildcardSettled = false
  const wildcardTimer = setTimeout(() => {
    wildcardChild.kill('SIGKILL')
  }, 25_000)
  await new Promise<void>((resolve, reject) => {
    wildcardChild.stdout.setEncoding('utf8')
    wildcardChild.stdout.on('data', (chunk: string) => {
      wildcardOut += chunk
      if (!wildcardSettled && /dsh web: http:\/\/127\.0\.0\.1:\d+/u.test(wildcardOut)) {
        wildcardSettled = true
        wildcardChild.kill('SIGTERM')
        resolve()
      }
    })
    wildcardChild.on('error', reject)
    wildcardChild.on('close', () => { if (wildcardSettled) resolve(); else reject(new Error('wildcard host did not settle')) })
  })
  clearTimeout(wildcardTimer)
  expect(wildcardSettled).toBe(true)
  expect(wildcardOut).toMatch(/dsh web: http:\/\/127\.0\.0\.1:\d+/u)
  ```

  Note: `spawn` must be imported — add `import { spawn } from 'node:child_process'` to the file's existing `node:fs` imports at line 1 if not already present.

- [ ] **Step 2: Run the E2E test**
  Run: `pnpm --filter @deepseek-ai/dsh-cli test built-bin`
  Expected: PASS (the 0.0.0.0 web server boots and is disposed via SIGTERM)

- [ ] **Step 3: Commit**
  ```bash
  git add apps/cli/tests/built-bin.e2e.ts
  git commit -m "test(cli): e2e boots web on 0.0.0.0 instead of rejecting it"
  ```
