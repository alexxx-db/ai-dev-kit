"""Regression tests for scripts/lib/deploy_status.sh.

These drive the real shell functions with a stubbed `databricks` on PATH.
Shell semantics bugs in this logic survive both `bash -n` and a happy-path
deploy, so they need behavioural coverage rather than a syntax check.
"""

import json
import os
import stat
import subprocess
from pathlib import Path

import pytest

LIB = Path(__file__).resolve().parents[1] / 'scripts' / 'lib' / 'deploy_status.sh'

SUBMITTED_ID = 'depl-1111'
OTHER_ID = 'depl-9999'


def _write_databricks_stub(bin_dir: Path, apps_get_payload: str, exit_code: int = 0) -> None:
    """Install a fake `databricks` that answers `apps get` with a fixed payload."""
    stub = bin_dir / 'databricks'
    stub.write_text(
        '#!/bin/bash\n'
        'if [ "$1" = "apps" ] && [ "$2" = "get" ]; then\n'
        f'  cat <<\'PAYLOAD\'\n{apps_get_payload}\nPAYLOAD\n'
        f'  exit {exit_code}\n'
        'fi\n'
        'exit 0\n'
    )
    stub.chmod(stub.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)


def _run(snippet: str, bin_dir: Path) -> str:
    env = dict(os.environ)
    env['PATH'] = f'{bin_dir}{os.pathsep}{env["PATH"]}'
    result = subprocess.run(
        ['bash', '-c', f'set -e\n. "{LIB}"\n{snippet}'],
        capture_output=True,
        text=True,
        env=env,
    )
    assert result.returncode == 0, f'stderr={result.stderr}'
    return result.stdout.strip()


@pytest.fixture()
def bin_dir(tmp_path: Path) -> Path:
    d = tmp_path / 'bin'
    d.mkdir()
    return d


def _active_payload(deployment_id: str, state: str) -> str:
    return json.dumps(
        {'active_deployment': {'deployment_id': deployment_id, 'status': {'state': state}}}
    )


def test_matching_deployment_id_is_accepted(bin_dir: Path) -> None:
    """Inline IN_PROGRESS + matching id SUCCEEDED must resolve to SUCCEEDED.

    Guards the env-scoping bug where the submitted id was passed as a
    `VAR=value cmd` prefix on the left of a pipe, so python3 never saw it and
    the OK branch was unreachable. A genuinely successful deploy was then
    reported as a failure on exactly the slow path the fallback exists for.
    """
    _write_databricks_stub(bin_dir, _active_payload(SUBMITTED_ID, 'SUCCEEDED'))

    out = _run(f'verify_deploy_state my-app {SUBMITTED_ID}', bin_dir)

    assert out == 'OK\tSUCCEEDED'


def test_matching_id_resolves_to_exit_zero_path(bin_dir: Path) -> None:
    """End-to-end: the resolved state drives deploy.sh's success branch."""
    _write_databricks_stub(bin_dir, _active_payload(SUBMITTED_ID, 'SUCCEEDED'))

    snippet = f"""
    DEPLOY_STATE=$(parse_deploy_response '{{"deployment_id": "{SUBMITTED_ID}", "status": {{"state": "IN_PROGRESS"}}}}' | awk -F'\\t' '{{print $2}}')
    DEPLOY_ID=$(parse_deploy_response '{{"deployment_id": "{SUBMITTED_ID}", "status": {{"state": "IN_PROGRESS"}}}}' | awk -F'\\t' '{{print $3}}')
    VERIFY_OUT=$(verify_deploy_state my-app "$DEPLOY_ID") || true
    case "$VERIFY_OUT" in
      OK$'\\t'*) DEPLOY_STATE="${{VERIFY_OUT#OK\t}}" ;;
    esac
    if [ "$DEPLOY_STATE" = "SUCCEEDED" ]; then echo EXIT_ZERO; else echo EXIT_ONE; fi
    """
    assert _run(snippet, bin_dir) == 'EXIT_ZERO'


def test_matching_id_with_empty_state_is_no_state(bin_dir: Path) -> None:
    """Id match with a null/empty status must not claim MISMATCH (misleading)."""
    _write_databricks_stub(
        bin_dir,
        json.dumps({'active_deployment': {'deployment_id': SUBMITTED_ID, 'status': {}}}),
    )

    out = _run(f'verify_deploy_state my-app {SUBMITTED_ID}', bin_dir)

    assert out == f'NO_STATE\t{SUBMITTED_ID}'


def test_non_matching_deployment_id_is_rejected(bin_dir: Path) -> None:
    """A previous deployment's SUCCEEDED must never be borrowed."""
    _write_databricks_stub(bin_dir, _active_payload(OTHER_ID, 'SUCCEEDED'))

    out = _run(f'verify_deploy_state my-app {SUBMITTED_ID}', bin_dir)

    assert out.startswith('MISMATCH\t')
    assert OTHER_ID in out


def test_unparseable_apps_get_surfaces_parse_error(bin_dir: Path) -> None:
    """A text/error response must surface, not emit a raw traceback."""
    _write_databricks_stub(bin_dir, 'Error: something went wrong')

    out = _run(f'verify_deploy_state my-app {SUBMITTED_ID}', bin_dir)

    assert out.startswith('PARSE_ERROR\t')
    assert 'Traceback' not in out


def test_parse_deploy_response_extracts_state_and_id(bin_dir: Path) -> None:
    payload = json.dumps({'deployment_id': SUBMITTED_ID, 'status': {'state': 'SUCCEEDED'}})

    out = _run(f"parse_deploy_response '{payload}'", bin_dir)

    assert out == f'OK\tSUCCEEDED\t{SUBMITTED_ID}'


def test_parse_deploy_response_reports_bad_json(bin_dir: Path) -> None:
    out = _run("parse_deploy_response 'not json at all'", bin_dir)

    assert out.startswith('PARSE_ERROR\t')
