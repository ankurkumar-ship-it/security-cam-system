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
  maxHttpBufferSize: 1e8 // Large video chunks ke liye buffer
});

const PORT = process.env.PORT || 3000;

// Multer memory storage - files hard drive par nahi, seedhe RAM se Drive me upload hongi
const upload = multer({ storage: multer.memoryStorage() });

// Google Drive Authentication
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'cctv-credentials.json'),
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// YAHAN APNI GOOGLE DRIVE FOLDER ID PASTE KAREIN:
const GOOGLE_DRIVE_FOLDER_ID = '1P5JEiCj-paiDQtv82CpkNc21u_gCCTcK';

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

// Google Drive Auto-Upload Route
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

// Socket.io real-time streaming logic
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
