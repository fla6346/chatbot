const axios = require('axios');
const { getModels } = require('../models/index.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;

async function askGemini(userMessage, senderInfo = 'Invitado', eventosContexto = "") {
  const candidates = ['gemini-2.0-flash-lite', 'gemini-2.5-flash'];
  const systemPrompt = `Eres el asistente virtual de la UNIFRANZ...\n${eventosContexto}`;

  for (const modelName of candidates) {
    const controller = new AbortController(); // Crear controlador
    const timeoutId = setTimeout(() => controller.abort(), 10000); // Programar cancelación

    try {
      const geminiModel = genAI.getGenerativeModel({ model: modelName });

      // Pasar la señal de cancelación a la API si el SDK lo soporta, 
      // o usar el race pero LIMPIANDO el timeout.
      const result = await geminiModel.generateContent(`${systemPrompt}\n\nPregunta: ${userMessage}`);
      
      clearTimeout(timeoutId); // <--- CRÍTICO: Detener el reloj si Gemini respondió
      return result.response.text();

    } catch (err) {
      clearTimeout(timeoutId); // Limpiar también en caso de error
      if (err.name === 'AbortError') console.error(`❌ Timeout en ${modelName}`);
      else console.error(`❌ Error en ${modelName}:`, err.message);
      continue;
    }
  }
  return "Servicio saturado, intenta en un momento.";
}
function getMessage() {
  try {
    return getModels()?.Message || null;
  } catch (_) {
    return null;
  }
}

const getMessages = async (req, res) => {
  try {
    const { platform, externalId } = req.params;
    res.json({ platform, externalId, messages: [] });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
};

const botStatus = (req, res) => {
  res.json({ status: 'online', platform: 'gemini', timestamp: new Date().toISOString() });
};

const telegramWebhook = async (req, res) => {
  const { message } = req.body;
  if (!message?.text) return res.sendStatus(200);

  const chatId = message.chat.id;
  const senderInfo = message.from?.username
    ? `@${message.from.username}`
    : (message.from?.first_name || 'Estudiante');

  try {
    const aiResponse = await askGemini(message.text, senderInfo);
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: aiResponse,
      parse_mode: 'Markdown',
    });
  } catch (error) {
    console.error('❌ telegramWebhook error:', error.message);
    // Opcional: Enviar un mensaje de "estoy ocupado" al usuario en Telegram
  }
  res.status(200).send('OK');
};

const whatsappWebhook = async (req, res) => {
  res.status(200).json({ received: true });
};

const appChat = async (req, res) => {
  try {
    const models = getModels();
    const {Evento, Message}= models
    const { message, sender = 'invitado' } = req.body;

        if (!message?.trim()) return res.status(400).json({ error: 'Mensaje vacío' });
    let eventosContexto = "";

    if (Evento) {
      try {
        const listaEventos = await Evento.findAll({
          where: { estado: 'activo' },
          limit: 5,
          attributes: ['nombreevento', 'fechaevento', 'descripcion', 'lugarevento']
        });

        if (listaEventos.length > 0) {
          eventosContexto = listaEventos.map(e => 
            `- ${e.nombreevento}: el ${e.fechaevento} en ${e.lugarevento}. Desc: ${e.descripcion}`
          ).join('\n');
        }
      } catch (dbErr) {
        console.error('⚠️ Error al consultar eventos:', dbErr.message);
        eventosContexto = "No hay eventos disponibles en este momento.";
      }
    }

    // 2. IMPORTANTE: Pasamos eventosContexto a la función askGemini
    const reply = await askGemini(
      message, 
      sender,
      eventosContexto // <--- Aquí es donde se la pasamos
    );

    // 3. Guardar en historial
    if (models.Message && sender !== 'invitado') {
      await models.Message.create({ sender, text: message, role: 'user', timestamp: new Date() });
      await models.Message.create({ sender, text: reply, role: 'bot', timestamp: new Date() });
    }

    res.json({ reply });

  } catch (error) {
    console.error('❌ Error en appChat:', error.message);
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  }
};

const getChatHistory = async (req, res) => {
  try {
    const Message = getMessage();
    const { email } = req.params;
    if (!email || email === 'invitado' || !Message) {
      return res.json({ messages: [] });
    }
    const messages = await Message.findAll({
      where: { sender: email },
      order: [['timestamp', 'ASC']],
      limit: 50,
      attributes: ['id', 'text', 'role', 'timestamp'],
    });
    res.json({
      messages: messages.map(m => ({
        id: m.id?.toString(),
        text: m.text,
        sender: m.role === 'user' ? 'user' : 'bot',
        timestamp: m.timestamp,
      })),
    });
  } catch (error) {
    console.error('❌ getChatHistory error:', error);
    res.status(500).json({ error: 'Error al cargar el historial' });
  }
};

module.exports = {
  getMessages,
  telegramWebhook,
  whatsappWebhook,
  botStatus,
  appChat,
  getChatHistory,
};