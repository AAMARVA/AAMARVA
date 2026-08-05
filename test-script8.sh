#!/bin/bash
sed -i 's/return combined;/require("fs").appendFileSync("server-log.log", "COMBINED LENGTH: " + combined.length + " FOR CONN: " + connectionId + " DB MESSAGES: " + dbMessages.length + "\\n"); return combined;/' server/services/connectionService.ts
