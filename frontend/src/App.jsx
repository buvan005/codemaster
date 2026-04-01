import { useEffect, useState, useCallback } from "react"
import Editor from "@monaco-editor/react"
import ProblemList from "./ProblemList"
import "./SplitLayout.css"

/* ── Full problem catalogue ─────────────────────────────── */
const PROBLEMS = [
  {
    id: 1,
    title: "Add Two Numbers",
    description:
      "Given two integers (one per line), print their sum.",
    difficulty: "Easy",
    tags: ["Math", "Basics"],
    starter_code: `# Read two integers from input and print their sum
a = int(input())
b = int(input())

# TODO: compute and print the result
`,
    solution: `a = int(input())
b = int(input())
print(a + b)`,
    test_cases: [
      { input: "2\n3", expected: "5" },
      { input: "10\n20", expected: "30" },
      { input: "1\n1", expected: "2" },
    ],
  },
  {
    id: 2,
    title: "Reverse a String",
    description:
      "Given a string, print the reversed version of it.",
    difficulty: "Easy",
    tags: ["Strings"],
    starter_code: `# Read a string and print it reversed
s = input()

# TODO: reverse the string and print the result
`,
    solution: `s = input()
print(s[::-1])`,
    test_cases: [
      { input: "hello", expected: "olleh" },
      { input: "world", expected: "dlrow" },
      { input: "abc", expected: "cba" },
    ],
  },
  {
    id: 3,
    title: "Fibonacci Number",
    description:
      "Given a non-negative integer n, print the n-th Fibonacci number (0-indexed). F(0)=0, F(1)=1, F(n)=F(n-1)+F(n-2).",
    difficulty: "Medium",
    tags: ["Math", "Dynamic Programming"],
    starter_code: `# Read n and print the n-th Fibonacci number (0-indexed)
n = int(input())

# TODO: implement Fibonacci logic and print the result
`,
    solution: `n = int(input())
a, b = 0, 1
for _ in range(n):
    a, b = b, a + b
print(a)`,
    test_cases: [
      { input: "0", expected: "0" },
      { input: "6", expected: "8" },
      { input: "10", expected: "55" },
    ],
  },
  {
    id: 4,
    title: "Palindrome Check",
    description:
      "Given a string, print 'True' if it reads the same forwards and backwards (case-sensitive), otherwise print 'False'.",
    difficulty: "Easy",
    tags: ["Strings"],
    starter_code: `# Read a string and check if it is a palindrome
s = input()

# TODO: print True if palindrome, False otherwise
`,
    solution: `s = input()
print(s == s[::-1])`,
    test_cases: [
      { input: "racecar", expected: "True" },
      { input: "hello", expected: "False" },
      { input: "madam", expected: "True" },
    ],
  },
  {
    id: 5,
    title: "Maximum Subarray Sum",
    description:
      "Given an array of integers (space-separated on one line), find the contiguous subarray with the largest sum and print that sum.",
    difficulty: "Hard",
    tags: ["Arrays", "Dynamic Programming"],
    starter_code: `# Read space-separated integers and find the maximum subarray sum
nums = list(map(int, input().split()))

# TODO: implement Kadane's algorithm or similar and print the result
`,
    solution: `nums = list(map(int, input().split()))
max_sum = cur = nums[0]
for x in nums[1:]:
    cur = max(x, cur + x)
    max_sum = max(max_sum, cur)
print(max_sum)`,
    test_cases: [
      { input: "-2 1 -3 4 -1 2 1 -5 4", expected: "6" },
      { input: "1", expected: "1" },
      { input: "5 4 -1 7 8", expected: "23" },
    ],
  },
]

const PYODIDE_INDEX_URL =
  "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/"

const PYODIDE_MJS_URL = `${PYODIDE_INDEX_URL}pyodide.mjs`

/**
 * Load Pyodide via the CDN ESM build (pyodide.mjs).
 * The classic pyodide.js UMD bundle can leave `globalThis.loadPyodide` as a
 * non-function placeholder in some environments (e.g. Vite + ESM), so we use
 * dynamic import instead of injecting a <script> tag.
 */
async function importLoadPyodide() {
  const mod = await import(/* @vite-ignore */ PYODIDE_MJS_URL)
  if (typeof mod.loadPyodide !== "function") {
    throw new Error("Pyodide module did not export loadPyodide")
  }
  return mod.loadPyodide
}

/**
 * One Python snippet per run: fresh StringIO, redirect stdout, exec user code,
 * restore stdout, return captured text as the last expression (Pyodide return value).
 */
function buildStdoutCaptureRunner(userCode, inputData) {
  const codeLiteral = JSON.stringify(userCode)
  const inputLiteral = JSON.stringify(inputData ?? "")
  return `
import sys
import io

_output_buffer = io.StringIO()
_old_stdout = sys.stdout
sys.stdout = _output_buffer

try:
    import builtins
    _old_input = builtins.input
    _input_lines = ${inputLiteral}.splitlines()
    _input_index = 0

    def _cm_input(prompt=""):
        global _input_index
        if _input_index < len(_input_lines):
            val = _input_lines[_input_index]
            _input_index += 1
            return val
        raise Exception("Input exhausted: not enough input provided")

    builtins.input = _cm_input

    exec(${codeLiteral}, {})
except Exception:
    import traceback
    _msg = traceback.format_exc()
    if "Input exhausted: not enough input provided" in _msg:
        _output_buffer.write("Error: Not enough input provided\\n")
    else:
        _output_buffer.write(_msg)
finally:
    sys.stdout = _old_stdout
    try:
        builtins.input = _old_input
    except Exception:
        pass

_output_buffer.getvalue()
`
}

async function runSingleTest(pyodide, code, input) {
  const runner = buildStdoutCaptureRunner(code, input)
  const result =
    typeof pyodide.runPythonAsync === "function"
      ? await pyodide.runPythonAsync(runner)
      : pyodide.runPython(runner)
  return String(result ?? "")
}

export default function App() {
  const [selectedProblem, setSelectedProblem] = useState(PROBLEMS[0])
  const [code, setCode] = useState(PROBLEMS[0].starter_code)
  const [pyodide, setPyodide] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [results, setResults] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [submissions, setSubmissions] = useState([])
  const [rightTab, setRightTab] = useState("output") // "output" | "tests" | "submissions"

  /* Reset editor & results when the user picks a different problem */
  useEffect(() => {
    if (selectedProblem) {
      setCode(selectedProblem.starter_code)
      setResults([])
    }
  }, [selectedProblem])

  useEffect(() => {
    console.log("submissions:", submissions)
  }, [submissions])

  useEffect(() => {
    let cancelled = false

    async function initPyodide() {
      try {
        setIsLoading(true)

        const loadPyodide = await importLoadPyodide()
        if (cancelled) return

        console.log("Checking loadPyodide:", loadPyodide)

        const pyodideInstance = await loadPyodide({
          indexURL: PYODIDE_INDEX_URL,
        })
        if (cancelled) return

        setPyodide(pyodideInstance)
      } catch (error) {
        console.error("Pyodide init failed:", error)
        if (!cancelled) {
          setResults([
            {
              input: "",
              expected: "",
              output: "Failed to load Python runtime",
              status: "FAIL",
            },
          ])
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    initPyodide()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRunCode() {
    if (!pyodide) {
      setResults([
        {
          input: "",
          expected: "",
          output: "Python runtime not ready",
          status: "FAIL",
        },
      ])
      return
    }

    try {
      setIsRunning(true)
      const nextResults = []

      for (const tc of selectedProblem.test_cases) {
        try {
          const raw = await runSingleTest(pyodide, code, tc.input)
          const output = String(raw ?? "").trimEnd()
          const status =
            output.trim() === String(tc.expected ?? "").trim() ? "PASS" : "FAIL"

          nextResults.push({
            input: tc.input,
            expected: tc.expected,
            output,
            status,
          })
        } catch (e) {
          nextResults.push({
            input: tc.input,
            expected: tc.expected,
            output: String(e?.message ?? e),
            status: "FAIL",
          })
        }
      }

      setResults(nextResults)
      setRightTab("tests") // auto-switch to results

      try {
        console.log("Sending submission:", nextResults)
        const res = await fetch("http://localhost:5000/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            language: "python",
            results: nextResults,
            timestamp: Date.now(),
          }),
        })
        const data = await res.json().catch(() => null)
        console.log("Submission response:", data ?? { ok: res.ok, status: res.status })
        if (!res.ok) {
          throw new Error(`Submission failed: ${res.status}`)
        }
      } catch (e) {
        console.error("Submit failed:", e)
      }
    } catch (err) {
      setResults([
        {
          input: "",
          expected: "",
          output: String(err?.message ?? err),
          status: "FAIL",
        },
      ])
      setRightTab("tests")
    } finally {
      setIsRunning(false)
    }
  }

  const fetchSubmissions = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/submissions")
      const data = await res.json()

      console.log("Submissions fetched:", data)

      setSubmissions(data) // IMPORTANT: do not override with []
    } catch (err) {
      console.error("Fetch failed:", err)
    }
  }

  /* ── Derived values for the right panel ─────────────── */
  const passCount = results.filter((r) => r.status === "PASS").length
  const failCount = results.length - passCount
  const latestOutput = results.length > 0
    ? results.map((r) => r.output).join("\n")
    : ""
  const hasError = results.some(
    (r) => r.status === "FAIL" && r.output && r.output.includes("Traceback")
  )

  /* ── Keyboard shortcut: Ctrl+Enter → Run Code ────────── */
  const handleKeyDown = useCallback(
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault()
        if (!isLoading && !isRunning && pyodide) {
          handleRunCode()
        }
      }
    },
    [isLoading, isRunning, pyodide, handleRunCode]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const difficultyClass =
    selectedProblem.difficulty === "Easy"
      ? "badge-easy"
      : selectedProblem.difficulty === "Medium"
      ? "badge-medium"
      : "badge-hard"

  const allPassed = results.length > 0 && results.every((r) => r.status === "PASS")
  const anyFailed = results.length > 0 && results.some((r) => r.status === "FAIL")

  return (
    <div className="app-shell">
      {/* ── Problem sidebar ─────────────────────────────── */}
      <ProblemList
        problems={PROBLEMS}
        selectedId={selectedProblem?.id}
        onSelect={setSelectedProblem}
      />

      {/* ── Workspace ───────────────────────────────────── */}
      <div className="workspace">
        {/* Top bar */}
        <div className="workspace-topbar">
          <div className="workspace-brand">CodeMasters Pro</div>
          <div className="workspace-status">
            <span
              className={`status-dot ${isLoading ? "loading" : "ready"}`}
            />
            {isLoading ? "Loading Python…" : "Python Ready"}
          </div>
        </div>

        {/* Split panels */}
        <div className="split-panels">
          {/* ═══ LEFT PANEL ═══ */}
          <div className="panel-left">
            {/* Problem info */}
            <div className="problem-info">
              <div className="problem-info-header">
                <span className="problem-info-title">
                  {selectedProblem.title}
                </span>
                <span className={`badge ${difficultyClass}`}>
                  {selectedProblem.difficulty}
                </span>
              </div>
              <p className="problem-info-desc">
                {selectedProblem.description}
              </p>
              {selectedProblem.tags && selectedProblem.tags.length > 0 && (
                <div className="problem-tags-row">
                  {selectedProblem.tags.map((t) => (
                    <span key={t} className="problem-tag-sm">{t}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Editor */}
            <div className="editor-area">
              <Editor
                height="100%"
                language="python"
                theme="vs-dark"
                value={code}
                onChange={(value) => setCode(value ?? "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  padding: { top: 12 },
                  scrollBeyondLastLine: false,
                }}
              />
            </div>

            {/* Action bar */}
            <div className="action-bar">
              <button
                type="button"
                className={`btn btn-run${isRunning ? " is-running" : ""}`}
                onClick={handleRunCode}
                disabled={isLoading || isRunning || !pyodide}
              >
                {isRunning ? (
                  <>
                    <span className="spinner" />
                    Running…
                  </>
                ) : (
                  "▶ Run Code"
                )}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={fetchSubmissions}
              >
                📋 Submissions
              </button>
              <span className="action-bar-hint">
                Ctrl + Enter
              </span>
            </div>
          </div>

          {/* ═══ RIGHT PANEL ═══ */}
          <div className="panel-right">
            {/* Tabs */}
            <div className="panel-tabs">
              <button
                type="button"
                className={`panel-tab${rightTab === "output" ? " active" : ""}`}
                onClick={() => setRightTab("output")}
              >
                Output
              </button>
              <button
                type="button"
                className={`panel-tab${rightTab === "tests" ? " active" : ""}`}
                onClick={() => setRightTab("tests")}
              >
                Test Results
                {results.length > 0 && (
                  <span className="tab-badge">{results.length}</span>
                )}
              </button>
              <button
                type="button"
                className={`panel-tab${rightTab === "submissions" ? " active" : ""}`}
                onClick={() => setRightTab("submissions")}
              >
                Submissions
                {submissions.length > 0 && (
                  <span className="tab-badge">{submissions.length}</span>
                )}
              </button>
            </div>

            {/* Tab body */}
            <div className="panel-body">
              {/* ─── Output tab ────────────────────────── */}
              {rightTab === "output" && (
                <>
                  {results.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">▶</div>
                      <div className="empty-state-text">
                        Run your code to see output
                      </div>
                      <div className="empty-state-hint">
                        Press Ctrl + Enter or click Run Code
                      </div>
                    </div>
                  ) : (
                    <div className="fade-in">
                      <div
                        className={`output-block${hasError ? " has-error" : ""}`}
                      >
                        {latestOutput || (
                          <span className="output-empty">No output</span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ─── Test Results tab ──────────────────── */}
              {rightTab === "tests" && (
                <>
                  {results.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">🧪</div>
                      <div className="empty-state-text">
                        No test results yet
                      </div>
                      <div className="empty-state-hint">
                        Run your code to see test results
                      </div>
                    </div>
                  ) : (
                    <div className="fade-in">
                      {/* Verdict banner */}
                      {allPassed && (
                        <div className="verdict-banner accepted slide-down">
                          <span className="verdict-icon">✓</span>
                          All test cases passed
                        </div>
                      )}
                      {anyFailed && (
                        <div className="verdict-banner rejected slide-down">
                          <span className="verdict-icon">✗</span>
                          {failCount} of {results.length} test{results.length > 1 ? "s" : ""} failed
                        </div>
                      )}

                      {/* Summary bar */}
                      <div className="result-summary">
                        <span className="summary-stat pass">
                          ✓ {passCount} passed
                        </span>
                        {failCount > 0 && (
                          <span className="summary-stat fail">
                            ✗ {failCount} failed
                          </span>
                        )}
                      </div>

                      {/* Individual test cards */}
                      {results.map((r, idx) => {
                        const ok = r.status === "PASS"
                        return (
                          <div
                            key={idx}
                            className={`test-card ${ok ? "pass" : "fail"} slide-up`}
                            style={{ animationDelay: `${idx * 60}ms` }}
                          >
                            <div className="test-card-header">
                              <span className="test-card-label">
                                Test {idx + 1}
                              </span>
                              <span
                                className={`test-card-status ${ok ? "pass" : "fail"}`}
                              >
                                {r.status}
                              </span>
                            </div>
                            <div className="test-card-body">
                              <div>
                                <div className="test-field-label">Input</div>
                                <pre className="test-field-value">
                                  {r.input}
                                </pre>
                              </div>
                              <div>
                                <div className="test-field-label">Expected</div>
                                <pre className="test-field-value">
                                  {r.expected}
                                </pre>
                              </div>
                              <div>
                                <div className="test-field-label">Actual</div>
                                <pre className="test-field-value">
                                  {r.output || "No output"}
                                </pre>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ─── Submissions tab ───────────────────── */}
              {rightTab === "submissions" && (
                <>
                  {submissions.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">📋</div>
                      <div className="empty-state-text">
                        No submissions yet
                      </div>
                      <div className="empty-state-hint">
                        Run your code to see results here
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={fetchSubmissions}
                        style={{ marginTop: 12 }}
                      >
                        Load Submissions
                      </button>
                    </div>
                  ) : (
                    <div className="fade-in">
                      {submissions.map((sub, index) => {
                        const accepted = sub.results.every(
                          (r) => r.status === "PASS"
                        )
                        return (
                          <div key={index} className="submission-card slide-up" style={{ animationDelay: `${index * 60}ms` }}>
                            <div className="submission-card-header">
                              <span className="submission-number">
                                Submission {index + 1}
                              </span>
                              <span
                                className={`submission-status ${
                                  accepted ? "accepted" : "failed"
                                }`}
                              >
                                {accepted ? "Accepted" : "Failed"}
                              </span>
                            </div>
                            <div className="submission-meta">
                              <span>🐍 {sub.language}</span>
                              <span>
                                🕐 {new Date(sub.timestamp).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
