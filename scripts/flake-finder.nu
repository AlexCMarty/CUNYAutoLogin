#!/usr/bin/env nu

# Helper: print a timestamped line to both stdout and the run transcript.
export def tlog [log_file: string, msg: string] {
    let line = $"(date now | format date '%H:%M:%S') ($msg)"
    print $line
    $"($line)\n" | save --append $log_file
}

# Run one test suite N times, saving a failure log for each failed iteration.
# Returns {passes: int, failed: list<int>}
export def run-suite [
    suite: string,
    iterations: int,
    report_dir: string,
    log_file: string,
    program: string,
    args: list<string>
] {
    mut passes = 0
    mut failed_runs: list<int> = []

    for run in 1..$iterations {
        let result = (run-external $program ...$args | complete)

        if $result.exit_code == 0 {
            tlog $log_file $"PASS  ($suite)  run ($run)/($iterations)"
            $passes = $passes + 1
        } else {
            let padded = ($run | into string | fill -w 3 -c "0" -a right)
            let failure_log = $"($report_dir)/($suite)/run-($padded).log"
            $"($result.stdout)\n---stderr---\n($result.stderr)" | save $failure_log
            tlog $log_file $"FAIL  ($suite)  run ($run)/($iterations)  \(exit ($result.exit_code)\)  → ($failure_log)"
            $failed_runs = ($failed_runs | append $run)
        }
    }

    {passes: $passes, failed: $failed_runs}
}

# Find flaky tests by running the unit and E2E suites many times.
# Results land in flake-reports/<timestamp>/ at the repo root.
#
# Examples:
#   nu scripts/flake-finder.nu 5 20     # 5 E2E runs, 20 unit runs
def main [
    e2e_runs: int,   # Number of E2E suite iterations
    unit_runs: int   # Number of unit suite iterations
] {
    let root = (^git rev-parse --show-toplevel | str trim)
    let ts = (date now | format date "%Y%m%d-%H%M%S")
    let report_dir = $"($root)/flake-reports/($ts)"
    let log_file = $"($report_dir)/transcript.log"
    let summary_file = $"($report_dir)/summary.txt"

    mkdir $"($report_dir)/unit"
    mkdir $"($report_dir)/e2e"
    "" | save $log_file

    let started_at = (date now | format date "%Y-%m-%dT%H:%M:%S%z")
    tlog $log_file $"flake-finder starting — unit=($unit_runs)  e2e=($e2e_runs)"
    tlog $log_file $"report → ($report_dir)"

    # --- Unit suite ---
    tlog $log_file $"=== unit × ($unit_runs) \(npm run test:unit\) ==="
    let unit_result = (run-suite "unit" $unit_runs $report_dir $log_file "npm" ["run" "test:unit"])

    # --- E2E build (once, streams to terminal) ---
    tlog $log_file "=== e2e build (once) ==="
    let build_ok = (try { ^npm run build:e2e; true } catch { false })

    # --- E2E suite ---
    mut e2e_result = {passes: 0, failed: []}
    if $build_ok {
        tlog $log_file $"=== e2e × ($e2e_runs) \(npx playwright test\) ==="
        $e2e_result = (run-suite "e2e" $e2e_runs $report_dir $log_file "npx" ["playwright" "test"])
    } else {
        tlog $log_file "FATAL: build:e2e failed — skipping e2e iterations"
    }

    # --- Summary ---
    let ended_at = (date now | format date "%Y-%m-%dT%H:%M:%S%z")
    let unit_fail_count = ($unit_result.failed | length)
    let e2e_fail_count = ($e2e_result.failed | length)
    let total_failures = ($unit_fail_count + $e2e_fail_count)

    mut summary_lines = [
        "CUNYAutoLogin flake finder"
        "=========================="
        $"Started:    ($started_at)"
        $"Finished:   ($ended_at)"
        $"Unit runs:  ($unit_runs)"
        $"E2E runs:   ($e2e_runs)"
        $"Report:     ($report_dir)"
        ""
        "Unit (vitest run)"
        $"  passed:  ($unit_result.passes) / ($unit_runs)"
        $"  failed:  ($unit_fail_count) / ($unit_runs)"
    ]
    if $unit_fail_count > 0 {
        let runs_str = ($unit_result.failed | into string | str join ", ")
        $summary_lines = ($summary_lines | append $"  failed runs: ($runs_str)")
    }

    $summary_lines = ($summary_lines | append [
        ""
        "E2E (playwright test)"
        $"  passed:  ($e2e_result.passes) / ($e2e_runs)"
        $"  failed:  ($e2e_fail_count) / ($e2e_runs)"
    ])
    if $e2e_fail_count > 0 {
        let runs_str = ($e2e_result.failed | into string | str join ", ")
        $summary_lines = ($summary_lines | append $"  failed runs: ($runs_str)")
    }

    let result_line = if $total_failures == 0 {
        $"Result: ALL CLEAR — no failures in ($unit_runs) unit / ($e2e_runs) e2e runs."
    } else {
        $"Result: FLAKES OR FAILURES DETECTED — ($total_failures) total failed iterations."
    }

    $summary_lines = ($summary_lines | append ["" $result_line ""])

    let summary = ($summary_lines | str join "\n")
    print $summary
    $summary | save $summary_file
    tlog $log_file $"Summary written to ($summary_file)"

    if $total_failures > 0 {
        exit 1
    }
}
