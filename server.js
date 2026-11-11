const express = require("express");
const multer = require("multer");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

const app = express();

const PORT = Number(process.env.PORT) || 10000;
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_OUTPUT_SIZE = 50 * 1024 * 1024;
const CONVERSION_TIMEOUT = 60000;

const allowedFormats = new Set([
  "pdf", "doc", "docx", "txt", "rtf", "odt",
  "html", "htm", "xls", "xlsx", "csv",
  "ppt", "pptx", "odp"
]);

const mimeTypes = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  html: "text/html",
  htm: "text/html",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odp: "application/vnd.oasis.opendocument.presentation"
};

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": [
        "'self'",
        "https://pagead2.googlesyndication.com",
        "https://googleads.g.doubleclick.net"
      ],
      "frame-src": [
        "'self'",
        "https://googleads.g.doubleclick.net",
        "https://tpc.googlesyndication.com"
      ],
      "img-src": ["'self'", "data:", "https:"],
      "connect-src": [
        "'self'",
        "https://pagead2.googlesyndication.com"
      ]
    }
  }
}));

// Serve only the public frontend files.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use("/assets", express.static(path.join(__dirname, "assets"), {
  dotfiles: "ignore",
  index: false
}));

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:3000")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean)
  .concat("https://converter.url36.com");

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use("/api/convert", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 5,
    parts: 6
  }
});

function getExtension(filename) {
  return path.extname(filename).slice(1).toLowerCase();
}

function safeFilename(filename) {
  return path.basename(filename, path.extname(filename))
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80) || "converted";
}

function runLibreOffice(inputPath, outputDir, profileDir, outputFormat) {
  return new Promise((resolve, reject) => {
    const args = [
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      "--headless",
      "--nologo",
      "--nodefault",
      "--nolockcheck",
      "--convert-to",
      outputFormat,
      "--outdir",
      outputDir,
      inputPath
    ];

    const child = spawn("libreoffice", args, {
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        HOME: process.env.HOME || os.tmpdir()
      }
    });

    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("Conversion timed out."));
    }, CONVERSION_TIMEOUT);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve();
    }

    child.stderr.on("data", data => {
      if (stderr.length < 2000) {
        stderr += data.toString();
      }
    });

    child.on("error", () => {
      finish(new Error("Conversion engine unavailable."));
    });

    child.on("close", code => {
      if (code === 0) {
        finish();
      } else {
        finish(new Error("Conversion process failed."));
      }
    });
  });
}

app.get("/api/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    status: "ok",
    service: "URL36 Document Converter"
  });
});

app.post("/api/convert", upload.single("file"), async (req, res) => {
  let tempDir;

  try {
    if (!req.file || !req.file.buffer || req.file.size === 0) {
      return res.status(400).json({
        error: "Please upload a non-empty document."
      });
    }

    const source = getExtension(req.file.originalname);
    const target = String(req.body.target || "").toLowerCase();

    if (!allowedFormats.has(source) || !allowedFormats.has(target)) {
      return res.status(400).json({
        error: "Unsupported document format."
      });
    }

    if (source === target) {
      return res.status(400).json({
        error: "Source and output formats are the same."
      });
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "url36-"));

    const inputDir = path.join(tempDir, "input");
    const outputDir = path.join(tempDir, "output");
    const profileDir = path.join(tempDir, "profile");

    await Promise.all([
      fs.mkdir(inputDir),
      fs.mkdir(outputDir),
      fs.mkdir(profileDir)
    ]);

    const inputPath = path.join(inputDir, `source.${source}`);
    const outputPath = path.join(outputDir, `source.${target}`);

    await fs.writeFile(inputPath, req.file.buffer, { flag: "wx" });

    await runLibreOffice(inputPath, outputDir, profileDir, target);

    const outputStat = await fs.stat(outputPath).catch(() => null);

    if (
      !outputStat ||
      !outputStat.isFile() ||
      outputStat.size === 0 ||
      outputStat.size > MAX_OUTPUT_SIZE
    ) {
      throw new Error("Output unavailable.");
    }

    const output = await fs.readFile(outputPath);
    const filename = `${safeFilename(req.file.originalname)}.${target}`;

    res.set({
      "Content-Type": mimeTypes[target],
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": output.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });

    return res.send(output);

  } catch (error) {
    if (!res.headersSent) {
      const timedOut = error.message === "Conversion timed out.";

      return res.status(timedOut ? 504 : 422).json({
        error: timedOut
          ? "Conversion timed out. Please try a smaller document."
          : "This document could not be converted to the selected format."
      });
    }
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, {
        recursive: true,
        force: true
      }).catch(() => {});
    }
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Maximum file size is 15 MB."
      : "Upload limit exceeded.";

    return res.status(413).json({ error: message });
  }

  if (error.message === "Origin not allowed") {
    return res.status(403).json({
      error: "Request origin not allowed."
    });
  }

  return res.status(400).json({
    error: "Request could not be processed."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`URL36 Converter API listening on port ${PORT}`);
});
