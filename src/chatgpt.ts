import { ChatGPTClient } from "@waylaidwanderer/chatgpt-api";
import fetch from 'node-fetch';
import config from "./config.js";
const bili_ticket = 'eyJhbGciOiJIUzI1NiIsImtpZCI6InMwMyIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3MTA1NjI2OTUsImlhdCI6MTcxMDMwMzQzNSwicGx0IjotMX0.xYnAM_9zoF5lp9RNgZK695uG4ef8zODXN-v3e5-j9s0'
const SESSDATA = '34a54340%2C1725855486%2Cdb7f7%2A31CjDRwIgchKMBgMzdNUcXEKFAtFcNdY9nW1STV9E2GxzY5kSD8HUZlZaqemMuqykz8i8SVmhHRGJRZXRaUm5pVUdyX0VINGFQZXMwd0NyZ0NPdFQycmJpVWxsc0RJUlViZ2ozVTZ4Y0k0T3lxamNfazFPNk1ieURyOGVLUFpQejd4WEk5WG94dmFRIIEC'

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

export default class ChatGPT {
  private chatGPT: any;
  private chatOption: any;
  private chatVideoSummary: any;
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


  async repeatMsg(contact, content) {
    const { id: contactId, imgStr, bvStrUrl } = contact;
    const pattern1 = RegExp(`^.+[\(|（]$`);
    const saveImage = RegExp(`^保存表情`);
    const summaryVideo = RegExp(`^总结视频`);
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
    }else if(summaryVideo.test(content)) {
      // 总结视频
      try {
        if(bvStrUrl == null || bvStrUrl == '' || bvStrUrl == undefined) {
          await contact.say("该视频内容无法总结")
        }else {
          this.getShare2BV(contact)
        }
      }catch(e) {

      }
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

  // // 视频总结
  getShare2BV(contact) {
    const { id: contactId, bvStrUrl } = contact;
    fetch(bvStrUrl, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    }).then(res => {
      res.text().then(res1 => {
        let matchResult = res1.match(/content="https:\/\/www.bilibili.com\/video\/([^/]+)\/"/)
        if (matchResult) {
          let bvid = matchResult[1]
          console.log("bvid ==> " + bvid)
          this.summaryFetch(bvid, contact)
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
            title
          } = videoInfo.data;

          const videoContexts = [{
            role: "user",
            content: `这是视频作者${owner.name}的${tname}视频，标题为${title}`
          }]
          fetch(`https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`, {
            method: "GET",
            headers: {
              "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              cookie: `bili_ticket=${bili_ticket}; SESSDATA=${SESSDATA}`,
            },
          }).then(detail => {
            detail.json().then(res => {
              let {
                subtitle
              } = res.data
              console.log("subtitle ==> " + JSON.stringify(res.data))
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
                      results[i] = `${secondsToMinutesAndSeconds(currentList[0].from)}-${secondsToMinutesAndSeconds(currentList[currentList.length - 1].to)}：`;
                      currentList.forEach((item) => (results[i] += item.content + ","));
                    }
                    console.log("results ==> " + results)
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
                            const result = "总结内容如下：" + `\n这个视频的作者是${owner.name}\n是${tname}类型的视频\n标题为${title}\n简介为${desc}` + "\n-----------\n" + content;
                            contact.say(result);
                            return;
                          } else {
                            let content = message.choices[0].message.content
                            const result = "总结内容如下：" + `\n这个视频的作者是${owner.name}\n是${tname}类型的视频\n标题为${title}\n简介为${desc}` + "\n-----------\n" + content;
                            contact.say(result);
                          }
                      })
                    })
                  })
                })
              } else {
                console.log("该BV号视频总结功能不适用")
                contact.say("该BV号视频总结功能不适用");
              }
            })
          })
        }
      })

    });
  }
}


const secondsToMinutesAndSeconds = (seconds) => {
  var minutes = Math.floor(seconds / 60);
  var remainingSeconds = Math.round(seconds % 60);
  return minutes + "分" + remainingSeconds + "秒";
};
