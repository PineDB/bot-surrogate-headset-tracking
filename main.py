from __future__ import annotations

from dataclasses import dataclass
from html import escape
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import List
from urllib.parse import parse_qs


@dataclass
class AllocationEntry:
    name: str
    location: str
    robot: str
    surrogate: str
    headset: str
    headset_on_surrogate: bool


def build_sequence(prefix: str, start: int, end: int) -> List[str]:
    return [f"{prefix}{i:03d}" for i in range(start, end + 1)]


ROBOT_ALLOCATIONS = build_sequence("B-", 1, 40) + build_sequence("C-", 100, 140)
SURROGATE_ALLOCATIONS = build_sequence("TB-", 1, 40) + build_sequence("TC-", 1, 40)
HEADSET_ALLOCATIONS = [str(i) for i in range(1, 41)]
LOCATIONS = ["Room A", "Room B", "Room C", "Room D", "Room E", "UPS"]

entries: List[AllocationEntry] = []


def render_options(values: List[str]) -> str:
    return "\n".join(f'<option value="{escape(value)}">{escape(value)}</option>' for value in values)


def render_entries_table() -> str:
    if not entries:
        return ""

    rows = []
    for entry in entries:
        rows.append(
            """
            <tr>
                <td>{name}</td>
                <td>{location}</td>
                <td>{robot}</td>
                <td>{surrogate}</td>
                <td>{headset}</td>
                <td>{headset_on_surrogate}</td>
            </tr>
            """.format(
                name=escape(entry.name),
                location=escape(entry.location),
                robot=escape(entry.robot),
                surrogate=escape(entry.surrogate),
                headset=escape(entry.headset),
                headset_on_surrogate="Yes" if entry.headset_on_surrogate else "No",
            )
        )

    table = f"""
    <h2 class=\"entries-title\">Current Allocations</h2>
    <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Location</th>
                <th>Robot</th>
                <th>Surrogate</th>
                <th>Headset</th>
                <th>Headset on Surrogate</th>
            </tr>
        </thead>
        <tbody>
            {''.join(rows)}
        </tbody>
    </table>
    """
    return table


def render_page() -> str:
    return f"""
<!doctype html>
<html lang=\"en\">
<head>
    <meta charset=\"utf-8\" />
    <title>Office Equipment Tracker</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
            background: #f7f9fb;
            margin: 0;
            padding: 2rem;
            color: #1b1f23;
        }}
        h1 {{
            text-align: center;
            margin-bottom: 2rem;
        }}
        form {{
            background: #ffffff;
            border-radius: 1.5rem;
            padding: 1.5rem 2rem;
            box-shadow: 0 10px 30px rgba(31, 38, 135, 0.1);
            max-width: 700px;
            margin: 0 auto 2rem auto;
        }}
        .form-row {{
            display: flex;
            align-items: center;
            margin-bottom: 1rem;
            gap: 1rem;
        }}
        label {{
            width: 180px;
            font-weight: bold;
        }}
        input[type=\"text\"], select {{
            flex: 1;
            padding: 0.6rem 1rem;
            border: 1px solid #d1d9e6;
            border-radius: 999px;
            font-size: 1rem;
        }}
        input[type=\"checkbox\"] {{
            width: 20px;
            height: 20px;
            accent-color: #2d6cdf;
        }}
        .checkbox-row {{
            display: flex;
            align-items: center;
            gap: 1rem;
        }}
        button {{
            border: none;
            background: linear-gradient(135deg, #2d6cdf, #5b8ef1);
            color: white;
            padding: 0.75rem 2rem;
            border-radius: 999px;
            font-size: 1rem;
            cursor: pointer;
            display: block;
            margin: 1rem auto 0 auto;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 1.5rem;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(31, 38, 135, 0.1);
        }}
        th, td {{
            padding: 0.75rem 1rem;
            text-align: left;
        }}
        th {{
            background: #e7ecf8;
        }}
        tr:nth-child(even) td {{
            background: #f5f7fc;
        }}
        .entries-title {{
            text-align: center;
            margin-bottom: 0.5rem;
        }}
    </style>
</head>
<body>
    <h1>Office Equipment Tracker</h1>
    <form method=\"post\" action=\"/\">
        <div class=\"form-row\">
            <label for=\"name\">Name</label>
            <input type=\"text\" id=\"name\" name=\"name\" required placeholder=\"Enter your name\" />
        </div>
        <div class=\"form-row\">
            <label for=\"location\">Location</label>
            <select id=\"location\" name=\"location\" required>
                <option value=\"\" disabled selected>Select location</option>
                {render_options(LOCATIONS)}
            </select>
        </div>
        <div class=\"form-row\">
            <label for=\"robot\">Robot</label>
            <select id=\"robot\" name=\"robot\" required>
                <option value=\"\" disabled selected>Select robot</option>
                {render_options(ROBOT_ALLOCATIONS)}
            </select>
        </div>
        <div class=\"form-row\">
            <label for=\"surrogate\">Surrogate</label>
            <select id=\"surrogate\" name=\"surrogate\" required>
                <option value=\"\" disabled selected>Select surrogate</option>
                {render_options(SURROGATE_ALLOCATIONS)}
            </select>
        </div>
        <div class=\"form-row\">
            <label for=\"headset\">Headset</label>
            <select id=\"headset\" name=\"headset\" required>
                <option value=\"\" disabled selected>Select headset</option>
                {render_options(HEADSET_ALLOCATIONS)}
            </select>
        </div>
        <div class=\"form-row checkbox-row\">
            <label for=\"headset_on_surrogate\">Headset on surrogate</label>
            <input type=\"checkbox\" id=\"headset_on_surrogate\" name=\"headset_on_surrogate\" />
        </div>
        <button type=\"submit\">Save Allocation</button>
    </form>
    {render_entries_table()}
</body>
</html>
"""


class EquipmentTrackerHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: D401 - part of BaseHTTPRequestHandler API
        html = render_page().encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        self.wfile.write(html)

    def do_POST(self) -> None:  # noqa: D401
        length = int(self.headers.get("Content-Length", "0"))
        data = self.rfile.read(length).decode("utf-8")
        parsed = parse_qs(data)
        name = parsed.get("name", [""])[0].strip()
        location = parsed.get("location", [""])[0]
        robot = parsed.get("robot", [""])[0]
        surrogate = parsed.get("surrogate", [""])[0]
        headset = parsed.get("headset", [""])[0]
        headset_on_surrogate = "headset_on_surrogate" in parsed

        if all([name, location, robot, surrogate, headset]):
            entries.append(
                AllocationEntry(
                    name=name,
                    location=location,
                    robot=robot,
                    surrogate=surrogate,
                    headset=headset,
                    headset_on_surrogate=headset_on_surrogate,
                )
            )

        self.send_response(303)
        self.send_header("Location", "/")
        self.end_headers()


def run_server(host: str = "0.0.0.0", port: int = 8000) -> None:
    server = HTTPServer((host, port), EquipmentTrackerHandler)
    print(f"Serving on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    run_server()
