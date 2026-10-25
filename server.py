"""Tiny static server for local development: python3 reflect/server.py"""
import functools, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8770

Handler = functools.partial(SimpleHTTPRequestHandler, directory=ROOT)
print(f"Reflect on http://localhost:{PORT}")
# This computer only: the folder holds android/keystore.properties, so never serve it to the network.
ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
