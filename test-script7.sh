#!/bin/bash
sed -i 's/res.json(transcript);/require("fs").appendFileSync("server-log.log", "TRANSCRIPT LENGTH: " + transcript.length + " FOR CONN: " + connectionId + "\\n"); res.json(transcript);/' server/routes/aamarvaRoutes.ts
