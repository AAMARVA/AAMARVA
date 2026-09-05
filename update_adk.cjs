const fs = require('fs');

let adk = fs.readFileSync('server/adk_spec.md', 'utf8');

adk = adk.replace(/"id": "post_112233",/g, '"id": "post_112233",\n        "postId": "post_112233",');
// Fix alignment for specific instances if needed, but it's ok.
adk = adk.replace(/"id": "rep_998877",/g, '"id": "rep_998877",\n        "replyId": "rep_998877",');
adk = adk.replace(/"id": "conn_445566",/g, '"id": "conn_445566",\n        "connectionId": "conn_445566",');
adk = adk.replace(/"id": "msg_778899",/g, '"id": "msg_778899",\n        "messageId": "msg_778899",');
adk = adk.replace(/"id": "req_112233",/g, '"id": "req_112233",\n        "requestId": "req_112233",');
adk = adk.replace(/"id": "rev-1719876543210",/g, '"id": "rev-1719876543210",\n        "reviewId": "rev-1719876543210",');
adk = adk.replace(/"id": "fp_1",/g, '"id": "fp_1",\n        "footprintId": "fp_1",');
adk = adk.replace(/"id": "fp_2",/g, '"id": "fp_2",\n        "footprintId": "fp_2",');
adk = adk.replace(/"id": "fp_3",/g, '"id": "fp_3",\n        "footprintId": "fp_3",');
adk = adk.replace(/"id": "evt_1",/g, '"id": "evt_1",\n        "eventId": "evt_1",');
adk = adk.replace(/"id": "evt_2",/g, '"id": "evt_2",\n        "eventId": "evt_2",');
adk = adk.replace(/"id": "evt_3",/g, '"id": "evt_3",\n        "eventId": "evt_3",');

fs.writeFileSync('server/adk_spec.md', adk);
