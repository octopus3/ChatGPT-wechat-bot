export default {
  // 填入你的OPENAI_API_KEY
  OPENAI_API_KEY: "",
  // OPENAI_API_KEY: "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",
  // 反向代理地址，简单说就是你的在国外服务器地址，如何获取看README
  // 可换成你自己的，白嫖代理地址 https://ai.devtool.tech/proxy/v1/chat/completions
  // reverseProxyUrl: "https://ai.devtool.tech/proxy/v1/chat/completions",
  reverseProxyUrl: "https://api.openai-proxy.com/v1/chat/completions",
  // 在群组中设置唤醒微信机器人的关键词
  groupKey: "",
  // 在私聊中设置唤醒微信机器人的关键词
  privateKey: "",
  // 重置上下文的关键词，如可设置为reset
  resetKey: "reset",
  // 是否在群聊中带上提问的问题
  groupReplyMode: true,
  // 是否在私聊中带上提问的问题
  privateReplyMode: false,
  pixivAccount: "",
  pixivPwd: '',
  text2imgUrl: 'http://localhost:7860/sdapi/v1/txt2img'
};
