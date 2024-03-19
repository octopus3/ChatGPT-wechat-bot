import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as puppeteer from 'puppeteer';
// import * as HttpProxyAgent from 'http-proxy-agent';
// import * as fetchNode from 'node-fetch'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
let pathName = path.join(__dirname, `steamData.txt`)
let browser;
const steamId = "76561198341329027"


function writeSteamId(steamId) {
  if (fs.existsSync(pathName)) {
    let str = "," + steamId
    fs.appendFile(pathName, str, function (err) {
      if (err) {
        return console.log(err);
      }
      console.log("The file was appended!");
    })
  } else {
    fs.writeFile(pathName, steamId, function (err) {
      if (err) {
        return console.log(err);
      }
      console.log("The file was saved!");
    })
  }
}

function readSteamId() {
  if (fs.existsSync(pathName)) {
    fs.readFile(pathName, "utf8", async (errRead, data) => {
      if(errRead) {
        return console.log(errRead)
      }
      console.log("data ==> ", data.split(","))
      browser = await puppeteer.launch({
        args: [`--proxy-server=127.0.0.1:7890`]
      })
      let steamIdSets = data.split(",")
      let userArr = []
      const pages = await Promise.all(steamIdSets.map(async (steamId) => {
        const page = await browser.newPage()
        await page.goto('https://steamcommunity.com/profiles/' + steamId)
        return page
      }))
      for(const page of pages) {
        await page.bringToFront()
        let userObj = {name: '', status: '', playing: ''}
        let nameElement = await page.$(".actual_persona_name")
        let name = await page.evaluate(el => {
          return {
            "text": el.textContent,
            "className": el.className
          }
        }, nameElement)
        userObj.name = name.text.trim()
        // let profile_in_game_header = await page.$(".profile_in_game_header")
        // let profile_in_game_name = await page.$(".profile_in_game_name")
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
          console.log( elObj.className + " ==> " + elObj.text.trim());
          // console.log("obj ==> ", userObj)
        }
        console.log("obj ==> ", userObj)
        page.close()
      }
      browser.close()
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
  fs.writeFile(pathName, list, function (err) {
    if (err) {
      return console.log(err);
    }
    console.log("The file was saved!");
  })
}

// writeSteamId(steamId)
async function whoPlayGame(steamId) {
  browser = await puppeteer.launch({
    args: [`--proxy-server=127.0.0.1:7890`]
  })
  const page1 = await browser.newPage();
  // await page1.authenticate();
  await page1.goto('https://steamcommunity.com/profiles/' + steamId);
  await page1.screenshot({ path: "example.png" });
  let nameElement = await page1.$(".actual_persona_name")
  let profile_in_game_header = await page1.$(".profile_in_game_header")
  let profile_in_game_name = await page1.$(".profile_in_game_name")
  let elements = await page1.$$('.actual_persona_name,.profile_in_game_header,.profile_in_game_name')
  let name = await page1.evaluate(el => {
    return el.textContent
  }, nameElement)
  let status = await page1.evaluate(el => el.textContent, profile_in_game_header)
  let playingGame = await page1.evaluate(el => el.textContent, profile_in_game_name)

  for (let element of elements) {
    const text = await page1.evaluate(el => el.textContent, element);
    console.log("循 ==> " + text.trim());
  }
  console.log("名字：" + name + " 状态：" + status + " 玩：" + playingGame.trim())
  await browser.close();
  // 创建一个匿名的浏览器上下文
  //  const browserContext = await browser.createIncognitoBrowserContext();

}

readSteamId();

// writeSteamId2Array([ '76561198341329027', '76561198354830976', '76561198127611477' ])
