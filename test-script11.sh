#!/bin/bash
sed -i 's/console.log("SERVER SENDING TO FRONTEND, length: " + transcript.length + ", for connection: " + connectionId); res.json(transcript);/fs.appendFileSync("server-spy.log", "FETCH: " + connectionId + " -> " + transcript.length + " \\n"); res.json(transcript);/' server/routes/aamarvaRoutes.ts
sed -i 's/res.status(403).json({ success: false, error: { message: err.message } });/fs.appendFileSync("server-spy.log", "ERR: " + err.message + "\\n"); res.status(403).json({ success: false, error: { message: err.message } });/' server/routes/aamarvaRoutes.ts
