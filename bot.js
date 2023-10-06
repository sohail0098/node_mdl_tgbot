const { Telegraf, Markup } = require('telegraf')
const axios = require('axios')
const cheerio = require('cheerio');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) throw new Error('"BOT_TOKEN" env var is required!');

const delete_terms = ["Favorites", "Watchers", "Popularity", "Drama"];

const bot = new Telegraf(BOT_TOKEN);

const makeRequest = async (url) => {
    const axiosResponse = await axios.get(url, Headers = {"User-Agent": "Mozilla/5.0"})
    if (axiosResponse.status !== 200) {
        console.log("Error: " + axiosResponse.status)
        return
    }
    return await axiosResponse.data
}

var telegraph_token;

const createTelegraphAccount = async () => {
    return new Promise((resolve, _) => {
        let API_URL = "https://api.telegra.ph/createAccount?short_name=Suki&author_name=Suki-Des~&author_url=https://t.me/DramaSuki&return_access_token=true"
        axios.post(API_URL).then((response) => {
            telegraph_token = response.data.result.access_token
            return resolve(telegraph_token)
        })
    })
}

createTelegraphAccount().then((token) => {
    telegraph_token = token;
})

const fetchDramaDetails = async (drama_url) => {
    return new Promise((resolve, _) => {
        makeRequest(drama_url).then(async (data) => {
            let $ = cheerio.load(data)
            let json_data = {}
            let show_title = $("title").text().replace(" - MyDramaList", "")
            let show_image = $("meta[property='og:image']").attr("content")
            let trailer_id = $('button.btn-trailer').attr('data-id')
            let show_summary = $('div.show-synopsis').text().trim()
            let drama_details = $('ul.list.m-b-0')
            json_data["title"] = show_title
            json_data["image"] = show_image
            json_data["trailer_id"] = trailer_id
            drama_details.each((_, element) => { 
                $(element).find('li.list-item.p-a-0').each((_, element) => {
                    let elemenet_data = $(element).text().split(":")
                    json_data[elemenet_data[0].trim()] = elemenet_data[1].trim()
                })
            })
            if (show_summary !== '') {
                show_summary = show_summary.split('(Source')[0].trim()
                let tgraph = `[{"tag":"p","children":["╾────────────╼\\n"],"tag":"b","children":["Synopsis / Summary"]},{"tag":"p","children":["\\n╾────────────╼\\n"]},{"tag":"code","children":["${show_summary}"]},{"tag":"b","children":["\\n╾────────────╼\\n"]}]`
                // This was hell to figure out.. phew.. ☝️
                let tgraph_url = `https://api.telegra.ph/createPage?access_token=${telegraph_token}&title=${encodeURI(show_title)}&author_name=${encodeURI('Suki-Des~')}&content=${encodeURI(tgraph)}&return_content=true`
                await axios.post(tgraph_url).then((response) => {
                    json_data["summary"] = response.data.result.url
                })
            }
            delete_terms.forEach((element) => {
                delete json_data[element]
            })
            return resolve(json_data)
        })
    })
}

bot.start((ctx) => ctx.reply(
    `Hello ${ctx.message.from.first_name}!\n\n` + 
    `I am a bot that can <b>search for dramas</b> on <i>MyDramaList</i>.\n\n` +
    `To search for a drama, use the <b>/drama</b> command.\n\n` +
    `For example: <code>/drama Goblin</code>\n\n` +
    `Have fun!`, { parse_mode: 'HTML' }
))

bot.command('drama', async (ctx) => {
    let sterm = ctx.message.text.split(/\s(.*)/s)[1]
    if (!sterm) {
        ctx.reply('Please enter a search term')
        return
    }
    let mdl_base = 'https://mydramalist.com/search'
    let payload = {'q': sterm, 'adv': 'titles'}
    let baseurl = mdl_base + `?${new URLSearchParams(payload).toString()}`
    makeRequest(baseurl).then((data) => {
        let $ = cheerio.load(data)
        let search_results = $('div.box').slice(0, -3)
        let search_data = []
        search_results.each((index, element) => {
            let drama_title = $(element).find('h6.text-primary.title').text().trim()
            let drama_url = $(element).find('h6.text-primary.title').children('a').attr('href')
            let drama_rating = $(element).find('span.p-l-xs.score').text()
            if (drama_rating === '') drama_rating = 'N/A'
            let drama_description = $(element).find('span.text-muted').text()
            let drama_data = {
                "index": String(index + 1).padStart(2, '0'),
                "title": drama_title,
                "url_slug": drama_url,
                "rating": drama_rating,
                "description": drama_description,
            }
            search_data.push(drama_data)
        })
        msg_buttons = []
        search_data.forEach((element) => {
            msg_buttons.push(Markup.button.callback(`${element.title} | ${element.description}`, 'slug_' + element.url_slug))
        })
        let search_message = 'Please choose from the results.'
        return ctx.reply(
            search_message, 
            Markup.inlineKeyboard(msg_buttons, {columns: 1})
        )
    })
})

bot.action(/slug_(.*)/, async (ctx) => {
    let drama_url = 'https://mydramalist.com' + ctx.match[1]
    ctx.answerCbQuery("Processing...")
    let json_data = await fetchDramaDetails(drama_url)
    ctx.deleteMessage()
    let msg_caption = `<b>${json_data.title}</b>\n\n`
    const data = Object.fromEntries(Object.entries(json_data).slice(3))
    for (const [key, value] of Object.entries(data)) {
        msg_caption += `<b>${key}</b>: <code>${value}</code>\n`
    }
    let button2 = []
    if (json_data.summary) {
        button2.push(Markup.button.url("View Summary", json_data.summary))
    }
    if (json_data.trailer_id) {
        button2.push(Markup.button.callback("View Trailer", "trailer_" + json_data.trailer_id))
    }
    return ctx.replyWithPhoto( { url: json_data.image }, { caption: msg_caption, parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
        [Markup.button.url("View on MyDramaList", drama_url)],
        button2
    ])
    })
})

bot.action(/trailer_(.*)/, async (ctx) => {
    let trailer_id = ctx.match[1]
    let trailer_fetch_url = `https://mydramalist.com/v1/trailers/${trailer_id}?lang=en-US`
    ctx.answerCbQuery("Processing...")
    makeRequest(trailer_fetch_url).then((trailer_data) => {
        let caption = `🎬 <b>Trailer - ${trailer_data.trailer.title}</b>`
        if (trailer_data.trailer.year) caption += ` <b>(${trailer_data.trailer.year})</b>`
        if (trailer_data.trailer.content_type_name) caption += ` | <b>${trailer_data.trailer.content_type_name}</b>`
        ctx.replyWithVideo(trailer_data.trailer.trailer.source, { caption: caption, parse_mode: 'HTML', disable_notification: true, disable_web_page_preview: true})
    })
})

bot.botInfo = bot.telegram.getMe()
// Drop all pending updates/requests
axios.get(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`)
console.log("Bot Started!")
bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))