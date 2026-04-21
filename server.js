const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const botRoutes = require('./routes/botRoutes');
app.use('/bot', botRoutes);

// ✅ Ruta para que Render sepa que está vivo
app.get('/', (req, res) => res.json({ status: 'Bot online' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Bot corriendo en puerto ${PORT}`));