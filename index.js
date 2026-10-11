const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const express = require('express');

// Keep alive for Render
const app = express();
app.get('/', (req,res)=> res.send('Economics Bot Alive - 24/7'));
app.listen(10000, ()=> console.log('Web server on 10000'));

// Load JSON database
const DB = { '9th': {}, '10th': {} };
function loadDB(){
  for(let cls of ['9th','10th']){
    const dir = path.join(__dirname, 'data', cls);
    if(!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for(let f of files){
      const m = f.match(/chapter(\d+)_(short|long)/);
      if(!m) continue;
      const num = parseInt(m[1]); const type = m[2];
      if(!DB[cls][num]) DB[cls][num] = {short:[], long:[]};
      try{
        const data = JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
        DB[cls][num][type] = data;
      }catch(e){ console.log('Error loading', f); }
    }
  }
  console.log('DB Loaded:', Object.keys(DB['9th']).length+' 9th chapters,', Object.keys(DB['10th']).length+' 10th chapters');
}
loadDB();

const userState = {};

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] }
});

client.on('qr', qr => {
  console.log('SCAN THIS QR IN RENDER LOGS:');
  qrcode.generate(qr, {small:true});
});

client.on('ready', () => console.log('✅ Bot Ready in WhatsApp Groups!'));

client.on('message', async msg => {
  const chat = await msg.getChat();
  if(!chat.isGroup) return; // only groups

  const sender = msg.author || msg.from;
  const text = msg.body.toLowerCase().trim();

  // Trigger word
  if(text === 'economics'){
    userState[sender] = {step:'class'};
    return msg.reply(`*📚 Economics Bot*\n\nSelect Class:\n1️⃣ Type *9th*\n2️⃣ Type *10th*`);
  }

  const state = userState[sender];
  if(!state) return;

  if(state.step === 'class'){
    const cls = text.includes('10')? '10th' : '9th';
    state.cls = cls; state.step = 'chapter';
    const chList = Object.keys(DB[cls]).sort((a,b)=>a-b).join(', ');
    if(!chList) return msg.reply('No data found for '+cls);
    return msg.reply(`Class ${cls} - Available Chapters: ${chList}\n\nType chapter number (e.g. *1*)`);
  }

  if(state.step === 'chapter' &&!isNaN(text)){
    const num = parseInt(text);
    if(!DB[state.cls][num]) return msg.reply('❌ Chapter not found. Try again.');
    state.ch = num; state.step = 'type';
    const shortCount = DB[state.cls][num].short.length;
    const longCount = DB[state.cls][num].long.length;
    return msg.reply(`*Chapter ${num}*\nShort Questions: ${shortCount}\nLong Questions: ${longCount}\n\nType *short* or *long*`);
  }

  if(state.step === 'type' && (text === 'short' || text === 'long')){
    state.type = text;
    const list = DB[state.cls][state.ch][text];
    if(!list || list.length===0) return msg.reply('No '+text+' questions in this chapter');
    state.questions = list; state.step = 'question';
    let qList = list.map((item,i)=> `${i+1}. ${item.q}`).join('\n');
    // WhatsApp limit 4000 chars - split if needed
    if(qList.length > 3500) qList = qList.substring(0,3500)+'\n... (truncated, reply number)';
    return msg.reply(`*${text.toUpperCase()} QUESTIONS - Ch ${state.ch}*\nReply with number:\n\n${qList}`);
  }

  if(state.step === 'question' &&!isNaN(text)){
    const idx = parseInt(text)-1;
    const item = state.questions[idx];
    if(!item) return msg.reply('❌ Invalid number');
    const answer = `*Q: ${item.q}*\n\n*Answer:*\n${item.a}`;
    // Split long answers > 4000 chars
    if(answer.length > 4000){
      await msg.reply(answer.substring(0,4000));
      await msg.reply(answer.substring(4000,8000));
    } else {
      await msg.reply(answer);
    }
    delete userState[sender]; // reset
    return msg.reply(`✅ Done. Type *economics* for next question.`);
  }
});

client.initialize();