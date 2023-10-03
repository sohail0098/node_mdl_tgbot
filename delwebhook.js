const { Telegraf } = require('telegraf')
const axios = require('axios')

if (!process.env.BOT_TOKEN) throw new Error('"BOT_TOKEN" env var is required!');

const bot = new Telegraf(process.env.BOT_TOKEN)

bot.telegram.getWebhookInfo().then((response) => {
    console.log("Response:", response)
    console.log("Webhook URL:", response.url)})

axios.get(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`)