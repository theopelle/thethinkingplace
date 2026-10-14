"""Tiny static server for local development: python3 reflect/server.py"""
import functools, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8770

Handler = functools.partial(SimpleHTTPRequestHandler, directory=ROOT)
print(f"Reflect on http://localhost:{PORT}")
ThreadingHTTPServer(("", PORT), Handler).serve_forever()
