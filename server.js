const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Queues for matching
let users = {
    male: [],
    female: []
};

// Haversine formula for distance calculation
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        // data = { sex, age, lat, lon, distancePref, agePref }
        socket.userData = data;
        const targetGender = data.sex === 'male' ? 'female' : 'male';
        
        // Attempt to find a match
        const matchIndex = users[targetGender].findIndex(peer => {
            const dist = getDistance(data.lat, data.lon, peer.userData.lat, peer.userData.lon);
            const ageDiff = Math.abs(data.age - peer.userData.age);
            
            // Check if both users satisfy each other's filters
            return dist <= data.distancePref && 
                   dist <= peer.userData.distancePref &&
                   ageDiff <= data.agePref &&
                   ageDiff <= peer.userData.agePref;
        });

        if (matchIndex !== -1) {
            const peer = users[targetGender].splice(matchIndex, 1)[0];
            // Notify both users they are matched
            io.to(socket.id).emit('matched', { peerId: peer.id, offer: true });
            io.to(peer.id).emit('matched', { peerId: socket.id, offer: false });
        } else {
            users[data.sex].push(socket);
        }
    });

    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
    });

    socket.on('disconnect', () => {
        users.male = users.male.filter(s => s.id !== socket.id);
        users.female = users.female.filter(s => s.id !== socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
