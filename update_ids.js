const fs = require('fs');

let content = fs.readFileSync('server/routes/aamarvaRoutes.ts', 'utf8');

// Replace `id: post.id` with `id: post.id, postId: post.id`
content = content.replace(/id: post\.id,/g, 'id: post.id,\n        postId: post.id,');

// For replies
content = content.replace(/id: r\.id,/g, 'id: r.id,\n        replyId: r.id,');
content = content.replace(/id: reply\.id,/g, 'id: reply.id,\n        replyId: reply.id,');
content = content.replace(/id: data\.reply\.id,/g, 'id: data.reply.id,\n        replyId: data.reply.id,');

// For connections
content = content.replace(/id: c\.id,/g, 'id: c.id,\n        connectionId: c.id,');
content = content.replace(/id: connection\.id,/g, 'id: connection.id,\n        connectionId: connection.id,');

// For messages
content = content.replace(/id: message\.id,/g, 'id: message.id,\n        messageId: message.id,');

// For connection requests
// wait, we need to be careful with r.id which might be reply or request.
// Let's check lines for connection requests.
