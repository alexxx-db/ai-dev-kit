"""Relocate Claude session transcripts after deploy path changes.

After an Apps redeploy, project files restore under a new cwd
(`/app/deployments/<id>/projects/...`). Transcripts in
`.claude/projects/<old-sanitized-cwd>/` must be folded into the current
path or resume fails with "No conversation found with session ID".
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

_TRANSCRIPT_SANITIZE_RE = re.compile(r'[^a-zA-Z0-9]')
_TRANSCRIPT_MAX_SANITIZED_LENGTH = 200


def sanitize_cwd(cwd: str) -> str:
  """Mirror of claude_agent_sdk session path sanitization."""
  sanitized = _TRANSCRIPT_SANITIZE_RE.sub('-', cwd)
  if len(sanitized) <= _TRANSCRIPT_MAX_SANITIZED_LENGTH:
    return sanitized
  logger.warning(
    'cwd exceeds %s chars; sanitization may diverge from SDK: %r',
    _TRANSCRIPT_MAX_SANITIZED_LENGTH,
    cwd,
  )
  return sanitized[:_TRANSCRIPT_MAX_SANITIZED_LENGTH]


def rewrite_jsonl_cwd(path: Path, new_cwd: str) -> None:
  """Rewrite the `cwd` field in every JSON line of a transcript."""
  out_lines: list[str] = []
  changed = False
  with path.open('r', encoding='utf-8') as handle:
    for line in handle:
      stripped = line.rstrip('\n')
      if not stripped:
        out_lines.append(line)
        continue
      try:
        rec = json.loads(stripped)
      except json.JSONDecodeError:
        out_lines.append(line)
        continue
      if isinstance(rec, dict) and rec.get('cwd') and rec['cwd'] != new_cwd:
        rec['cwd'] = new_cwd
        out_lines.append(json.dumps(rec, ensure_ascii=False) + '\n')
        changed = True
      else:
        out_lines.append(line)
  if changed:
    path.write_text(''.join(out_lines), encoding='utf-8')


def relocate_session_transcripts(project_dir: Path) -> int:
  """Fold stale `.claude/projects/<old>/` transcript dirs into the current one.

  Returns the number of transcript files moved.
  """
  transcripts_root = project_dir / '.claude' / 'projects'
  if not transcripts_root.is_dir():
    return 0

  current_cwd = str(project_dir.resolve())
  expected_name = sanitize_cwd(current_cwd)
  expected_dir = transcripts_root / expected_name
  expected_dir.mkdir(parents=True, exist_ok=True)

  moved = 0
  for child in list(transcripts_root.iterdir()):
    if not child.is_dir() or child.name == expected_name:
      continue
    for jsonl in child.rglob('*.jsonl'):
      dest = expected_dir / jsonl.name
      if dest.exists():
        try:
          jsonl.unlink()
        except OSError:
          pass
        continue
      try:
        jsonl.rename(dest)
      except OSError:
        dest.write_bytes(jsonl.read_bytes())
        try:
          jsonl.unlink()
        except OSError:
          pass
      try:
        rewrite_jsonl_cwd(dest, current_cwd)
      except Exception as exc:  # noqa: BLE001
        logger.warning('failed to rewrite cwd in %s: %s', dest.name, exc)
      moved += 1
    try:
      for empty in sorted((p for p in child.rglob('*') if p.is_dir()), reverse=True):
        empty.rmdir()
      child.rmdir()
    except OSError:
      pass

  if moved:
    logger.info(
      'Relocated %s session transcript(s) into %s',
      moved,
      expected_dir.name,
    )
  return moved
