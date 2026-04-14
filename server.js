const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. Firebase Initialization from Render Environment Variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://visiodating-674d3-default-rtdb.europe-west1.firebasedatabase.app"
});
const db = admin.database();

app.use(express.static(path.join(__dirname, 'public')));

// Queues for matching (Socket IDs)
let queues = { male: [], female: [] };

io.on('connection', (socket) => {
    
    // Save or Update Profile
    socket.on('save-profile', async (data) => {
        // data: { userId, sex, age, bio, education, interests, lat, lon }
        await db.ref('users/' + data.userId).set(data);
    });

    // Join Matchmaking
    socket.on('join', async (data) => {
        socket.userData = data; 
        const targetGender = data.sex === 'male' ? 'female' : 'male';
        
        // Find best match in the opposite gender queue
        let matchIndex = queues[targetGender].findIndex(peerSocket => {
            const peer = peerSocket.userData;
            const ageDiff = Math.abs(data.age - peer.age);
            
            // Simple logic: Gender match + Age within 5 years
            return ageDiff <= 5; 
        });

        if (matchIndex !== -1) {
            const peerSocket = queues[targetGender].splice(matchIndex, 1)[0];
            
            // Send peer profile info along with the match event
            io.to(socket.id).emit('matched', { peerId: peerSocket.id, peerData: peerSocket.userData, offer: true });
            io.to(peerSocket.id).emit('matched', { peerId: socket.id, peerData: socket.userData, offer: false });
        } else {
            queues[data.sex].push(socket);
        }
    });

    // WebRTC Signaling Tunnel
    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
    });

    socket.on('disconnect', () => {
        queues.male = queues.male.filter(s => s.id !== socket.id);
        queues.female = queues.female.filter(s => s.id !== socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
