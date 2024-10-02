import { ChatGPTClient } from "@waylaidwanderer/chatgpt-api";
import fetch from 'node-fetch';
import config from "./config.js";
import puppeteer from 'puppeteer'
import fs from 'fs';
import path from 'path';
import { FileBox } from 'file-box'
import {throttle} from './utils.js'
import {fileURLToPath} from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let pathName = path.join(__dirname, '..', `steamData.txt`);
let pixivPath = path.join(__dirname, '..', 'pixiv_rank/');
let tempSearchPath = path.join(__dirname, '..', 'temp_file/')
let steamCookiePath = path.join(__dirname, '..', `steamCookie.txt`);
let biliPath = path.join(__dirname, "..", "bilibiliTicket.txt");
let pixivRank = path.join(__dirname, '..', 'pixiv_rank')
let createImg = path.join(__dirname, '..', 'create_img')
let browser;
let window:any;
const clientOptions = {
  // (Optional) Support for a reverse proxy for the completions endpoint (private API server).
  // Warning: This will expose your `openaiApiKey` to a third party. Consider the risks before using this.
  // reverseProxyUrl: "",
  // (Optional) Parameters as described in https://platform.openai.com/docs/api-reference/completions
  modelOptions: {
    // You can override the model name and any other parameters here, like so:
    model: "gpt-3.5-turbo",
    // model: "gpt-4",
    // I'm overriding the temperature to 0 here for demonstration purposes, but you shouldn't need to override this
    // for normal usage.
    temperature: 0,
    // Set max_tokens here to override the default max_tokens of 1000 for the completion.
    // max_tokens: 1000,
  },
  // (Optional) Davinci models have a max context length of 4097 tokens, but you may need to change this for other models.
  // maxContextTokens: 4097,
  // (Optional) You might want to lower this to save money if using a paid model like `text-davinci-003`.
  // Earlier messages will be dropped until the prompt is within the limit.
  // maxPromptTokens: 3097,
  // (Optional) Set custom instructions instead of "You are ChatGPT...".
  // promptPrefix: 'You are Bob, a cowboy in Western times...',
  // (Optional) Set a custom name for the user
  // userLabel: 'User',
  // (Optional) Set a custom name for ChatGPT
  // chatGptLabel: 'ChatGPT',
  // (Optional) Set to true to enable `console.debug()` logging
  debug: false,
};

const cacheOptions = {
  // Options for the Keyv cache, see https://www.npmjs.com/package/keyv
  // This is used for storing conversations, and supports additional drivers (conversations are stored in memory by default)
  // For example, to use a JSON file (`npm i keyv-file`) as a database:
  // store: new KeyvFile({ filename: 'cache.json' }),
};
const cmd = [`保存表情`, `总结视频`, `bv号总结 bv号`, `谁在玩游戏`, `绑定steam steamId`, `解绑steam`, `摸鱼日报`, `随机选择 选项1 选项2 ...`, '搜图 pixid', '日榜图', '约稿 提示词(英文)', '提示词' ];
const speakRuler = [`.+(\\(|（)$`];
export default class ChatGPT {
  private chatGPT: any;
  private chatOption: any;
  private chatVideoSummary: any;
  private myBroswer: any;
  public folderResult: any;
  public requestQueue:any[] = [];
  downloadedUrls = new Set();
  constructor() {
    this.chatGPT = new ChatGPTClient(
      config.OPENAI_API_KEY,
      {
        ...clientOptions,
        reverseProxyUrl: config.reverseProxyUrl,
      },
      cacheOptions
    );
    this.chatOption = {};
    this.chatVideoSummary = new ChatGPTClient(
      config.OPENAI_API_KEY,
      {
        ...clientOptions,
        reverseProxyUrl: config.reverseProxyUrl,
      },
      cacheOptions
    );
    this.coser = throttle(this.coser, 1000, this)
    this.animeReturn = throttle(this.animeReturn, 1000, this)
    let myResult = getFilesAndFoldersInDir(pixivRank)
    let tmpArr = []
    myResult.forEach(items => {
      console.log('items.name ==> ', items.name)
      items.children.forEach(item => {
        item.url = pixivRank + "/" + items.name + "/" + item.name
      })
      tmpArr = tmpArr.concat(items.children)
    })
    this.folderResult = tmpArr
    // this.test();
  }
  async test() {
    const response = await this.chatGPT.sendMessage("hello");
    console.log("response test: ", response);
  }
  async getChatGPTReply(content, contactId) {
    const data = await this.chatGPT.sendMessage(
      content,
      this.chatOption[contactId]
    );
    const { response, conversationId, messageId } = data;

    this.chatOption = {
      [contactId]: {
        conversationId,
        parentMessageId: messageId,
      },
    };
    console.log("chatOption ==> ", this.chatOption)
    console.log("gpt3.5 response: ", response);
    // response is a markdown-formatted string
    return response;
  }

  async replyMessage(contact, content) {
    const { id: contactId } = contact;
    try {
      if (
        content.trim().toLocaleLowerCase() ===
        config.resetKey.toLocaleLowerCase()
      ) {
        this.chatOption = {
          ...this.chatOption,
          [contactId]: {},
        };
        await contact.say("对话已被重置");
        return;
      }
      const message = await this.getChatGPTReply(content, contactId);

      if (
        (contact.topic && contact?.topic() && config.groupReplyMode) ||
        (!contact.topic && config.privateReplyMode)
      ) {
        const result = content + "\n-----------\n" + message;
        await contact.say(result);
        return;
      } else {
        await contact.say(message);
      }
    } catch (e: any) {
      console.error(e.message);
      await contact.say('哎呀，我好像猪脑过载啦，重新问其他问题吧')
      // if (e.message.includes("timed out")) {
      //   await contact.say(
      //     content +
      //       "\n-----------\nERROR: Please try again, ChatGPT timed out for waiting response."
      //   );
      // }
    }
  }


  async repeatMsg(contact, content, alias, roomId) {
    const { id: contactId, imgStr, bvStrUrl } = contact;
    const pattern1 = RegExp(`.+(\\(|（)$`);
    const saveImage = RegExp(`^保存表情$`);
    const summaryVideo = RegExp(`^总结视频$`);
    const waitTimeVideo = RegExp(`^省流$`);
    const bvSummary = RegExp(`^bv号总结[\\s]+`);
    const steamChecker = RegExp(`^谁在玩游戏$`);
    const steamBind = RegExp(`^绑定steam[\\s]+`)
    const steamNotBind = RegExp(`^解绑steam[\\s]+`);
    const howToDo = RegExp(`.*怎么办.*`);
    const drinkSth = RegExp(`^喝什么`);
    const randomSelect = RegExp(`^随机选择[\\s]`);
    const updateSteamToken = RegExp(`更新SteamCookie[\\s]*`)
    const moyu = RegExp(`^摸鱼日报$`)
    const yuan = RegExp(`.*原[!|！]$`)
    const yuanAnime = RegExp(`^随机二次元$`)
    const cos = RegExp(`^cos$`)
    const searchPicReg = RegExp(`^搜图[\\s]+`)
    const unlock = RegExp('^解锁搜图')
    const picReg = RegExp('^日榜图$')
    const picUpdate = RegExp("^更新日榜图$")
    const sdImg = RegExp("^约稿")
    const tipsSearch = RegExp("^提示词")
    const help = "帮助";
    if(pattern1.test(content)){
      // 复读括号消息
      try {
        let msg = content.replace(/[\(|（]$/, ")");
        await contact.say(msg);
      }catch(e:any) {

      }
    }else if(saveImage.test(content)) {
      // 保存表情包链接
      try {
        if(imgStr == null || imgStr == '' || imgStr == undefined) {
          await contact.say("无法保存该类型表情")
        }else {
          await contact.say("已得到表情包链接\n下载后请自行修改文件后缀\n ------------------\n" + imgStr)
        }
      }catch(e:any) {

      }
    }else if(summaryVideo.test(content) || waitTimeVideo.test(content)) {
      // 总结视频
      try {
        if(bvStrUrl == null || bvStrUrl == '' || bvStrUrl == undefined) {
          await contact.say("该视频内容无法总结")
        }else {
          this.getShare2BV(contact)
        }
      }catch(e) {

      }
    }else if(bvSummary.test(content)) {
      try {
        let contents = content.replace(bvSummary, "");
        console.log("contents ==> ", contents);
        if(/BV.*/.test(contents)) {
          this.summaryFetch(contents, contact)
        }else {
          contact.say("请输入正确的bv号")
        }
      }catch(e) {
        console.log('e ==> ', e)
      }
    }else if(steamChecker.test(content)) {
      try {
        readSteamId(contact)
      }catch(e) {
        console.log('error ==> ' + e)
      }
    }else if(steamBind.test(content)) {
      let contents = content.replace(steamBind, "");
      if(contents.match(/^765611.*/) && contents.length == 17) {
        readSteamFile(contents, true, contact, alias)
      }else {
        contact.say("steamId格式错误无法绑定")
      }
    }else if(steamNotBind.test(content)) {
      let contents = content.replace(steamNotBind, "");
      readSteamFile(contents, false, contact, alias)
    }else if(howToDo.test(content)) {
      let filebox = FileBox.fromFile(path.join(__dirname, '..', `how.png`))
      await contact.say(filebox)
    }else if(drinkSth.test(content)) {
      this.drinkSomething(contact)
    }else if(randomSelect.test(content)) {
      let randomSelectStr = content.replace(randomSelect, "");
      this.randomSelect(contact, randomSelectStr)
    }else if(help == content) {
      this.writeCmd(contact);
    }else if(updateSteamToken.test(content)) {
      try {
        let cookie = content.replace(updateSteamToken, "");
        this.writeSteamCookie(contact, cookie, alias)
      }catch(e) {
        contact.say("error ==> ", e)
      }
    }else if(moyu.test(content)) {
      this.mole(contact)
    }else if(yuanAnime.test(content)) {
      this.animeReturn(contact, '')
    }else if(yuan.test(content)) {
      this.animeReturn(contact, '原')
    }else if(cos.test(content)) {
      this.coser(contact)
    }else if(searchPicReg.test(content)) {
      let pixivId = content.replace(searchPicReg, "");
      if(/^\d+$/.test(pixivId)) {
        this.searchPixiv(contact, pixivId)
      }else {
        contact.say('格式不对')
      }
    }else if(unlock.test(content)) {
      if(alias == "知更不咕鸟") {
        contact.isSearch = false
        contact.say('解锁完毕')
      }else {
        contact.say('？')
      }
    }else if(picReg.test(content)) {
      this.picRandom(contact)
    }else if(picUpdate.test(content)){
      this.updateDayPic(contact)
    }else if(sdImg.test(content)) {
      let params = content.replace(sdImg, "")
      this.text2Image(contact, params)
    }else {
      return;
    }
  }

  // 私聊
  async repeatSaveImage(contact) {
    const { id: contactId, imgStr } = contact;
    if(imgStr == null || imgStr == '' || imgStr == undefined) {
      await contact.say("无法保存该类型表情")
    }else {
      await contact.say("已得到表情包链接\n下载后请自行修改文件后缀\n ------------------\n" + imgStr)
    }
  }

  async changeRoomName(contact, content) {
    try {
      console.log(`${content}`)
      await contact.topic(content)
    }catch(e) {
      console.log("changeName err ==> " + e)
    }

  }

  // 视频总结
  getShare2BV(contact) {
    const { id: contactId, bvStrUrl } = contact;
    fetch(bvStrUrl, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    }).then(res => {
      res.text().then(res1 => {
        try {
          let matchResult = res1.match(/content="https:\/\/www.bilibili.com\/video\/([^/]+)\/"/)
          console.log("bvid ==> " + matchResult)
          if (matchResult) {
            let bvid = matchResult[1]
            console.log('vvid ==> ' + bvid)
            this.summaryFetch(bvid, contact)
          }else {
            contact.say("有视频咩？")
          }
        }catch(e) {
          console.log('e ==> ' + e)
        }

      })

    })
  }

  // 根据BV号拿到总结结果
  summaryFetch(bvid:string, contact) {
    const { id: contactId } = contact;
    fetch(
      "https://api.bilibili.com/x/web-interface/view?bvid=" + bvid
    ).then(res => {
      res.json().then(videoInfo => {
        if (videoInfo.data) {
          const {
            aid,
            cid,
            owner,
            desc,
            tname,
            pic,
            title
          } = videoInfo.data;
          if(pic != null) {
            let filebox = FileBox.fromUrl(pic);
            contact.say(filebox);
          }
          const videoContexts = [{
            role: "user",
            content: `这是视频作者${owner.name}的${tname}视频，标题为${title}`
          }]
          getBilibiliTicket().then((biliData:any) => {
            fetch(`https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`, {
              method: "GET",
              headers: {
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                cookie: `bili_ticket=${biliData.bili_ticket}; SESSDATA=${biliData.SESSDATA}`,
              },
            }).then(detail => {
              detail.json().then(res => {
                let {
                  subtitle
                } = res.data
                if (subtitle && subtitle.subtitles[0] && subtitle.subtitles[0].subtitle_url) {
                  fetch("https://" + subtitle.subtitles[0].subtitle_url).then(detailSubtitle => {
                    detailSubtitle.json().then(res => {
                      let list = res.body
                      const fragment = Math.ceil(Math.random() * (6 - 3 + 1)) + 3;
                      const fragmentLen = list.length / fragment;
                      let results: any[] = []
                      for (let i = 0; i < fragment; i++) {
                        results.push("");
                        const currentList = list.slice(fragmentLen * i, fragmentLen * (i + 1));
                        if(currentList.length) {
                          results[i] = `${secondsToMinutesAndSeconds(currentList[0].from)}-${secondsToMinutesAndSeconds(currentList[currentList.length - 1].to)}：`;
                          currentList.forEach((item) => (results[i] += item.content + ","));
                        }
                      }
                      results.forEach((item) => videoContexts.push({
                        role: "user",
                        content: item
                      }));

                      videoContexts.push({
                        role: "user",
                        content: "根据视频信息与字幕时间段，详细总结视频时间线与具体内容",
                      });
                      fetch("https://api.openai-proxy.com/v1/chat/completions", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "Authorization": "Bearer " + config.OPENAI_API_KEY
                          // 'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: JSON.stringify({
                          messages: videoContexts,
                          model: clientOptions.modelOptions.model,
                        })
                      }).then(res => {
                        res.json().then(message => {
                            console.log("fetch message ==> " + JSON.stringify(message.choices))
                            if ((contact.topic && contact?.topic() && config.groupReplyMode) || (!contact.topic && config.privateReplyMode)) {
                              let content = message.choices[0].message.content
                              const result = `标题：${title}\n作者：${owner.name}\n简介：${desc}\n` + "总结内容如下：" + "\n-----------\n" + content;
                              contact.say(result);
                              return;
                            } else {
                              let content = message.choices[0].message.content
                              const result = `标题：${title}\n作者：${owner.name}\n简介：${desc}\n` + "总结内容如下：" + "\n-----------\n" + content;
                              contact.say(result);
                            }
                        })
                      })
                    })
                  })
                } else {
                  console.log("该BV号视频总结功能不适用")
                  contact.say(`标题：${title}\n作者：${owner.name}\n简介：${desc}` + "\n-----------\n" + "该视频总结功能不适用");
                }
              }).catch(error => {
                console.log("json error ==> " + error)
              })
            }).catch(error => {
              console.log("error ==> " + error)
            })
          })

        }
      })

    });
  }

  // 喝什么
  drinkSomething(contact) {
    const drinkArr = ["查理宜世", "喜茶", "贡茶", "霸王茶姬", "瑞幸", "蜜雪冰城", "茶百道", "奈雪的茶"]
    let random = random_int(0, drinkArr.length - 1);
    contact.say("我觉得可以喝" + drinkArr[random])
  }

  randomSelect(contact, content) {
    let selectArr = content.split(" ");
    let random = random_int(0, selectArr.length - 1);
    contact.say("我选择" + selectArr[random])
  }

  writeCmd(contact) {
    let str = ''
    cmd.forEach((item, idx) => {
      if(str == '') {
        str = item
      }else {
        str += '\n' + item
      }
    })
    contact.say("我的命令有\n" + str)
  }

  writeSteamCookie(contact, cookie, name) {
    if(name == "知更不咕鸟") {
      if(fs.existsSync(steamCookiePath)) {
        fs.writeFile(steamCookiePath, cookie, function(err) {
          if (err) {
            contact.say(err)
            return console.log(err);
          }
          contact.say("写入完成啦")
        })
      }
    }else {
      contact.say("就你？你不行~")
    }

  }

  mole(contact) {
    fetch(`https://dayu.qqsuu.cn/moyuribao/apis.php?type=json`).then(html => {
      html.json().then(res => {
        console.log(" html ==> ", res)
        let filebox = FileBox.fromUrl(res.data)
        try {
          contact.say(filebox)
        }catch(e) {
          console.log(e)
          contact.say("这个图片打不开捏")
        }
      })
    })
  }

  async picRandom(contact) {
    try {
      let randomInt = random_int(0, this.folderResult.length - 1)
      console.log(this.folderResult[randomInt].url)
      let fileBox =  FileBox.fromFile(this.folderResult[randomInt].url)
      await contact.say(fileBox)
      await contact.say("pixivId: " + this.folderResult[randomInt].name.replace(".jpg", ""))
    }catch(e) {
      console.log('e ==> ', e)
    }

  }

  animeReturn(contact, type) {
    return
    let url = `https://api.52vmy.cn/api/img/tu/man`
    if(type == '原') {
      url = `https://api.52vmy.cn/api/img/tu/yuan`
    }
    fetch(url).then(html => {
      html.json().then(res => {
        let filebox = FileBox.fromUrl(res.url, random_int(0, 2000) + '.png')
        try {
          contact.say(filebox)
        }catch(e) {
          console.log(e)
          contact.say("这个图片打不开捏")
        }
      })
    })
  }

  coser(contact) {
    // contact.say("收手啦，阿祖")
    return
    fetch(`https://api.qvqa.cn/cos/?type=json`).then(html => {
      html.json().then(res => {
        let filebox = FileBox.fromUrl(res.data.msg)
        try {
          contact.say(filebox)
        }catch(e) {
          console.log(e)
          contact.say("这个打不开捏")
        }
      })
    })
  }

  async searchPixiv(contact, pixivId) {
    if(contact.isSearch == true) {
      contact.say("在查啦，再等一下下啦~")
      return
    }
    contact.processingQueue = false
    contact.activeImageRequests = 0
    if(!this.myBroswer) {
      this.myBroswer = await puppeteer.launch({
        args: [`--proxy-server=127.0.0.1:7890`],
        userDataDir: '/tmp/chromeSession',
        ignoreDefaultArgs:['--enable-automation'],
        headless: true
      })
    }
    let fileName = ''
    const imgUrlReg = new RegExp(`^https:\/\/i.pximg.net\/img-master\/.*`)
    if(contact.page) {
      contact.isSearch = true
      this.openNewPage(contact, pixivId)
    }else {
      contact.page = await this.myBroswer.newPage();
      contact.page.on('response', async (respond) => {
        // let url = respond.url()
        // if(respond.request().resourceType() == 'image') {
        //   if(imgUrlReg.test(url)) {
        //     console.log("imgUrlReg ==> ", url)
        //     const buffer = await respond.buffer()
        //     const imgBase64 = buffer.toString('base64')
        //     let resultName = url.match(/\d+_p\d*.*\.jpg/);
        //     if(resultName) {
        //       fileName = resultName
        //     }else {
        //       fileName = pixivId + '.jpg'
        //     }
        //     console.log(tempSearchPath + fileName)
        //     await fs.promises.writeFile(tempSearchPath + fileName, imgBase64, 'base64')
        //     let filebox = FileBox.fromFile(tempSearchPath + fileName)
        //     await contact.say(filebox)
        //     contact.isSearch = false

        //   }
        // }
        this.handleResponse(contact, respond, pixivId);
      })
      this.openNewPage(contact, pixivId)
    }
  }

  async openNewPage(contact, pixivId) {
    try {
      let cookie = {
        name: 'PHPSESSID',
        domain: ".pixiv.net",
        path: "/",
        value: '19622961_eaGQhGtZN5BbUoHIebhV3PVzbrvU4iql'
      }
      await contact.page.setCookie(cookie)
      await contact.page.goto('https://www.pixiv.net/artworks/' + pixivId).catch(e => {
        console.log("timeout error ", e)
      })
      await contact.page.waitForSelector('.huVRfc', {timeout: 60000})
      let isNotFind = await contact.page.$('.title')
      let titleElement = await contact.page.$('.huVRfc')
      let tagElements = await contact.page.$$('.iWBYKe')
      let timeElement = await contact.page.$('.dqHJfP')
      let authorElement = await contact.page.$('.hgVjiW')
      let descElement = await contact.page.$('.llrjLt')
      let watchElement = await contact.page.$('.wEKy')
      // let paint = await page.$('.eMdOSW')
      let desc = null
      let tag = ""
      let title = await contact.page.evaluate(el => el.textContent, titleElement)
      let time = await contact.page.evaluate(el => el.textContent, timeElement)
      let author = await contact.page.evaluate(el => el.textContent, authorElement)
      if(descElement != null) {
        desc = await contact.page.evaluate(el => el.textContent, descElement)
      }

      for (let element of tagElements) {
        let elObj = await contact.page.evaluate(el => el.textContent, element)
        console.log("elObj ==> ", elObj)
        if(tag == '') {
          tag += elObj
        }else {
          tag += ',' + elObj
        }
      }

      await contact.say(`标题: ${title}\n上传时间: ${time}\n作者: ${author}\n简介: ${desc}\n标签: ${tag}`)
      console.log("title:", title, " time ==> ", time, " author ==> ", author, "desc ==>", desc)
      if(watchElement != null) {
        contact.isPicMuti = true
        // await contact.say('噢，这个作品好像还是多P的我再查查')
        // const newPagePromise = new Promise(x => this.myBroswer.once('targetcreated', target => x(target.page())));

        await watchElement.click()
        // let tmpPage = await newPagePromise;
        // // @ts-ignore
        // await tmpPage.evaluate(function() {
        //   // @ts-ignore
        //   let iKsoAtElements = document.getElementsByClassName('iKsoAt')
        //   let i = 0
        //   let timeSch = setInterval(() => {
        //     // @ts-ignore
        //     if(i < iKsoAtElements.length) {
        //       iKsoAtElements[i].scrollIntoView({ behavior: 'smooth' })
        //       i ++
        //     }else {
        //       clearInterval(timeSch)
        //     }
        //  }, 2000)
        // })
        if(!contact.tmpPage) {
          contact.tmpPage = await this.myBroswer.newPage()
        }
        contact.tmpPage.on('response', async (respond) => {
          this.handleResponse(contact, respond, pixivId);
        })
        contact.tmpPage.goto('https://www.pixiv.net/artworks/' + pixivId + '#1')
        await contact.tmpPage.waitFor(2000)
        let hgmpfkElement = await contact.tmpPage.$$('.hgmpfk')
        console.log('注入代码 ==> ' + hgmpfkElement.length)
        await contact.tmpPage.evaluate(function() {
          // @ts-ignore
          let iKsoAtElements = document.getElementsByClassName('iKsoAt')
          // @ts-ignore
          let eMdOSWElements = document.getElementsByClassName('eMdOSW')
          let i = 0
          let timeSch = setInterval(() => {
            // @ts-ignore
            if(i < eMdOSWElements.length) {
              eMdOSWElements[i].scrollIntoView({ behavior: 'smooth' })
              i ++
            }else {
              clearInterval(timeSch)
            }
         }, 2000)
        })
      }
    }
    catch(e) {
      console.log('error ==> ', e)
      contact.say(pixivId + ' 查无此图')
      contact.isSearch = false
    }
  }

  async handleResponse(contact, response, pixivId) {
    let url = response.url();
    const imgUrlReg = new RegExp(`^https:\/\/i.pximg.net\/img-master\/.*`)
    if (response.request().resourceType() === 'image' && imgUrlReg.test(url)) {
      if (!this.downloadedUrls.has(url)) {
        this.downloadedUrls.add(url);
        contact.activeImageRequests++;
        this.requestQueue.push({ contact, response, pixivId, url });
        this.processQueue(contact);
      }
    }
  }

  async processQueue(contact) {
    if (contact.processingQueue) return;

    contact.processingQueue = true;
    while (this.requestQueue.length > 0) {
      const { contact, response, pixivId, url } = this.requestQueue.shift();
      await this.processImage(contact, response, pixivId, url);
      // 每处理完一个请求，减去一个计数
    }
    contact.processingQueue = false;

    if (contact.activeImageRequests == 0) {
      this.onAllImagesProcessed(contact);
    }
  }

  onAllImagesProcessed(contact) {
    contact.isSearch = false;
    contact.say("所有图片已处理完毕！");
    // 这里可以执行所有图片请求处理完毕后的其他操作
  }

  async processImage(contact, response, pixivId, url) {
    const buffer = await response.buffer();
    const imgBase64 = buffer.toString('base64');
    let resultName = url.match(/\d+_p\d*.*\.jpg/);
    let fileName = resultName ? resultName[0] : `${pixivId}.jpg`;
    const filePath = path.join(tempSearchPath, fileName);

    // 检查文件是否已经存在
    if (!fs.existsSync(filePath)) {
      await fs.promises.writeFile(filePath, imgBase64, 'base64');
    }

    let filebox = FileBox.fromFile(filePath);
    await contact.say(filebox);
  }

  async updateDayPic(contact) {
    let myResult = getFilesAndFoldersInDir(pixivRank)
    let tmpArr = []
    myResult.forEach(items => {
      console.log('items.name ==> ', items.name)
      items.children.forEach(item => {
        item.url = pixivRank + "/" + items.name + "/" + item.name
      })
      tmpArr = tmpArr.concat(items.children)
    })
    this.folderResult = tmpArr
    await contact.say('更新完毕')
  }

  async searchMarjor(contact) {
    let browser = await puppeteer.launch({
      args: [`--proxy-server=127.0.0.1:7890`],
      userDataDir: '/tmp/chromeSession',
      headless: true,
      defaultViewport: {width: 1366, height: 1000}
    })
    const page = await browser.newPage();
    await page.goto('https://tiyu.baidu.com/al/major/home?match=2024%E5%B9%B4%E5%B7%B4%E9%BB%8E%E5%A5%A5%E8%BF%90%E4%BC%9A&tab=%E5%A5%96%E7%89%8C%E6%A6%9C')
    await page.evaluate(function() {
      let y = 3000
      window.scrollTo(0, y)
    })
    let gold;
    let silver;
    let copper;
    let total;
    let rank;
    let list:any = [];

    let rankElement = await page.$$('.rankContainer')
    for(let element of rankElement) {
      let txt = await page.evaluate(el => {
        return {
          "text": el.textContent,
          "className": el.className
        }
      }, element)
      let item = txt.text.split(' ')
      let myCountry = item[0].split(/\d/)
      let country = '';
      gold = item[1];
      silver = item[3];
      copper = item[5];
      total = item[6];
      myCountry.forEach(item => {
        country += item
      })
      list.push({
        country,
        gold,
        silver,
        copper,
        total
      })
    }
    let message = ''
    list.forEach((item, index) => {
      if(index == list.length - 1) {
        message += `${index + 1}  ${item.country}  金牌：${item.gold}  银牌：${item.silver}  铜牌:${item.copper} 总数:${item.total}`
      }else {
        message += `${index + 1}  ${item.country}  金牌：${item.gold}  银牌：${item.silver}  铜牌:${item.copper} 总数:${item.total}\n`
      }
    })

    await contact.say(message)
    await page.close()
    await browser.close()
    console.log('browser close!')
  }

  async text2Image(contact, params) {
    let cmd = params.split(" ");
    let number:Number = 1
    let prompt:String = ""
    let negative_prompt:String = "lowres,bad anatomy,bad hands,text,error,missing,fingers,extra digit,fewer digits,cropped,worst quality,low quality,normal quality,jpeg artifacts,signature,watermark,username,blurry,"
    let prompts = params.split(",")
    if(cmd[0] == '-n') {
      if(cmd[1] instanceof Number) {
        number = cmd[1]
        prompts = cmd[2]
      }else {
        contact.say("参数错误")
      }
    }
    prompts.forEach(item => {
      prompt += item + ','
    })
    let body = JSON.stringify({
      prompt,
      negative_prompt: negative_prompt,
      sampler_name: "Euler a",
      steps: 20,
      cfg_scale: 7,
      height: 512,
      width: 512,
      seed: -1,
      enable_hr: true,
      hr_scale: 2,
      denoising_strength: 0.7,
      hr_second_pass_steps: 20,
      hr_upscaler: "Latent",
      send_images: true,
      save_images: true
    })
    console.log('body ==> ', body)
    contact.say("正在生成中...")
    fetch(config.text2imgUrl, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        // 'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    }).then(html => {
      html.json().then(res => {
        if(res.images) {
          let images = res.images
          images.forEach(base64 => {
            let dataBuffer =  Buffer.from(base64, 'base64');
            let filename = new Date().getTime() + '.png'
            console.log('fileName', filename)
            let filePath = path.join(createImg, filename)
            fs.writeFile(filePath, dataBuffer, { encoding: 'base64' }, (err) => {
              if (err) {
                console.log(err);
              } else {
                console.log('文件保存成功');
                let fileBox = FileBox.fromFile(filePath)
                contact.say(fileBox)
              }
            });
          })
        }
      })
    })
  }
}

const secondsToMinutesAndSeconds = (seconds) => {
  var minutes = Math.floor(seconds / 60);
  var remainingSeconds = Math.round(seconds % 60);
  return minutes + "分" + remainingSeconds + "秒";
};

// 随机的生成[begin, end] 范围内的数据
function random_int(begin, end) {
  var num = begin + Math.random() * (end - begin + 1);
  num = Math.floor(num);
  if (num > end) {
      num = end;
  }
  return num;
}

async function writeSteamId(steamId, contact, name, readFileData) {
  let roomName = await contact.topic()
  if (fs.existsSync(pathName)) {
    console.log("readFileData ==> " + readFileData);
    let str = readFileData
    if(str == '') {
      str = roomName + ":" + name + ':' + steamId.replace("\n", "")
    }else {
      str += "," + roomName + ":" + name + ":" + steamId.replace("\n", "")
    }

    fs.writeFile(pathName, str, function (err) {
      if (err) {
        return console.log(err);
      }
      console.log("写入成功");
      contact.say('绑定成功')
    })
  } else {
    fs.writeFile(pathName, steamId, function (err) {
      if (err) {
        return console.log(err);
      }
      console.log("The file was saved!");
      contact.say('绑定成功')
    })
  }
}

function readSteamFile(steamId, isAdd, contact, name) {
  if (fs.existsSync(pathName)) {
    fs.readFile(pathName, "utf8", async (errRead, data) => {
      if(errRead) {
        return console.log(errRead)
      }
      try {
        let topicName = await contact.topic();
        let steamIdSets = data.split(",")
        if(isAdd) {
          let isBind = true
          for(let i = 0; i < steamIdSets.length; i ++) {
            let item = steamIdSets[i];
            let newArr = item.split(":")
             // 绑定操作并且绑定过了
            if(newArr[0] == topicName && newArr[2] == steamId) {
              contact.say("已经绑定过了")
              isBind = false;
            }
          }
          if(isBind) {
            writeSteamId(steamId, contact, name, data)
          }
        }else {
          let result = steamIdSets.filter(item => {
            let newArr = item.split(":")
            if(topicName == newArr[0] && name == newArr[1]) {
                return true
            }
            return false
          })
          if(result.length > 0) {
            let index = steamIdSets.findIndex(item => item == result[0])
            if(index != -1) {
              steamIdSets.splice(index, 1)
              console.log("result noadd ==> ", result)
              writeSteamId2Array(steamIdSets)
            }
          }else {
            contact.say("你根本没有绑定！");
          }

        }
      }catch(e) {
        console.log('readSteamFile error ==> ' + e)
      }
    })
  } else {
    writeSteamId(steamId, contact, name, '')
  }
}

async function readSteamId(contact) {
  let roomName = await contact.topic()
  if(contact.isReadSteamId == true) {
    contact.say("在查啦，再等一下下啦~")
    return
  }
  if (fs.existsSync(pathName)) {
    fs.readFile(pathName, "utf8", async (errRead, data) => {
      if(errRead) {
        return console.log(errRead)
      }
      fs.readFile(steamCookiePath, 'utf-8', async (steamError, steamCookie) => {
        if(steamError) {
          return console.log("steamError ==> " + steamError)
        }
        let repeatMsg = ""
        try {
          contact.isReadSteamId = true
          browser = await puppeteer.launch({
            args: [`--proxy-server=127.0.0.1:7890`]
          })
          let steamIdSets = data.split(",")

          if(steamIdSets.length > 0) {
            let userArr:any = []
            const pages = await Promise.all(steamIdSets.map(async (steamId) => {
              let userInfo = steamId.split(":")
              if(userInfo[0] == roomName) {
                console.log("steamId ==> ", steamId);
                let userObj = {name: '', status: '', playing: '', wechatName: "", topic: ""}
                const page = await browser.newPage()
                page.wechatName = userInfo[1]
                page.topic = userInfo[0]
                await page.bringToFront()
                let cookie = {
                  name: 'steamLoginSecure',
                  domain: "steamcommunity.com",
                  path: "/",
                  value: steamCookie.replace("\n", "")
                }
                await page.setCookie(cookie)
                await page.goto('https://steamcommunity.com/profiles/' + userInfo[2].replace("\n", ""), {'timeout': 60 * 1000})

                // 爬取信息
                let nameElement = await page.$(".actual_persona_name")
                // await page.waitForSelector('actual_persona_name')
                let name = await page.evaluate(el => {
                  return {
                    "text": el.textContent,
                    "className": el.className
                  }
                }, nameElement)
                userObj.name = name.text.trim()

                let elements = await page.$$('.profile_in_game_header,.profile_in_game_name')
                for (let element of elements) {
                  const elObj = await page.evaluate(
                    el => {
                      return {
                        "text": el.textContent,
                        "className": el.className
                      }
                    },
                    element);
                    if(elObj.className == 'actual_persona_name') {
                      userObj.name = elObj.text.trim()
                    }else if(elObj.className == 'profile_in_game_name') {
                      userObj.playing = elObj.text.trim()
                    }else if(elObj.className == "profile_in_game_header") {
                      userObj.status = elObj.text.trim()
                    }
                    userObj.wechatName = page.wechatName
                    userObj.topic = page.topic
                    console.log( userObj.name + " ==> " + elObj.text.trim());

                }
                // end
                userArr.push(userObj)
                await page.screenshot()
                console.log('page close')
                await page.close()
                return page
              }
            }))
            userArr.forEach(item => {
              if(item.topic == roomName) {
                if(item.playing) {
                  if(!item.playing.startsWith("上次在线")) {
                    if(repeatMsg == '') {
                      repeatMsg += item.wechatName + "正在玩:" + item.playing
                    }else {
                      repeatMsg += '\n' + item.wechatName + "正在玩:" + item.playing
                    }
                  }
                }else if(item.status == '当前在线'){
                  if(repeatMsg == '') {
                    repeatMsg += item.wechatName + item.status
                  }else {
                    repeatMsg += '\n' + item.wechatName + item.status
                  }
                }
              }
            })
            if(repeatMsg != '') {
              contact.say(repeatMsg)
            }else {
              contact.say("没有人在玩")
            }
            console.log(userArr)
            console.log('browser close')
            await browser.close()
          }
          contact.isReadSteamId = false
        }catch(e) {
          console.log('e ==> ' + e)
          contact.say("看不到谁在玩捏")
          if(browser) {
            await browser.close()
          }
          contact.isReadSteamId = false
        }finally {

        }
      })
    })
  }
}

function writeSteamId2Array(array) {
  let list = ''
  array.forEach(item => {
    if(list == '') {
      list += item
    }else {
      list += "," + item
    }
  })
  if(list == 'undefined') {
    list = ''
  }
  fs.writeFile(pathName, list, function (err) {
    if (err) {
      return console.log(err);
    }
    console.log("The file was saved!");
  })
}

function getBilibiliTicket() {
  return new Promise((resolve, reject) => {
    fs.readFile(biliPath, 'utf-8', async (err, biliData) => {
      if(err) {
        console.log("bilibili err ==> " + err)
        reject(err)
        return
      }
      let data = biliData.split("\n")
      console.log(data)
      resolve({SESSDATA: data[0], bili_ticket: data[1]})
    })
  })
}

function getFilesAndFoldersInDir(path) {
  const items = fs.readdirSync(path);
  const result:any[] = [];
  items.forEach(item => {
    const itemPath = `${path}/${item}`;
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      let data = {
        // 文件夹
        type: 'folder',
        name: item,
        children: null as any[] | null
      }
      let children = getFilesAndFoldersInDir(itemPath)
      if (children && children.length) {
        data.children = children
      }
      result.push(data);
    } else {
      // 文件
      result.push({
        type: 'file',
        name: item
      });
    }
  });
  return result;
}
