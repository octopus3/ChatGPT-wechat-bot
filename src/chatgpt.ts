import { ChatGPTClient } from "@waylaidwanderer/chatgpt-api";
import config from "./config.js";

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
    const { id: contactId, imgStr } = contact;
    const pattern1 = RegExp(`^.+[\(|（]$`);
    const saveImage = RegExp(`^保存表情`);
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
        await contact.say("已得到表情包链接\n下载后请自行修改文件后缀\n ------------------\n" + imgStr)
      }catch(e:any) {

      }
    }else {
      return;
    }
  }

  // 私聊
  async repeatSaveImage(contact) {
    const { id: contactId, imgStr } = contact;
    contact.say("已得到表情包链接\n下载后请自行修改文件后缀\n ------------------\n" + imgStr)
  }

  async changeRoomName(contact, content) {
    try {
      console.log(`${content}`)
      await contact.topic(content)
    }catch(e) {
      console.log("changeName err ==> " + e)
    }

  }
}
