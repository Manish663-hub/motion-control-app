/**
 * ═══════════════════════════════════════════════════════
 *   KLING MOTION CONTROL — Node.js Backend
 *   Powered by fal.ai → Kling v2.6 Pro Motion Control
 * ═══════════════════════════════════════════════════════
 *
 *  HOW IT WORKS:
 *  1. User uploads a character image + motion reference video
 *  2. Server uploads both files to fal.ai storage
 *  3. Server submits a motion control job to Kling v2.6 Pro
 *  4. Client polls /api/status/:requestId until complete
 *  5. Server returns the generated video URL
 *
 *  SETUP:
 *  1. npm install
 *  2. cp .env.example .env  →  add your FAL_KEY
 *  3. node server.js
 *  4. Open http://localhost:3000
 */

require("dotenv").config();
const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const FAL_KEY = process.env.FAL_KEY;

// ── Middleware ──────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── File Upload (temp storage) ──────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "uploads")),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max (for video)
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "image") {
      if (!file.mimetype.startsWith("image/")) {
        return cb(new Error("Character file must be an image (JPG, PNG)"));
      }
    }
    if (file.fieldname === "video") {
      if (!["video/mp4", "video/quicktime", "video/x-matroska"].includes(file.mimetype)) {
        return cb(new Error("Motion reference must be a video (MP4, MOV)"));
      }
    }
    cb(null, true);
  },
});

// ── Helper: Upload file to fal.ai storage ──────────────
async function uploadToFal(filePath, mimeType, fileName) {
  const fileBuffer = fs.readFileSync(filePath);
  const formData = new FormData();
  formData.append("file", fileBuffer, { filename: fileName, contentType: mimeType });

  const response = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
    method: "POST",
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_name: fileName,
      content_type: mimeType,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Fal storage initiate failed: ${err}`);
  }

  const { upload_url, file_url } = await response.json();

  // Upload the actual file bytes to the presigned URL
  const uploadResponse = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: fileBuffer,
  });

  if (!uploadResponse.ok) {
    throw new Error(`File upload to storage failed: ${uploadResponse.status}`);
  }

  return file_url;
}

// ── Helper: Submit Kling Motion Control job ─────────────
async function submitKlingJob(imageUrl, videoUrl, prompt, characterOrientation, mode) {
  // Choose model based on quality mode
  const model =
    mode === "pro"
      ? "fal-ai/kling-video/v2.6/pro/motion-control"
      : "fal-ai/kling-video/v2.6/standard/motion-control";

  const response = await fetch("https://queue.fal.run/" + model, {
    method: "POST",
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageUrl,
      video_url: videoUrl,
      prompt: prompt || "",
      character_orientation: characterOrientation || "video", // "image" or "video"
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Kling job submission failed: ${err}`);
  }

  const data = await response.json();
  return { requestId: data.request_id, model };
}

// ── Helper: Check job status ────────────────────────────
async function checkJobStatus(requestId, model) {
  const response = await fetch(`https://queue.fal.run/${model}/requests/${requestId}/status`, {
    headers: { Authorization: `Key ${FAL_KEY}` },
  });

  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status}`);
  }

  return response.json();
}

// ── Helper: Get job result ──────────────────────────────
async function getJobResult(requestId, model) {
  const response = await fetch(`https://queue.fal.run/${model}/requests/${requestId}`, {
    headers: { Authorization: `Key ${FAL_KEY}` },
  });

  if (!response.ok) {
    throw new Error(`Result fetch failed: ${response.status}`);
  }

  return response.json();
}

// ── Cleanup temp files ──────────────────────────────────
function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    // ignore
  }
}

// ════════════════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════════════════

// POST /api/generate — Upload files + submit Kling job
app.post(
  "/api/generate",
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  async (req, res) => {
    const imageFile = req.files?.image?.[0];
    const videoFile = req.files?.video?.[0];

    if (!imageFile || !videoFile) {
      return res.status(400).json({ error: "Both character image and motion video are required." });
    }

    if (!FAL_KEY || FAL_KEY === "your_fal_api_key_here") {
      cleanupFile(imageFile.path);
      cleanupFile(videoFile.path);
      return res.status(500).json({
        error: "FAL_KEY not configured. Please add your fal.ai API key to .env",
      });
    }

    const { prompt = "", orientation = "video", mode = "standard" } = req.body;

    try {
      console.log("📤 Uploading character image to fal.ai storage...");
      const imageUrl = await uploadToFal(
        imageFile.path,
        imageFile.mimetype,
        imageFile.originalname
      );
      console.log("✅ Image uploaded:", imageUrl);

      console.log("📤 Uploading motion reference video to fal.ai storage...");
      const videoUrl = await uploadToFal(
        videoFile.path,
        videoFile.mimetype,
        videoFile.originalname
      );
      console.log("✅ Video uploaded:", videoUrl);

      console.log("🎬 Submitting Kling Motion Control job...");
      const { requestId, model } = await submitKlingJob(
        imageUrl,
        videoUrl,
        prompt,
        orientation,
        mode
      );
      console.log("✅ Job submitted. Request ID:", requestId);

      // Clean up temp files
      cleanupFile(imageFile.path);
      cleanupFile(videoFile.path);

      res.json({
        success: true,
        requestId,
        model,
        message: "Job submitted successfully. Poll /api/status/:requestId for updates.",
      });
    } catch (err) {
      console.error("❌ Generation error:", err.message);
      cleanupFile(imageFile.path);
      cleanupFile(videoFile.path);
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/status/:requestId — Poll job status
app.get("/api/status/:requestId", async (req, res) => {
  const { requestId } = req.params;
  const { model } = req.query;

  if (!model) {
    return res.status(400).json({ error: "model query param required" });
  }

  try {
    const status = await checkJobStatus(requestId, model);

    if (status.status === "COMPLETED") {
      const result = await getJobResult(requestId, model);
      const videoUrl = result?.video?.url || result?.videos?.[0]?.url;

      return res.json({
        status: "completed",
        videoUrl,
        meta: result,
      });
    }

    if (status.status === "FAILED") {
      return res.json({
        status: "failed",
        error: status.error || "Generation failed",
      });
    }

    // Still in queue or generating
    res.json({
      status: status.status?.toLowerCase() || "in_queue",
      queuePosition: status.queue_position,
    });
  } catch (err) {
    console.error("❌ Status check error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start server ────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║     KLING MOTION CONTROL SERVER          ║
║     Running at http://localhost:${PORT}     ║
╚══════════════════════════════════════════╝

  API Key: ${FAL_KEY && FAL_KEY !== "your_fal_api_key_here" ? "✅ Configured" : "❌ Missing — add to .env"}
  Uploads: ${path.join(__dirname, "uploads")}
  `);
});
