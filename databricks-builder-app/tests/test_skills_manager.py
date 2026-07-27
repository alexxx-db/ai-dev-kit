"""Tests for ``server.services.skills_manager``.

The module is loaded directly from its file path so we do not trigger
``server.services.__init__`` (which pulls in heavier services whose relative
imports only resolve when the full app is running).
"""

import importlib.util
from pathlib import Path


def _load_skills_manager():
  """Load skills_manager.py without importing the server.services package."""
  module_path = Path(__file__).resolve().parents[1] / 'server' / 'services' / 'skills_manager.py'
  spec = importlib.util.spec_from_file_location('skills_manager_under_test', module_path)
  module = importlib.util.module_from_spec(spec)
  spec.loader.exec_module(module)
  return module


def test_normalize_skill_name_migrates_legacy_names():
  """Legacy skill names from older installs map to databricks-agent-skills names."""
  sm = _load_skills_manager()
  assert sm.normalize_skill_name('databricks-spark-declarative-pipelines') == 'databricks-pipelines'
  assert sm.normalize_skill_name('databricks-lakebase-autoscale') == 'databricks-lakebase'
  assert sm.normalize_skill_name('databricks-bundles') == 'databricks-dabs'
