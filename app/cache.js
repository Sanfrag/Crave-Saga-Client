//@ts-check
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const decompressResponse = require('decompress-response');
const { ProxyAgent } = require('proxy-agent');

const cacheFolder = path.resolve(__dirname, '..', 'cache');
const resourceCacheFolder = path.join(cacheFolder, 'resources');
const clientCacheFolder = path.join(cacheFolder, 'client');

function log() {
  const win = nw.Window.get();
  if (win) {
    win.window.console.log(...arguments);
  }
}

// create cache folder if it doesn't exist
if (!fs.existsSync(cacheFolder)) {
  fs.mkdirSync(cacheFolder);
}

if (!fs.existsSync(resourceCacheFolder)) {
  fs.mkdirSync(resourceCacheFolder);
}

if (!fs.existsSync(clientCacheFolder)) {
  fs.mkdirSync(clientCacheFolder);
}

nw.global.cacheLoader = true;
nw.global.resourceProxyPort = 0;

let streamWatch = {};
const createWriteStream = filePath => {
  if (streamWatch[filePath]) {
    return null;
  }

  const stream = fs.createWriteStream(filePath);
  streamWatch[filePath] = stream;
  return stream;
};

const finishWriteStream = filePath => {
  delete streamWatch[filePath];
};

// close all current writing streams
nw.global.resetResourceCache = () => {
  for (let filePath in streamWatch) {
    streamWatch[filePath].destroy();
  }
  streamWatch = {};
};

let server = null;

module.exports = {
  setup: () => {
    const http = require('http');
    const https = require('https');

    const agent = new ProxyAgent({ keepAlive: true, maxFreeSockets: 12 });

    const proxy = http.createServer((req, res) => {
      try {
        let resourceHost = null;
        let url = req.url ?? '';
        let clientAsset = false;
        let targetCacheFolder = cacheFolder;
        // check whether first part of req.url is resource
        if (url.startsWith('/resources/')) {
          resourceHost = nw.global.resourceHost ? new URL(nw.global.resourceHost) : null;
          url = url?.substring(10);
          targetCacheFolder = resourceCacheFolder;
        } else if (url.startsWith('/client/')) {
          resourceHost = nw.global.clientHost ? new URL(nw.global.clientHost) : null;
          url = url?.substring(7);
          clientAsset = true;
          targetCacheFolder = path.join(clientCacheFolder, nw.global.clientVersion);
          if (!fs.existsSync(targetCacheFolder)) {
            fs.mkdirSync(targetCacheFolder);
          }
        }

        if (!resourceHost) {
          res.writeHead(404);
          res.end();
          return;
        }

        let protocol = resourceHost.protocol === 'https:' ? https : http;
        let port = resourceHost.port || resourceHost.protocol === 'https:' ? 443 : 80;

        const options = {
          host: resourceHost.host,
          port: port,
          path: url,
          method: req.method,
          headers: { ...req.headers, host: resourceHost.host },
          agent: agent,
        };

        const filename = path.basename(url);
        const isAsset = clientAsset || !!filename.match(/[0-9a-f]{32}/);

        // create file write stream if it's an asset
        const filePath = path.join(targetCacheFolder, filename);

        if (isAsset && fs.existsSync(filePath)) {
          var contentType = mime.lookup(filePath) || 'binary/octet-stream';

          res.writeHead(200, { 'content-type': contentType, 'transfer-encoding': 'chunked' });
          const fileStream = fs.createReadStream(filePath);
          fileStream.pipe(res);
          fileStream.on('error', () => {
            res.end();
          });

          req.on('error', () => {});

          res.on('close', () => {
            fileStream.destroy();
          });
          res.on('error', () => {});
          return;
        }

        const backend_req = protocol.request(options, async backend_res => {
          try {
            backend_res = decompressResponse(backend_res);

            delete backend_res.headers['content-length'];
            backend_res.headers['transfer-encoding'] = 'chunked';

            // res.writeHead(backend_res.statusCode, backend_res.headers);

            const isSuccessful = backend_res.statusCode == 200;
            const tmpFilePath = filePath + '.tmp';
            const fileStream = isSuccessful && isAsset ? createWriteStream(tmpFilePath) : null;
            if (fileStream && fileStream.writable) {
              backend_res.pipe(fileStream);
            }
            backend_res.pipe(res);

            backend_res.on('error', () => {
              res.end();
              fileStream?.destroy();
            });

            fileStream?.on('finish', () => {
              fs.rename(tmpFilePath, filePath, () => {});
            });

            fileStream?.on('close', () => {
              finishWriteStream(tmpFilePath);
            });

            fileStream?.on('error', () => {
              res.end();
            });
          } catch (e) {
            fs.writeFileSync('error.log', e.toString());
          }
        });

        backend_req.on('error', () => {});
        req.pipe(backend_req);
        req.on('error', () => {});
        res.on('close', () => {
          backend_req.destroy();
        });
        res.on('error', () => {
          backend_req.destroy();
        });
      } catch (e) {
        log(e);
        res.end();
      }
    });

    server = proxy.listen(0, 'localhost', () => {
      nw.global.resourceProxyPort = server.address().port;
    });
  },
  dispose: () => {
    server?.close();
  },
};
