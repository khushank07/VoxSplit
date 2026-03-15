import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import path from "path";
import fs from "fs";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import ffmpeg from "fluent-ffmpeg";

const app = express();

async function setupApp() {
  app.use(cors());
  app.use(express.json());

  // Ensure directories exist
  // NOTE: Vercel filesystem is read-only except for /tmp
  const isVercel = process.env.VERCEL === "1";
  const uploadsDir = isVercel ? "/tmp/uploads" : path.join(process.cwd(), "uploads");
  const tempDir = isVercel ? "/tmp/temp" : path.join(process.cwd(), "temp");

  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });

  const upload = multer({ 
    storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
  });

  // API Routes
  app.post("/api/upload", upload.single("file"), (req: any, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    res.json({ 
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: `/uploads/${req.file.filename}`
    });
  });

  // Serve uploaded files
  app.use("/uploads", express.static(uploadsDir));

  // Trim and merge audio for a specific speaker
  app.post("/api/trim-speaker", async (req, res) => {
    const { filename, segments, speakerName } = req.body;
    
    if (!filename || !segments || !Array.isArray(segments)) {
      return res.status(400).json({ error: "Invalid request data" });
    }

    const inputPath = path.join(uploadsDir, filename);
    const outputFilename = `trimmed-${speakerName.replace(/\s+/g, "-")}-${uuidv4()}.mp3`;
    const outputPath = path.join(tempDir, outputFilename);

    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ error: "Source file not found. Note: Vercel is stateless and may lose files between requests." });
    }

    try {
      const command = ffmpeg(inputPath);
      
      let filterString = "";
      segments.forEach((seg, i) => {
        filterString += `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}];`;
      });
      
      const inputs = segments.map((_, i) => `[a${i}]`).join("");
      filterString += `${inputs}concat=n=${segments.length}:v=0:a=1[outa]`;

      command
        .complexFilter(filterString)
        .map("[outa]")
        .toFormat("mp3")
        .on("start", (cmd) => console.log("FFmpeg started:", cmd))
        .on("error", (err) => {
          console.error("FFmpeg error:", err);
          res.status(500).json({ error: "Failed to process audio. FFmpeg might not be available on this environment." });
        })
        .on("end", () => {
          res.json({ 
            downloadUrl: `/temp/${outputFilename}`,
            filename: outputFilename
          });
        })
        .save(outputPath);

    } catch (error) {
      console.error("Trimming error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Serve temp files (trimmed audio)
  app.use("/temp", express.static(tempDir));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && !isVercel) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }
}

setupApp().then(() => {
  if (process.env.VERCEL !== "1") {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
});

export default app;

