import { WechatyBuilder } from "wechaty";
import qrcodeTerminal from "qrcode-terminal";
import config from "./config.js";
import ChatGPT from "./chatgpt.js";
import ChatGPT4 from "./chatgpt4.js"

let bot: any = {};
const startTime = new Date();
let chatGPTClient: any = null;
let chatGPTClient4: any = null;

initProject();
async function onMessage(msg) {
  // 避免重复发送
  if (msg.date() < startTime) {
    return;
  }
  const contact = msg.talker();
  const receiver = msg.to();
  const content = msg.text().trim();
  const room = msg.room();
  const roomId = msg.roomId;
  const alias = (await contact.alias()) || (await contact.name());
  const isText = msg.type() === bot.Message.Type.Text;
  const isImage = msg.type() == bot.Message.Type.Image;
  const isAttachment = msg.type() == bot.Message.Type.Attachment;
  if (msg.self()) {
    return;
  }
  // console.log("talk type ==> " + msg.type() + " msg ==> " + content)
  // console.log("bot.Message.Type ==> " + JSON.stringify(bot.Message.Type));
  if (room && isText) {
    const topic = await room.topic();
    // console.log("msg ==> " + msg.room() + " msg ==> " + JSON.stringify(msg))
    console.log(
      `Group name: ${topic} talker: ${await contact.name()} content: ${content}`
    );
    const pattern = RegExp(`^@${receiver.name()}\\s+${config.groupKey}[\\s]*`);
    const pattern4 = RegExp(`^@${receiver.name()}\\s+GPT4[\\s]*`);
    if (await msg.mentionSelf()) {
      if(pattern4.test(content)) {
        const groupContent = content.replace(pattern4, "");
        chatGPTClient4.replyMessage(room, groupContent);
        return;
      } else if (pattern.test(content)) {
        const groupContent = content.replace(pattern, "");
        chatGPTClient.replyMessage(room, groupContent);
        return;
      } else {
        console.log(
          "Content is not within the scope of the customizition format"
        );
      }
    }else {
      const pattern1 = RegExp(`^更换群名[\\s]*`);
      if(pattern1.test(content)) {
        const groupContent = content.replace(pattern1, "");
        chatGPTClient.changeRoomName(room, groupContent);
        return;
      }
      if(content == "[收到了一个表情，请在手机上查看]") {
        room.imgStr = '';
      }
      chatGPTClient.repeatMsg(room, content, await contact.name(), roomId);
    }
  } else if(room && isImage) {
    let regPatternt = /cdnurl[\s]*=[\s]*"(.*?)"/;

    if(content.match(regPatternt)) {
      let imgStr:String = "";
      imgStr = content.match(regPatternt)[1]
      imgStr = imgStr.replace(/&amp;amp;/g, "&")
      room.imgStr = imgStr
    }else {
      room.imgStr = ""
    }
  }else if(room && isAttachment) {
    let regPatternt1 = /https:\/\/b23\.tv[^<]+&lt;\/url&gt;/;
    if(content.match(regPatternt1)) {
      let bvStrUrl = content.match(regPatternt1)[0]
      bvStrUrl = bvStrUrl.replace(/&amp;amp;/g, "&")
      bvStrUrl = bvStrUrl.replace('&lt;\/url&gt;', "")
      console.log("bvStrUrl ==> " + bvStrUrl)
      room.bvStrUrl = bvStrUrl
    }else {
      room.bvStrUrl = ""
    }
  }else if (isText) {
    console.log(`talker: ${alias} content: ${content}`);
    if(content == "[收到了一个表情，请在手机上查看]") {
      contact.imgStr = '';
    }
    const cos = RegExp(`^cos$`)
    if(cos.test(content)) {
      chatGPTClient.coser(contact)
      return
    }
    if (content.startsWith(config.privateKey) || config.privateKey === "") {
      let privateContent = content;
      if (config.privateKey === "") {
        if(content.startsWith("GPT4 ")) {
          privateContent = content.split(" ")[1].trim();
          chatGPTClient4.replyMessage(contact, privateContent);
        }else {
          privateContent = content.substring(config.privateKey.length).trim();
          chatGPTClient.replyMessage(contact, privateContent);
        }
      }
    } else {
      console.log(
        "Content is not within the scope of the customizition format"
      );
    }
  }else if(isImage) {
    let regPatternt = /cdnurl[\s]*=[\s]*"(.*?)"/;

    if(content.match(regPatternt)) {
      let imgStr:String = "";
      imgStr = content.match(regPatternt)[1]
      imgStr = imgStr.replace(/&amp;amp;/g, "&")
      contact.imgStr = imgStr
      chatGPTClient.repeatSaveImage(contact)
    }else {
      contact.imgStr = ""
    }

  }else if(isAttachment) {
    let regPatternt1 = /https:\/\/b23\.tv[^<]+&lt;\/url&gt;/;
    if(content.match(regPatternt1)) {
      let bvStrUrl = content.match(regPatternt1)[0]
      console.log("bvStrUrl ==> " + bvStrUrl)
      bvStrUrl = bvStrUrl.replace(/&amp;amp;/g, "&")
      bvStrUrl = bvStrUrl.replace('&lt;\/url&gt;', "")
      contact.bvStrUrl = bvStrUrl
      chatGPTClient.getShare2BV(contact)
    }else {
      contact.bvStrUrl = ""
    }
  }
}

function onScan(qrcode) {
  qrcodeTerminal.generate(qrcode, { small: true }); // 在console端显示二维码
  const qrcodeImageUrl = [
    "https://api.qrserver.com/v1/create-qr-code/?data=",
    encodeURIComponent(qrcode),
  ].join("");

  console.log(qrcodeImageUrl);
}

async function onLogin(user) {
  console.log(`${user} has logged in`);
  const date = new Date();
  console.log(`Current time:${date}`);
}

function onLogout(user) {
  console.log(`${user} has logged out`);
}

function onPeopleJoin(room, inviteeList, inviter) {
    // room.say("")
}

async function initProject() {
  try {
    chatGPTClient = new ChatGPT();
    chatGPTClient4 = new ChatGPT4();
    bot = WechatyBuilder.build({
      name: "WechatEveryDay",
      puppet: "wechaty-puppet-wechat", // 如果有token，记得更换对应的puppet
      puppetOptions: {
        uos: true,
      },
    });

    bot
      .on("scan", onScan)
      .on("login", onLogin)
      .on("logout", onLogout)
      .on("message", onMessage);

    bot
      .start()
      .then(() => console.log("Start to log in wechat..."))
      .catch((e) => console.error(e));
  } catch (error) {
    console.log("init error: ", error);
  }
}
