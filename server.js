const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 7075);
const host = process.env.HOST || "0.0.0.0";
const root = __dirname;
const configPath = path.join(root, "config.json");
const defaultConfig = {
  playlistId: "PLxLhyV7kYwXwnF-9BWRrK6im3B4irkIvv",
  videoMuted: true,
  videoWidthPercent: 64,
  queueUrl: "https://antri.bpstuban.my.id/qr",
  tickerText: "Selamat datang di BPS Kabupaten Tuban - Pelayanan Statistik Terpadu - Silakan menunggu nomor antrian Anda dipanggil - Jangan lupa mengisi buku tamu dan survei kepuasan layanan -",
  mediaSource: "youtube",
  localPlaylist: []
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm"
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  });
  response.end(JSON.stringify(data, null, 2));
}

function readConfig() {
  try {
    const rawConfig = fs.readFileSync(configPath, "utf8");
    return { ...defaultConfig, ...JSON.parse(rawConfig) };
  } catch (error) {
    return defaultConfig;
  }
}

function extractPlaylistId(value) {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) {
    return "";
  }

  try {
    const url = new URL(trimmedValue);
    return url.searchParams.get("list") || trimmedValue;
  } catch (error) {
    return trimmedValue;
  }
}

function validateConfig(input) {
  const playlistId = extractPlaylistId(input.playlistId);
  const videoMuted = input.videoMuted === true || input.videoMuted === "true";
  const videoWidthPercent = Number(input.videoWidthPercent || defaultConfig.videoWidthPercent);
  const queueUrl = String(input.queueUrl || "").trim();
  const tickerText = String(input.tickerText || "").trim();
  const mediaSource = input.mediaSource === "local" ? "local" : "youtube";
  const localPlaylist = Array.isArray(input.localPlaylist) ? input.localPlaylist : [];

  if (mediaSource === "youtube" && (!playlistId || !/^[a-zA-Z0-9_-]+$/.test(playlistId))) {
    throw new Error("ID playlist YouTube tidak valid.");
  }

  let parsedQueueUrl;
  try {
    parsedQueueUrl = new URL(queueUrl);
  } catch (error) {
    throw new Error("URL website antrian tidak valid.");
  }

  if (!["http:", "https:"].includes(parsedQueueUrl.protocol)) {
    throw new Error("URL website antrian harus diawali http:// atau https://.");
  }

  if (!tickerText) {
    throw new Error("Running text tidak boleh kosong.");
  }

  if (!Number.isFinite(videoWidthPercent) || videoWidthPercent < 35 || videoWidthPercent > 80) {
    throw new Error("Lebar video harus antara 35 sampai 80 persen.");
  }

  return {
    playlistId,
    videoMuted,
    videoWidthPercent: Math.round(videoWidthPercent),
    queueUrl: parsedQueueUrl.toString(),
    tickerText,
    mediaSource,
    localPlaylist
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 50000) {
        request.destroy();
        reject(new Error("Data terlalu besar."));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function streamFile(filePath, request, response) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = request.headers.range;

  const ext = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[ext] || "application/octet-stream";

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": contentType,
      "Referrer-Policy": "strict-origin-when-cross-origin"
    };
    response.writeHead(206, head);
    file.pipe(response);
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": contentType,
      "Referrer-Policy": "strict-origin-when-cross-origin"
    };
    response.writeHead(200, head);
    fs.createReadStream(filePath).pipe(response);
  }
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${host}:${port}`);

  if (requestUrl.pathname === "/api/config" && request.method === "GET") {
    sendJson(response, 200, readConfig());
    return;
  }

  if (requestUrl.pathname === "/api/config" && request.method === "POST") {
    readBody(request)
      .then((body) => {
        const nextConfig = validateConfig(JSON.parse(body || "{}"));
        fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
        sendJson(response, 200, nextConfig);
      })
      .catch((error) => {
        sendJson(response, 400, { error: error.message || "Pengaturan gagal disimpan." });
      });
    return;
  }

  if (requestUrl.pathname === "/api/upload" && request.method === "POST") {
    const mediaDir = path.join(root, "media");
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir);
    }
    const fileNameHeader = request.headers['x-file-name'];
    if (!fileNameHeader) {
      sendJson(response, 400, { error: "Nama file tidak disertakan." });
      return;
    }
    const fileName = decodeURIComponent(fileNameHeader);
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const writeStream = fs.createWriteStream(path.join(mediaDir, safeName));
    request.pipe(writeStream);
    request.on('end', () => sendJson(response, 200, { success: true, fileName: safeName }));
    request.on('error', (err) => sendJson(response, 500, { error: err.message }));
    return;
  }

  if (requestUrl.pathname.startsWith("/api/media/") && request.method === "DELETE") {
    const fileName = decodeURIComponent(requestUrl.pathname.split("/").pop());
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = path.join(root, "media", safeName);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      sendJson(response, 200, { success: true });
    } catch (e) {
      sendJson(response, 500, { error: e.message });
    }
    return;
  }

  const normalizedPath = path.normalize(decodeURIComponent(requestUrl.pathname));
  const relativePath = normalizedPath === path.sep ? "index.html" : normalizedPath.replace(/^[/\\]+/, "");
  const filePath = path.join(root, relativePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("File tidak ditemukan");
      return;
    }
    
    streamFile(filePath, request, response);
  });
});

server.listen(port, host, () => {
  console.log(`Display BPS Tuban berjalan di http://${host}:${port}`);
});
