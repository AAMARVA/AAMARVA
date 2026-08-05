#!/bin/bash
sed -i 's/console.log("SENDING:", transcript); //' server/routes/aamarvaRoutes.ts
sed -i 's/require("fs").appendFileSync("server-error.log", err.message + "\\n"); //' server/routes/aamarvaRoutes.ts
