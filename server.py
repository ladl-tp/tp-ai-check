#!/usr/bin/env python3
import http.server
import subprocess
import os

# macOS restricts direct access to ~/Desktop from scripts.
# We copy the file to /tmp first, then serve from there.
SRC  = os.path.expanduser('~/Desktop/ai-check.html')
DEST = '/tmp/ai-check.html'

subprocess.run(['cp', SRC, DEST], check=True)

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            with open(DEST, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, str(e))

    def log_message(self, format, *args):
        pass

if __name__ == '__main__':
    print(f'Serving ai-check.html at http://localhost:3000')
    http.server.HTTPServer(('', 3000), Handler).serve_forever()
