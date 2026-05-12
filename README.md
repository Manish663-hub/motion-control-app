# Motion.AI — Kling Motion Control App

A full-stack web app that uses **Kling v2.6 Pro Motion Control** via fal.ai to transfer
motion from a reference video onto a character image — generating a real animated video.

---

## How It Works

```
User uploads:
  ├── Character Image  (who to animate)
  └── Motion Video     (how to move)
         ↓
  Node.js server uploads both to fal.ai storage
         ↓
  Submits job to Kling v2.6 Motion Control API
         ↓
  Polls for completion (every 4 seconds)
         ↓
  Returns generated MP4 video URL to browser
```

---

## Setup

### 1. Get a fal.ai API Key

1. Go to **https://fal.ai** and create a free account
2. Visit **https://fal.ai/dashboard/keys** and create an API key
3. fal.ai gives you **$1 free credit** on signup (~2–3 video generations)
4. Kling v2.6 Standard costs ~$0.08/video, Pro ~$0.16/video

### 2. Install & Configure

```bash
# Clone / unzip this folder, then:
cd kling-motion-control

# Install dependencies
npm install

# Copy env file and add your key
cp .env.example .env
```

Open `.env` and replace `your_fal_api_key_here` with your actual fal.ai key:

```
FAL_KEY=your_actual_key_here
```

### 3. Run

```bash
node server.js
```

Open **http://localhost:3000** in your browser.

---

## Usage

1. **Upload a character image** — JPG or PNG, full-body preferred, clear background
2. **Upload a motion reference video** — MP4 or MOV, 3–30 seconds, single person, steady camera
3. **Choose settings:**
   - **Quality Mode**: Standard (faster) or Pro (better quality)
   - **Character Orientation**: "Follow Video" (up to 30s) or "Match Image" (up to 10s, keeps original framing)
   - **Scene Prompt**: Optionally describe background / atmosphere (don't describe the motion — the video does that)
4. Click **Generate** and wait ~30–90 seconds
5. Download your generated video!

---

## Tips for Best Results

| Do ✅ | Don't ❌ |
|-------|---------|
| Full-body character image when using full-body motion | Mismatched framing (portrait + full-body) |
| Clear, well-lit reference video | Fast cuts or camera zooms in reference |
| Single subject in both image and video | Multiple people in the reference video |
| Moderate-speed natural movements | Very fast or extreme actions |
| Steady camera in reference video | Handheld shaky footage |
| Reference videos 3–15 seconds | References under 3s or over 30s |

---

## File Structure

```
kling-motion-control/
├── server.js          ← Express backend (API routes)
├── public/
│   └── index.html     ← Frontend UI
├── uploads/           ← Temp file storage (auto-cleaned)
├── .env.example       ← Environment template
├── .env               ← Your keys (never commit this!)
└── package.json
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/generate` | Upload files + submit Kling job |
| `GET` | `/api/status/:requestId?model=...` | Poll job status |

---

## Switching to Kling 3.0

To use Kling 3.0 (better facial consistency), change the model strings in `server.js`:

```js
// In the submitKlingJob function, change:
"fal-ai/kling-video/v2.6/pro/motion-control"
// to:
"fal-ai/kling-video/v3/pro/motion-control"
```

> Check https://fal.ai/models for the latest Kling model identifiers.

---

## Troubleshooting

**"FAL_KEY not configured"** → Add your key to `.env`

**"Fal storage initiate failed"** → Check your API key is valid and has credits

**Video looks wrong / distorted** → Try matching the framing of image and video more closely

**Generation takes too long** → Normal — Kling Pro can take 60–120 seconds. Standard is faster.
