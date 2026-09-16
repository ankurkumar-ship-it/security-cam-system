const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');
const { google } = require('googleapis');
const multer = require('multer');
const { Readable } = require('stream');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8
});

const PORT = process.env.PORT || 3000;

// Multer memory storage - Laptop hard drive par save kiye bina sidhe RAM se Drive upload
const upload = multer({ storage: multer.memoryStorage() });

// =================== GOOGLE DRIVE OAUTH2 SETUP ===================
const CLIENT_ID = '681737366833-06nb438brqc8ogckbktu9ef5d4fudquj.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'https://developers.google.com/oauthplayground';

// YAHAN APNA OAUTH PLAYGROUND SE MILA HUA REFRESH TOKEN PASTE KAREIN:
const REFRESH_TOKEN = '1//04EkIlNvAQD3HCgYIARAAGAQSNwF-L9Iry6otqz3DkVgI8NOyAedjW7FOWDpEHIQVcg1qXj60mbGKUTSUYQNXS5X5ORvFIQLp1UQ';

// AAPKI FOLDER ID (CCTV_Footage folder):
const GOOGLE_DRIVE_FOLDER_ID = '1P5JEiCj-paiDQtv82CpkNc21u_gCCTcK';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
// =================================================================

app.use(express.static(path.join(__dirname, 'public')));

// QR Code endpoint
app.get('/get-qr', async (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const mobileUrl = `${protocol}://${host}/camera.html`;

  try {
    const qrImage = await QRCode.toDataURL(mobileUrl);
    res.json({ url: mobileUrl, qr: qrImage });
  } catch (err) {
    res.status(500).json({ error: 'QR generate nahi ho paya' });
  }
});

// Direct Cloud Upload Endpoint
app.post('/upload-cloud', upload.single('mediaFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Koi file receive nahi hui' });
  }

  try {
    const fileMetadata = {
      name: req.file.originalname,
      parents: [GOOGLE_DRIVE_FOLDER_ID]
    };

    const media = {
      mimeType: req.file.mimetype,
      body: Readable.from(req.file.buffer)
    };

    const uploaded = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink'
    });

    console.log(`[Google Drive Upload] Success: ${uploaded.data.name}`);
    res.json({ success: true, name: uploaded.data.name, link: uploaded.data.webViewLink });
  } catch (error) {
    console.error('[Google Drive Upload] Failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Socket.io WebRTC / Realtime stream handling
io.on('connection', (socket) => {
  socket.on('stream-data', (data) => {
    socket.broadcast.emit('stream-feed', data);
  });

  socket.on('control-command', (data) => {
    socket.broadcast.emit('camera-action', data);
  });

  socket.on('disconnect', () => {
    io.emit('camera-status', { id: socket.id, status: 'disconnected' });
  });
});

server.listen(PORT, () => {
  console.log(`Surveillance Server running on port ${PORT}`);
});
