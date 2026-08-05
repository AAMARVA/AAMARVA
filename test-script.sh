#!/bin/bash
sed -i 's/res.json(transcript);/console.log("SENDING:", transcript); res.json(transcript);/' server/routes/aamarvaRoutes.ts
