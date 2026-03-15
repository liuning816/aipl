import axios from "axios";
import userManager from "../utils/userManager";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

function translate(text, toLang) {
  return new Promise((resolve, reject) => {
    axios.defaults.baseURL = API_BASE;
    userManager.applyAuthHeader(axios);

    axios({
      method: "POST",
      url: "/api/translate",
      // data: { text, toLang },
      data: { textArr: text, toLang },
      withCredentials: true,
    })
      .then((res) => {
        resolve(res);
      })
      .catch((err) => {
        console.log("Error Translating:", err);
        resolve(text);
      });
  });
}

async function translateObj(obj, toLang, final_arr = []) {
  return new Promise(async (resolve, reject) => {
    // 递归遍历对象,收集所有文本
    const textArray = [];
    const collectTexts = (o) => {
      for (let key in o) {
        if (typeof o[key] === 'string') {
          textArray.push(o[key]);
        } else if (typeof o[key] === 'object') {
          collectTexts(o[key]);
        }
      }
    };
    collectTexts(obj);
      
    // 调用翻译API
    try {
      const response = await axios.post('/api/translate', {
        textArr: textArray,
        toLang: toLang
      });
        
      // 将翻译结果映射回对象
      let index = 0;
      const replaceTexts = (o) => {
        for (let key in o) {
          if (typeof o[key] === 'string') {
            o[key] = response.data[index++];
          } else if (typeof o[key] === 'object') {
            replaceTexts(o[key]);
          }
        }
      };
      replaceTexts(obj);
      resolve(obj);
    } catch (err) {
      console.log("Translation error:", err);
      resolve(obj);
    }
  });
}

async function translateLocalStorage(key, toLang) {
  let itm = JSON.parse(localStorage.getItem(key)) || {};
  translateObj(itm, toLang).then((data) => {
    localStorage.setItem(key, data);
  });
}

export { translate, translateObj, translateLocalStorage };
