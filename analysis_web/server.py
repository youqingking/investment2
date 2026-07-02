"""Read-only web server for analysis-result stage reports."""

from __future__ import annotations

import argparse
import json
import mimetypes
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
ANALYSIS_ROOT = ROOT / "analysis-result"
STATIC_ROOT = Path(__file__).resolve().parent / "static"

STAGE_PATTERNS = {
    "filt": "_analysis_filt.md",
    "v1": "_analysis_v1.md",
    "v2": "_analysis_v2.md",
    "v3": "_analysis_v3.md",
}

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


@dataclass(frozen=True)
class StageInfo:
    status: str
    path: str | None
    modified_at: str | None


def _iso_mtime(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()


def _relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def _content_type(path: Path) -> str:
    name = path.name.lower()
    suffix = path.suffix.lower()
    if suffix in {".md", ".csv", ".log", ".txt"} or name.endswith(".chatgpt_chat_url"):
        return "text/plain; charset=utf-8"
    if suffix == ".json":
        return "application/json; charset=utf-8"
    content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    if content_type.startswith("text/") or content_type in {"application/javascript"}:
        return f"{content_type}; charset=utf-8"
    return content_type


def _date_dirs() -> list[Path]:
    if not ANALYSIS_ROOT.exists():
        return []
    date_paths: dict[str, Path] = {}
    for path in ANALYSIS_ROOT.iterdir():
        if not path.is_dir():
            continue
        if DATE_RE.fullmatch(path.name):
            date_paths.setdefault(path.name, path)
            continue
        if not MONTH_RE.fullmatch(path.name):
            continue
        for date_dir in path.iterdir():
            if date_dir.is_dir() and DATE_RE.fullmatch(date_dir.name) and date_dir.name.startswith(f"{path.name}-"):
                date_paths[date_dir.name] = date_dir
    return sorted(date_paths.values(), key=lambda path: path.name, reverse=True)


def _date_dir(date: str) -> Path | None:
    if not DATE_RE.fullmatch(date):
        return None
    month_dir = ANALYSIS_ROOT / date[:7] / date
    if month_dir.is_dir():
        return month_dir
    legacy_dir = ANALYSIS_ROOT / date
    if legacy_dir.is_dir():
        return legacy_dir
    return None


def _ticker_dirs(date: str) -> list[Path]:
    date_dir = _date_dir(date)
    if date_dir is None:
        return []
    return sorted([path for path in date_dir.iterdir() if path.is_dir()], key=lambda p: p.name)


def _find_stage_file(ticker_dir: Path, stage: str) -> Path | None:
    suffix = STAGE_PATTERNS[stage]
    matches = sorted(
        [path for path in ticker_dir.iterdir() if path.is_file() and path.name.endswith(suffix)],
        key=lambda path: path.name,
    )
    return matches[0] if matches else None


def _stage_info(ticker_dir: Path, stage: str) -> StageInfo:
    path = _find_stage_file(ticker_dir, stage)
    if path is None:
        return StageInfo(status="missing", path=None, modified_at=None)
    return StageInfo(status="present", path=_relative(path), modified_at=_iso_mtime(path))


def _attachment_paths(ticker_dir: Path) -> list[dict[str, str | int]]:
    attachments: list[dict[str, str | int]] = []
    for path in sorted(ticker_dir.iterdir(), key=lambda p: p.name):
        if not path.is_file():
            continue
        if any(path.name.endswith(suffix) for suffix in STAGE_PATTERNS.values()):
            continue
        attachments.append(
            {
                "name": path.name,
                "path": _relative(path),
                "url": _asset_url(ticker_dir.parent.name, ticker_dir.name, path.name),
                "size_bytes": path.stat().st_size,
                "modified_at": _iso_mtime(path),
            }
        )
    return attachments


def _asset_url(date: str, ticker: str, name: str) -> str:
    return (
        f"/asset/{quote(date, safe='')}/"
        f"{quote(ticker, safe='')}/"
        f"{quote(name, safe='')}"
    )


def _ticker_payload(date: str, ticker_dir: Path) -> dict:
    stages = {stage: _stage_info(ticker_dir, stage).__dict__ for stage in STAGE_PATTERNS}
    stage_count = sum(1 for item in stages.values() if item["status"] == "present")
    if stage_count == len(STAGE_PATTERNS):
        analysis_status = "complete"
    elif stage_count > 0:
        analysis_status = "partial"
    else:
        analysis_status = "empty"

    mtimes = [path.stat().st_mtime for path in ticker_dir.rglob("*") if path.is_file()]
    modified_at = (
        datetime.fromtimestamp(max(mtimes), tz=timezone.utc).isoformat() if mtimes else None
    )
    return {
        "date": date,
        "ticker": ticker_dir.name,
        "analysis_status": analysis_status,
        "stage_count": stage_count,
        "stages": stages,
        "modified_at": modified_at,
        "attachments": _attachment_paths(ticker_dir),
    }


def list_dates() -> list[dict]:
    dates = []
    for date_dir in _date_dirs():
        tickers = [_ticker_payload(date_dir.name, ticker_dir) for ticker_dir in _ticker_dirs(date_dir.name)]
        counts = {"complete": 0, "partial": 0, "empty": 0}
        for ticker in tickers:
            counts[ticker["analysis_status"]] += 1
        dates.append(
            {
                "date": date_dir.name,
                "ticker_count": len(tickers),
                "complete_count": counts["complete"],
                "partial_count": counts["partial"],
                "empty_count": counts["empty"],
            }
        )
    return dates


def list_tickers(date: str) -> dict:
    if not DATE_RE.fullmatch(date):
        raise ValueError("invalid date")
    date_dir = _date_dir(date)
    if date_dir is None:
        raise FileNotFoundError(date)
    tickers = [_ticker_payload(date, ticker_dir) for ticker_dir in _ticker_dirs(date)]
    return {"date": date, "tickers": tickers}


def get_report(date: str, ticker: str, stage: str) -> dict:
    if not DATE_RE.fullmatch(date):
        raise ValueError("invalid date")
    if stage not in STAGE_PATTERNS:
        raise ValueError("invalid stage")
    ticker = unquote(ticker)
    date_dir = _date_dir(date)
    if date_dir is None:
        raise FileNotFoundError(date)
    ticker_dir = date_dir / ticker
    if not ticker_dir.is_dir() or ticker_dir.parent != date_dir:
        raise FileNotFoundError(ticker)
    path = _find_stage_file(ticker_dir, stage)
    if path is None:
        return {
            "date": date,
            "ticker": ticker,
            "stage": stage,
            "status": "missing",
            "path": None,
            "modified_at": None,
            "content": "",
        }
    return {
        "date": date,
        "ticker": ticker,
        "stage": stage,
        "status": "present",
        "path": _relative(path),
        "modified_at": _iso_mtime(path),
        "content": path.read_text(encoding="utf-8", errors="replace"),
    }


def get_attachment_path(date: str, ticker: str, name: str) -> Path:
    if not DATE_RE.fullmatch(date):
        raise ValueError("invalid date")
    date_dir = _date_dir(date)
    if date_dir is None:
        raise FileNotFoundError(date)
    ticker_dir = (date_dir / ticker).resolve()
    expected_parent = date_dir.resolve()
    if not ticker_dir.is_dir() or ticker_dir.parent != expected_parent:
        raise FileNotFoundError(ticker)
    path = (ticker_dir / name).resolve()
    if path.parent != ticker_dir or not path.is_file():
        raise FileNotFoundError(name)
    if any(path.name.endswith(suffix) for suffix in STAGE_PATTERNS.values()):
        raise FileNotFoundError(name)
    return path


class Handler(BaseHTTPRequestHandler):
    server_version = "AnalysisWeb/0.1"

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path == "/api/dates":
                self._json(list_dates())
                return
            match = re.fullmatch(r"/api/dates/([^/]+)/tickers", path)
            if match:
                self._json(list_tickers(unquote(match.group(1))))
                return
            match = re.fullmatch(r"/api/report/([^/]+)/([^/]+)/([^/]+)", path)
            if match:
                date, ticker, stage = (unquote(part) for part in match.groups())
                self._json(get_report(date, ticker, stage))
                return
            match = re.fullmatch(r"/asset/([^/]+)/([^/]+)/([^/]+)", path)
            if match:
                date, ticker, name = (unquote(part) for part in match.groups())
                self._file(get_attachment_path(date, ticker, name))
                return
            self._static(path)
        except FileNotFoundError:
            self._json({"error": "not found"}, status=HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            self._json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except OSError as exc:
            self._json({"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} - {fmt % args}")

    def _json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, target: Path) -> None:
        content_type = _content_type(target)
        body = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _static(self, path: str) -> None:
        if path in {"", "/"}:
            rel = "index.html"
        else:
            rel = unquote(path.lstrip("/"))
        target = (STATIC_ROOT / rel).resolve()
        try:
            target.relative_to(STATIC_ROOT.resolve())
        except ValueError:
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content_type = _content_type(target)
        body = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve analysis-result web UI")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Serving analysis-result UI at http://{args.host}:{args.port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
