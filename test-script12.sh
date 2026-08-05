#!/bin/bash
sed -i 's/fs.appendFileSync("server-spy.log", "FETCH: " + connectionId + " -> " + transcript.length + " \\n"); res.json(transcript);/res.json({ success: true, data: transcript });/' server/routes/aamarvaRoutes.ts
