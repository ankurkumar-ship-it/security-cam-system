const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');
const { google } = require('googleapis');
const multer = require('multer');
const { Readable } = require('stream');
const https = require('https');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8
});

const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

// =================== GOOGLE DRIVE OAUTH2 ===================
const CLIENT_ID = '681737366833-06nb438brqc8ogckbktu9ef5d4fudquj.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'https://developers.google.com/oauthplayground';
const REFRESH_TOKEN = '1//04EkI1nVAQD3HCgYIARAAGAQSNwF-L9Iry6otqz3DkVgI8NOyAedjW7FOWdPEHIQVcg1qXj60mbGKUTSUYQNXS5X5ORvFIQLp1UQ';
const GOOGLE_DRIVE_FOLDER_ID = '1P5JEiCj-paiDQtv82CpkNc21u_gCCTcK';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

// =================== TELEGRAM BOT CONFIG ===================
const TELEGRAM_BOT_TOKEN = '8718653987:AAHMc-KFEyIWkj0CD8Kg7uJ3D810CoAuOrI';
const TELEGRAM_CHAT_ID = '8872756828';

function sendTelegramNotification(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(text)}`;
  https.get(url, (res) => {}).on('error', (e) => console.error('Telegram send error:', e.message));
}
// ==========================================================

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// QR Code Endpoint
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

// Drive Upload Endpoint
app.post('/upload-cloud', upload.single('mediaFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Koi file receive nahi hui' });
  }

  const sendAlert = req.query.sendAlert === 'true';

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

    console.log(`[Drive Upload] Success: ${uploaded.data.name}`);

    // Agar Telegram alert switch ON hai toh phone par alert bhejega
    if (sendAlert) {
      sendTelegramNotification(`🚨 CCTV Alert!\nFile Uploaded: ${uploaded.data.name}\nDrive Link: ${uploaded.data.webViewLink}`);
    }

    res.json({ success: true, name: uploaded.data.name, link: uploaded.data.webViewLink });
  } catch (error) {
    console.error('[Drive Upload] Failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Realtime Sockets: Two-Way Audio & Camera Stream
io.on('connection', (socket) => {
  // Mobile camera frame dashboard ko
  socket.on('stream-data', (data) => {
    socket.broadcast.emit('stream-feed', data);
  });

  // Laptop Dashboard ka Mic Audio Mobile Speaker ko
  socket.on('intercom-audio', (audioData) => {
    socket.broadcast.emit('speaker-play', audioData);
  });

  socket.on('disconnect', () => {
    io.emit('camera-status', { id: socket.id, status: 'disconnected' });
  });
});

server.listen(PORT, () => {
  console.log(`Surveillance Server running on port ${PORT}`);
});
