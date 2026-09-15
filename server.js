const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// public folder ki files ko web par dikhane ke liye
app.use(express.static('public'));

// Computer ka Local Wi-Fi IP nikalne ka function
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (let name in interfaces) {
    for (let iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIP();
const PORT = 3000;

// QR Code aur Mobile URL provide karne ke liye API
app.get('/get-qr', async (req, res) => {
  const mobileUrl = `http://${LOCAL_IP}:${PORT}/camera.html`;
  try {
    const qrImage = await QRCode.toDataURL(mobileUrl);
    res.json({ url: mobileUrl, qr: qrImage });
  } catch (err) {
    res.status(500).json({ error: 'QR generate nahi ho paya' });
  }
});

// Real-time Communication (Socket.io)
io.on('connection', (socket) => {
  console.log('Naya device connect hua:', socket.id);

  // Mobile camera identify hone par
  socket.on('register-camera', (camId) => {
    socket.camId = camId;
    console.log(`Camera active: ${camId}`);
    io.emit('camera-status', { id: camId, status: 'connected' });
  });

  // Mobile camera se aane wala video frame dashboard ko bhejna
  socket.on('stream-data', (data) => {
    socket.broadcast.emit('stream-feed', data);
  });

  // Dashboard se commands (Torch, Camera Flip) mobile ko bhejna
  socket.on('control-command', (command) => {
    socket.broadcast.emit('execute-command', command);
  });

  // Mobile disconnect hone par
  socket.on('disconnect', () => {
    if (socket.camId) {
      console.log(`Camera disconnect hua: ${socket.camId}`);
      io.emit('camera-status', { id: socket.camId, status: 'disconnected' });
    }
  });
});

// Server chalu karein
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n==================================================`);
  console.log(`🚀 System Chalu Ho Gaya Hai!`);
  console.log(`💻 PC Dashboard (Admin):  http://localhost:${PORT}`);
  console.log(`📱 Mobile Camera Link:   http://${LOCAL_IP}:${PORT}/camera.html`);
  console.log(`==================================================\n`);
});