#!/bin/bash
sed -i 's/res.status(403).json({ success: false, error: { message: err.message } });/console.error("GET MESSAGES ERROR:", err.message); res.status(403).json({ success: false, error: { message: err.message } });/' server/routes/aamarvaRoutes.ts
