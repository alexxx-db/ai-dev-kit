"""Behavioural tests for scripts/install_builder_skills.sh helpers.

The installer is sourced (its main block is guarded) so the inventory parsing
and fallback decisions can be exercised without touching the network.
"""

import json
import os
import stat
import subprocess
from pathlib import Path

import pytest

INSTALLER = Path(__file__).resolve().parents[1] / 'scripts' / 'install_builder_skills.sh'


def _run(snippet: str, bin_dir: Path, env_extra: dict | None = None) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env['PATH'] = f'{bin_dir}{os.pathsep}{env["PATH"]}'
    env.update(env_extra or {})
    return subprocess.run(
        ['bash', '-c', f'. "{INSTALLER}"\n{snippet}'],
        capture_output=True,
        text=True,
        env=env,
    )


def _write_aitools_stub(bin_dir: Path, payload: str, exit_code: int = 0) -> None:
    stub = bin_dir / 'databricks'
    stub.write_text(
        '#!/bin/bash\n'
        'if [ "$1" = "aitools" ] && [ "$2" = "list" ]; then\n'
        f'  cat <<\'PAYLOAD\'\n{payload}\nPAYLOAD\n'
        f'  exit {exit_code}\n'
        'fi\n'
        'if [ "$1" = "--version" ]; then echo "Databricks CLI v1.9.0"; exit 0; fi\n'
        'exit 0\n'
    )
    stub.chmod(stub.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)


@pytest.fixture()
def bin_dir(tmp_path: Path) -> Path:
    d = tmp_path / 'bin'
    d.mkdir()
    return d


def test_inventory_parsed_from_json_not_field_position(bin_dir: Path) -> None:
    """Inventory is read as JSON, so key order/formatting cannot break it."""
    payload = json.dumps(
        [
            {'experimental': False, 'name': 'databricks-core'},
            {'name': 'databricks-genie', 'experimental': True},
        ],
        indent=4,
    )
    _write_aitools_stub(bin_dir, payload)

    result = _run('fetch_agent_b_inventory; echo "STABLE=$AGENT_B_STABLE"; echo "EXP=$AGENT_B_EXPERIMENTAL"', bin_dir)

    assert result.returncode == 0, result.stderr
    assert 'STABLE=databricks-core' in result.stdout
    assert 'EXP=databricks-genie' in result.stdout


def test_unparseable_inventory_is_fatal(bin_dir: Path) -> None:
    """A CLI format change must not silently ship the stale snapshot."""
    _write_aitools_stub(bin_dir, 'name: databricks-core (not json)')

    result = _run('fetch_agent_b_inventory; echo "STABLE=$AGENT_B_STABLE"', bin_dir)

    assert result.returncode != 0
    assert 'Could not parse' in result.stderr
    assert 'STABLE=' not in result.stdout


def test_unparseable_inventory_snapshot_override(bin_dir: Path) -> None:
    """The escape hatch names the snapshot vintage it is installing."""
    _write_aitools_stub(bin_dir, 'not json')

    result = _run(
        'fetch_agent_b_inventory; echo "STABLE=$AGENT_B_STABLE"',
        bin_dir,
        {'ALLOW_STALE_AGENT_SKILLS': '1'},
    )

    assert result.returncode == 0, result.stderr
    assert 'databricks-core' in result.stdout
    assert '0.2.3' in result.stderr


def test_missing_cli_falls_back_to_stamped_snapshot(bin_dir: Path) -> None:
    """No CLI at all is a legitimate offline path, but must be loudly stamped."""
    # System dirs keep bash/awk available while excluding the homebrew databricks.
    result = _run(
        'fetch_agent_b_inventory; echo "STABLE=$AGENT_B_STABLE"',
        bin_dir,
        {'PATH': f'{bin_dir}:/usr/bin:/bin'},
    )

    assert result.returncode == 0, result.stderr
    assert 'databricks-core' in result.stdout
    assert 'snapshot v0.2.3' in result.stderr


def test_mlflow_ref_is_pinned_not_a_mutable_branch() -> None:
    """Two deploys of one builder-app commit must fetch identical skill content."""
    source = INSTALLER.read_text()

    assert 'MLFLOW_REF="${MLFLOW_REF:-main}"' not in source
    assert 'MLFLOW_REF="${MLFLOW_REF:-c8228eef0da8d18ac34aa632e1276ce7da985363}"' in source
