#!/bin/bash
sed -i 's/res.status(403).json({ success: false, error: { message: err.message } });/require("fs").appendFileSync("server-error.log", err.message + "\\n"); res.status(403).json({ success: false, error: { message: err.message } });/' server/routes/aamarvaRoutes.ts
