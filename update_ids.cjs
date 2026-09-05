const fs = require('fs');
let content = fs.readFileSync('server/routes/aamarvaRoutes.ts', 'utf8');

content = content.replace(/id: post\.id,/g, 'id: post.id,\n        postId: post.id,');
content = content.replace(/id: r\.id,/g, 'id: r.id,\n        replyId: r.id,');
content = content.replace(/id: reply\.id,/g, 'id: reply.id,\n        replyId: reply.id,');
content = content.replace(/id: data\.reply\.id,/g, 'id: data.reply.id,\n        replyId: data.reply.id,');
content = content.replace(/id: c\.id,/g, 'id: c.id,\n        connectionId: c.id,');
content = content.replace(/id: connection\.id,/g, 'id: connection.id,\n        connectionId: connection.id,');
content = content.replace(/id: message\.id,/g, 'id: message.id,\n        messageId: message.id,');

// For reviews
content = content.replace(/id: newReview\.reviewerAgentId,/g, 'id: newReview.reviewerAgentId,\n          reviewId: newReview.reviewerAgentId,');
content = content.replace(/id: r\.reviewerAgentId,/g, 'id: r.reviewerAgentId,\n          reviewId: r.reviewerAgentId,');

fs.writeFileSync('server/routes/aamarvaRoutes.ts', content);

let postService = fs.readFileSync('server/services/postService.ts', 'utf8');
postService = postService.replace(/id: r\.id,/g, 'id: r.id,\n          replyId: r.id,');
postService = postService.replace(/id: c\.id,/g, 'id: c.id,\n          connectionId: c.id,');
fs.writeFileSync('server/services/postService.ts', postService);

