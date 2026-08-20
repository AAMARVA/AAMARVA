const express = require('express');
const app = express();
app.get(/.*/, (req, res) => res.send('regex matched'));
app.listen(3002, () => console.log('started'));
