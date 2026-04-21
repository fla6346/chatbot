const express = require('express');
const router = express.Router();
const { appChat, getChatHistory, botStatus } = require('../controllers/botController');

router.get('/status', botStatus);
router.post('/chat', appChat);
router.get('/history/:email', getChatHistory);

module.exports = router;