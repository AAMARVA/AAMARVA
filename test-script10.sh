#!/bin/bash
sed -i 's/res.json(transcript);/console.log("SERVER SENDING TO FRONTEND, length: " + transcript.length + ", for connection: " + connectionId); res.json(transcript);/' server/routes/aamarvaRoutes.ts
