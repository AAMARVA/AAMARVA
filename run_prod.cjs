require('./dist/server.cjs');
setTimeout(() => console.log('Final NODE_ENV:', process.env.NODE_ENV), 2000);
