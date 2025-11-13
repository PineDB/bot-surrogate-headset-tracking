# bot-surrogate-headset-tracking

A minimal Python web server for tracking office equipment allocations between robots, surrogates, and headsets. Everything runs on the standard library—no third-party installs required.

## Getting started

1. Make sure you have Python 3.8 or newer available on your machine (the default `python3` that ships with macOS, Windows, or Linux is fine).
2. From the project root, start the server:
   ```bash
   python3 main.py
   ```
   Keep this terminal window running; it is serving the site. The app binds to all network interfaces on port 8000 and prints the address it's listening on (for example, `Serving on http://0.0.0.0:8000`).
3. In a web browser, navigate to [http://localhost:8000](http://localhost:8000). If you want to share the page with others on your local network, replace `localhost` with your machine's LAN IP address (e.g., `http://192.168.1.15:8000`). You can now fill out the form and the table below it will grow with each submission for the duration of the session.
