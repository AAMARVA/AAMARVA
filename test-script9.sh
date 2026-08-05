#!/bin/bash
sed -i 's/require("fs").appendFileSync("server-log.log", "TRANSCRIPT LENGTH: " + transcript.length + " FOR CONN: " + connectionId + "\\n"); //' server/routes/aamarvaRoutes.ts
sed -i 's/require("fs").appendFileSync("server-error.log", err.message + "\\n"); //' server/routes/aamarvaRoutes.ts
sed -i 's/require("fs").appendFileSync("server-log.log", "COMBINED LENGTH: " + combined.length + " FOR CONN: " + connectionId + " DB MESSAGES: " + dbMessages.length + "\\n"); //' server/services/connectionService.ts
