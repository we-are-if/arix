"""Loopback-only Nginx auth_request adapter for the SpareXpert UI."""
import http.client
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def authorized(payload):
    session = payload.get("data") or {}
    return (session.get("company") or {}).get("id", session.get("companyId")) == "sparexpert"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        status = 401
        if self.path == "/authorize" and self.headers.get("Cookie"):
            status = 503
            conn = http.client.HTTPConnection("127.0.0.1", 8787, timeout=12)
            try:
                conn.request("GET", "/api/daily-auth/session", headers={
                    "Cookie": self.headers["Cookie"], "Host": "daily.arix.az",
                    "X-Forwarded-Proto": "https",
                })
                response = conn.getresponse()
                if response.status == 200:
                    status = 204 if authorized(json.loads(response.read(65536))) else 401
                elif response.status in (401, 403):
                    status = 401
            except (OSError, ValueError, AttributeError, http.client.HTTPException) as error:
                print(f"SpareXpert session verification unavailable: {type(error).__name__}", flush=True)
            finally:
                conn.close()
        self.send_response(status)
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 18787), Handler).serve_forever()
