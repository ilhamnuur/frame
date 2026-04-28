const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 7075);
const host = process.env.HOST || "0.0.0.0";
const root = __dirname;
const configPath = path.join(root, "config.json");
const defaultConfig = {
  playlistId: "PLxLhyV7kYwXwnF-9BWRrK6im3B4irkIvv",
  videoMuted: false,
  queueUrl: "https://antri.bpstuban.my.id/qr",
  tickerText: "Selamat datang di BPS Kabupaten Tuban - Pelayanan Statistik Terpadu - Silakan menunggu nomor antrian Anda dipanggil - Jangan lupa mengisi buku tamu dan survei kepuasan layanan -"
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
  ".ico": "image/x-icon"
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
  const queueUrl = String(input.queueUrl || "").trim();
  const tickerText = String(input.tickerText || "").trim();

  if (!playlistId || !/^[a-zA-Z0-9_-]+$/.test(playlistId)) {
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

  return {
    playlistId,
    videoMuted,
    queueUrl: parsedQueueUrl.toString(),
    tickerText
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

  const normalizedPath = path.normalize(decodeURIComponent(requestUrl.pathname));
  const relativePath = normalizedPath === path.sep ? "index.html" : normalizedPath.replace(/^[/\\]+/, "");
  const filePath = path.join(root, relativePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("File tidak ditemukan");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    response.end(content);
  });
});

server.listen(port, host, () => {
  console.log(`Display BPS Tuban berjalan di http://${host}:${port}`);
});
