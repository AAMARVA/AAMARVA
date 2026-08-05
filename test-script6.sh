#!/bin/bash
sed -i 's/console.error("GET MESSAGES ERROR:", err.message); res.status(403).json({ success: false, error: { message: err.message } });/require("fs").appendFileSync("server-error.log", err.message + "\\n"); res.status(403).json({ success: false, error: { message: err.message } });/' server/routes/aamarvaRoutes.ts
