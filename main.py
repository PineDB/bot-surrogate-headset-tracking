from __future__ import annotations

import json
import uuid
import os
import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path
from io import StringIO

from flask import Flask, jsonify, render_template, request, Response

BASE_DIR = Path(__file__).parent
DATA_FILE = BASE_DIR / "saved_entries.json"
RESET_INTERVAL = timedelta(hours=168)

app = Flask(__name__)

CATEGORY_ORDER = {
    "robot_surrogate_headset": 0,
    "only_robot": 1,
    "surrogate_headset": 2,
    "only_surrogate": 3,
    "only_headset": 4,
    "other": 5,
}

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)

def _default_store() -> dict:
    current = _now_utc()
    return {"last_reset": current.isoformat(), "entries": []}

def _load_store() -> dict:
    if DATA_FILE.exists():
        try:
            return json.loads(DATA_FILE.read_text())
        except json.JSONDecodeError:
            return _default_store()
    DATA_FILE.touch()
    return _default_store()

def _save_store(data: dict) -> None:
    DATA_FILE.write_text(json.dumps(data, indent=2))

def _ensure_active_window() -> dict:
    data = _load_store()
    now = _now_utc()
    last_reset_raw = data.get("last_reset")
    try:
        last_reset = datetime.fromisoformat(last_reset_raw)
    except (TypeError, ValueError):
        last_reset = now
        data["last_reset"] = last_reset.isoformat()

    if now - last_reset >= RESET_INTERVAL:
        data = _default_store()
        _save_store(data)
        return data

    # guarantee entries array exists
    data.setdefault("entries", [])
    return data

def _sorted_entries(data: dict) -> list:
    entries = data.get("entries", [])
    return sorted(entries, key=lambda item: item.get("timestamp", ""), reverse=True)

def _parse_iso_datetime(raw: str | None) -> datetime | None:
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        value = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value

def _entry_timestamp(entry: dict) -> datetime | None:
    return _parse_iso_datetime(entry.get("timestamp"))

def _normalize_location(value: str | None) -> str:
    text = (value or "").strip()
    return text or "Unspecified"

def _entry_category(entry: dict) -> int:
    robot = bool(str(entry.get("robot", "")).strip())
    surrogate = bool(str(entry.get("surrogate", "")).strip())
    headset = bool(str(entry.get("headset", "")).strip())

    if robot and surrogate and headset:
        key = "robot_surrogate_headset"
    elif robot and not surrogate and not headset:
        key = "only_robot"
    elif not robot and surrogate and headset:
        key = "surrogate_headset"
    elif not robot and surrogate and not headset:
        key = "only_surrogate"
    elif not robot and not surrogate and headset:
        key = "only_headset"
    else:
        key = "other"
    return CATEGORY_ORDER[key]

def _ordered_entries(entries: list[dict]) -> list[dict]:
    def sort_key(entry: dict) -> tuple:
        location = _normalize_location(entry.get("location"))
        category = _entry_category(entry)
        timestamp = _entry_timestamp(entry) or datetime.min.replace(tzinfo=timezone.utc)
        # negative timestamp for descending order
        return (location.lower(), category, -timestamp.timestamp())

    return sorted(entries, key=sort_key)

@app.route("/")
def index():
    reset_hours = int(RESET_INTERVAL.total_seconds() // 3600)
    return render_template("index.html", reset_hours=reset_hours)

@app.route("/api/entries", methods=["GET"])
def list_entries():
    data = _ensure_active_window()
    entries = _sorted_entries(data)
    reset_hours = int(RESET_INTERVAL.total_seconds() // 3600)
    return jsonify({
        "entries": entries,
        "resetHours": reset_hours,
        "lastReset": data["last_reset"],
    })

@app.route("/api/entries", methods=["POST"])
def create_entry():
    payload = request.get_json(silent=True) or {}
    data = _ensure_active_window()
    now = _now_utc()
    entry = {
        "id": str(uuid.uuid4()),
        "name": str(payload.get("name", "")).strip(),
        "location": payload.get("location"),
        "robot": payload.get("robot"),
        "surrogate": payload.get("surrogate"),
        "headset": str(payload.get("headset", "")),
        "headsetOnSurrogate": bool(payload.get("headsetOnSurrogate")),
        "timestamp": now.isoformat(),
    }
    data.setdefault("entries", []).append(entry)
    _save_store(data)
    return jsonify(entry), 201

@app.route("/api/entries/<entry_id>", methods=["DELETE"])
def delete_entry(entry_id: str):
    data = _ensure_active_window()
    entries = data.setdefault("entries", [])
    before_count = len(entries)
    entries = [entry for entry in entries if entry.get("id") != entry_id]
    if len(entries) == before_count:
        return jsonify({"error": "Entry not found"}), 404
    data["entries"] = entries
    _save_store(data)
    return jsonify({"status": "deleted", "id": entry_id})

@app.route("/api/entries/export", methods=["GET"])
def export_entries():
    data = _ensure_active_window()
    entries = data.get("entries", [])

    start_raw = request.args.get("start")
    end_raw = request.args.get("end")
    start_dt = _parse_iso_datetime(start_raw)
    end_dt = _parse_iso_datetime(end_raw)

    if start_raw and start_dt is None:
        return jsonify({"error": "Invalid start datetime."}), 400
    if end_raw and end_dt is None:
        return jsonify({"error": "Invalid end datetime."}), 400
    if start_dt and end_dt and start_dt > end_dt:
        return jsonify({"error": "Start datetime must be before end datetime."}), 400

    filtered: list[dict] = []
    for entry in entries:
        entry_dt = _entry_timestamp(entry)
        if start_dt and (entry_dt is None or entry_dt < start_dt):
            continue
        if end_dt and (entry_dt is None or entry_dt > end_dt):
            continue
        filtered.append(entry)

    ordered = _ordered_entries(filtered)

    csv_buffer = StringIO()
    writer = csv.writer(csv_buffer)
    writer.writerow(["Location", "Robot", "Surrogate", "Headset"])
    for entry in ordered:
        writer.writerow([
            _normalize_location(entry.get("location")),
            str(entry.get("robot", "")).strip(),
            str(entry.get("surrogate", "")).strip(),
            str(entry.get("headset", "")).strip(),
        ])

    csv_buffer.seek(0)
    filename_time = _now_utc().strftime("%Y%m%dT%H%M%SZ")
    response = Response(csv_buffer.getvalue(), mimetype="text/csv")
    response.headers["Content-Disposition"] = f'attachment; filename=\"equipment_entries_{filename_time}.csv\"'
    return response

if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5000"))
    app.run(host=host, port=port, debug=True)
