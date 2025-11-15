# bot-surrogate-headset-tracking

A lightweight Flask app for tracking equipment assignments (robots, surrogates, and headsets) across office locations. Entries persist for 168 hours and everyone on the network can view the shared log.

## Getting started

1. **Install dependencies**
   ```bash
   python3 -m pip install flask
   ```
2. **Manual run**
   ```bash
   python3 main.py
   ```
   The app listens on `http://0.0.0.0:5000` so you can open it locally or from other devices on the network using your machine’s IP address.

## Continuous server scripts

- `start_server.sh`: starts the Flask server in the background, writing logs to `logs/server.log` and storing the PID in `logs/server.pid`. Customize `HOST` or `PORT` by exporting them before running the script.
- `stop_server.sh`: stops the background server using the stored PID.

Usage example:
```bash
./start_server.sh
# ... later ...
./stop_server.sh
```

Logs live in the `logs/` directory and rotate manually (remove/rename as needed).
