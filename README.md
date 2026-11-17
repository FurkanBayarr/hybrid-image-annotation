# Hybrid Image Annotation

My graduation project at Ankara University (Computer Engineering, 2026): a small platform for
labeling images with bounding boxes, where a YOLO model suggests labels and gets retrained on the
boxes people fix.

The idea is simple. Drawing every box by hand is slow, and a model trained once goes stale. So the
model proposes boxes, a person corrects them, and the corrections become the next training set.

## How it fits together

```
React + Konva UI ──HTTP──> cloud-backend (Go, :3000) ── GORM ──> SQLite
       │                      login (JWT), annotations, image lists
       │
       ├──WebSocket──> go-agent (Go, :8080)
       │                 streams image files to the browser
       │
       └──HTTP──> ai-service (Python/Flask, :5001)
                    /next           picks the next image to label
                    /auto-annotate  YOLOv8 suggestions for an image
                    /train          builds a YOLO dataset from saved boxes and retrains
```

- **frontend-client** — React 19, Vite, react-konva for drawing and editing boxes.
- **cloud-backend** — Go `net/http`, JWT auth middleware, GORM with SQLite.
- **go-agent** — Go WebSocket server that sends raw image bytes to the UI.
- **ai-service** — Flask + Ultralytics YOLOv8. `custom_best.pt` is the model after my own
  retraining runs; the base `yolov8n.pt` is downloaded by Ultralytics on first use.

## Running it locally

```bash
# 1. backend
cd cloud-backend && go run .

# 2. image streamer
cd go-agent && go run .

# 3. model service
cd ai-service && python -m venv venv && . venv/bin/activate
pip install -r requirements.txt && python app.py

# 4. UI
cd frontend-client && npm install && npm run dev
```

`cloud-backend/verify.sh` logs in, posts a box and reads it back — a quick smoke test of the API.

## What I would change next

This was built to prove the loop works, not to run in production. Things I know are rough:

- The JWT key and the demo login are hard-coded; they should come from environment variables.
- Image folders are absolute paths in `go-agent/main.go` and `ai-service/app.py`.
- `/next` scans the folder instead of picking the most uncertain image, which is what real
  active learning would do. Uncertainty sampling is the obvious next step.
- No tests beyond the smoke script, and no Docker Compose yet.
- Code comments are partly in Turkish; I wrote them while learning Go.
